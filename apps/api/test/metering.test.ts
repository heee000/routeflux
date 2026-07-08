import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createUsageMeter, usageFromJson } from "../src/modules/usage/metering.js";

describe("usage metering", () => {
  it("estimates only generated content when JSON usage is absent", () => {
    const compact = usageFromJson(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "hello" } }]
    }), 10);
    const metadataHeavy = usageFromJson(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "hello", annotations: ["x".repeat(5_000)] } }]
    }), 10);
    expect(metadataHeavy).toEqual(compact);
  });

  it("preserves UTF-8 characters split across stream chunks", async () => {
    const completed = vi.fn();
    const meter = createUsageMeter(12, async (usage) => {
      completed(usage);
    }, (error) => {
      throw error;
    });
    meter.resume();
    const event = Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: "你" } }] })}\n\n`);
    const character = Buffer.from("你");
    const offset = event.indexOf(character);
    meter.write(event.subarray(0, offset + 1));
    meter.end(event.subarray(offset + 1));
    await once(meter, "finish");
    expect(completed).toHaveBeenCalledOnce();
    expect(completed.mock.calls[0]![0].promptTokens).toBe(12);
    expect(completed.mock.calls[0]![0].completionTokens).toBeGreaterThan(0);
  });
});
