import { estimateMessageTokens, estimateTextTokens } from "./estimate.js";
import { analyzeDifficulty } from "./difficulty.js";
import { classifyDomains, DOMAIN_NAMES } from "./domain-classifier.js";
import type { TaskFeatures } from "./types.js";

export { DOMAIN_NAMES } from "./domain-classifier.js";

function messageText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const parts: string[] = [];
  for (const value of messages) {
    if (!value || typeof value !== "object") continue;
    const content = (value as Record<string, unknown>).content;
    if (typeof content === "string") parts.push(content);
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
          parts.push((part as Record<string, unknown>).text as string);
        }
      }
    }
  }
  return parts.join("\n");
}

function hasImage(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const content = (message as Record<string, unknown>).content;
    return Array.isArray(content) && content.some((part) => {
      if (!part || typeof part !== "object") return false;
      const record = part as Record<string, unknown>;
      return record.type === "image_url" || record.type === "input_image" || record.image_url !== undefined;
    });
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function predictOutputTokens(text: string, promptTokens: number, primaryDomain: string, difficulty: number): number {
  const concise = /(简短|简洁|一句话|只回答|brief|concise|one sentence|short answer)/i.test(text);
  const exhaustive = /(完整|详细|深入|全面|逐步|报告|论文|教程|complete|detailed|comprehensive|in-depth|tutorial|report)/i.test(text);
  if (concise) return 192;
  let predicted = 320 + promptTokens * 0.18 + difficulty * 700;
  if (primaryDomain === "code_generation" || primaryDomain === "code_debugging") predicted += 280;
  if (["creative_writing", "translation", "summarization"].includes(primaryDomain)) predicted += 360;
  if (exhaustive) predicted *= 1.65;
  const explicit = text.match(/(?:约|大约|不超过|within|about|around)\s*(\d{2,5})\s*(?:字|词|words?|tokens?)/i);
  if (explicit?.[1]) {
    const amount = Number(explicit[1]);
    predicted = /字|词|words?/i.test(explicit[0]) ? amount * 1.5 : amount;
  }
  return Math.round(clamp(predicted, 128, 8192));
}

export function extractTaskFeatures(
  messages: unknown,
  tools: unknown[] = [],
  domainHints: string[] = []
): TaskFeatures {
  const text = messageText(messages);
  const promptTokens = estimateMessageTokens(messages);
  const inferredHints = [
    ...domainHints,
    ...(hasImage(messages) ? ["multimodal"] : []),
    ...(tools.length ? ["agentic_task"] : [])
  ];
  const domains = classifyDomains(text, inferredHints);
  const primaryDomain = DOMAIN_NAMES.reduce((best, domain) => {
    return domains[domain] > domains[best] ? domain : best;
  }, DOMAIN_NAMES[0]);
  const difficulty = analyzeDifficulty(text, promptTokens);
  return {
    featureVersion: "domainrouter-12d-14d-v1",
    promptTokens,
    textTokens: estimateTextTokens(text),
    domainVector: domains,
    primaryDomain,
    difficulty: difficulty.score,
    difficultyTier: difficulty.tier,
    difficultyDimensions: difficulty.dimensions,
    predictedOutputTokens: predictOutputTokens(text, promptTokens, primaryDomain, difficulty.score),
    signals: difficulty.signals
  };
}
