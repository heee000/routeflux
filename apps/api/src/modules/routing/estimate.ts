export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const nonCjk = text.length - cjk;
  return Math.ceil(cjk / 1.5 + nonCjk / 4);
}

export function estimateMessageTokens(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  let total = 3;
  for (const item of messages) {
    if (!item || typeof item !== "object") continue;
    const message = item as Record<string, unknown>;
    total += 4 + estimateTextTokens(String(message.role ?? ""));
    if (typeof message.content === "string") {
      total += estimateTextTokens(message.content);
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (!part || typeof part !== "object") continue;
        const value = part as Record<string, unknown>;
        if (typeof value.text === "string") total += estimateTextTokens(value.text);
        if (value.type === "image_url") total += 765;
      }
    }
  }
  return total;
}

