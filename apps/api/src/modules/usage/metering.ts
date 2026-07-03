import { Transform, type TransformCallback } from "node:stream";
import { estimateTextTokens } from "../routing/estimate.js";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

function readUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = (value as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  const promptTokens = Number(record.prompt_tokens);
  const completionTokens = Number(record.completion_tokens);
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  return { promptTokens, completionTokens };
}

export function usageFromJson(body: string, promptFallback: number): TokenUsage {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const reported = readUsage(parsed);
    if (reported) return reported;
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    const text = choices
      .map((choice) => {
        if (!choice || typeof choice !== "object") return "";
        const message = (choice as Record<string, unknown>).message;
        if (!message || typeof message !== "object") return "";
        return JSON.stringify(message);
      })
      .join("");
    return { promptTokens: promptFallback, completionTokens: estimateTextTokens(text) };
  } catch {
    return { promptTokens: promptFallback, completionTokens: 0 };
  }
}

export function createUsageMeter(
  promptFallback: number,
  onComplete: (usage: TokenUsage) => Promise<void>,
  onError: (error: unknown) => void
): Transform {
  let pending = "";
  let generated = "";
  let reported: TokenUsage | null = null;

  const parseLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const event = JSON.parse(data) as Record<string, unknown>;
      reported = readUsage(event) ?? reported;
      const choices = Array.isArray(event.choices) ? event.choices : [];
      for (const choice of choices) {
        if (!choice || typeof choice !== "object") continue;
        const delta = (choice as Record<string, unknown>).delta;
        if (!delta || typeof delta !== "object") continue;
        const record = delta as Record<string, unknown>;
        if (typeof record.content === "string") generated += record.content;
        if (record.tool_calls) generated += JSON.stringify(record.tool_calls);
      }
    } catch {
      // Ignore non-JSON SSE fields from providers.
    }
  };

  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      this.push(chunk);
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      lines.forEach(parseLine);
      callback();
    },
    flush(callback: TransformCallback) {
      if (pending) parseLine(pending);
      const usage = reported ?? {
        promptTokens: promptFallback,
        completionTokens: estimateTextTokens(generated)
      };
      void onComplete(usage).then(() => callback()).catch((error: unknown) => {
        onError(error);
        callback();
      });
    }
  });
}

