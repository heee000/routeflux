import { describe, expect, it } from "vitest";
import { extractTaskFeatures } from "../src/modules/routing/features.js";

describe("task feature extraction", () => {
  it("builds a normalized domain vector for coding requests", () => {
    const features = extractTaskFeatures([
      { role: "user", content: "Debug this TypeScript API and explain the database transaction bug." }
    ]);
    expect(features.primaryDomain).toBe("code_debugging");
    expect(features.domainVector.code_debugging).toBeGreaterThan(features.domainVector.factual_qa ?? 0);
    expect(Object.keys(features.domainVector)).toHaveLength(12);
  });

  it("raises difficulty for formal multi-constraint reasoning", () => {
    const easy = extractTaskFeatures([{ role: "user", content: "Say hello." }]);
    const hard = extractTaskFeatures([{
      role: "user",
      content: "Prove the theorem step by step, derive the integral, and optimize the result under at least three constraints: ∫ x² dx."
    }]);
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty + 0.2);
    expect(hard.difficultyTier).toBe("REASONING");
    expect(hard.difficultyDimensions).toHaveLength(14);
    expect(hard.signals.some((signal) => signal.startsWith("reasoningMarkers:"))).toBe(true);
  });

  it("honors concise output intent", () => {
    const features = extractTaskFeatures([{ role: "user", content: "请用一句话简短回答这个问题。" }]);
    expect(features.predictedOutputTokens).toBe(192);
  });

  it("keeps factual questions simple and implementation work above simple", () => {
    const factual = extractTaskFeatures([{ role: "user", content: "What is the capital of France?" }]);
    const implementation = extractTaskFeatures([{ role: "user", content: "Implement a TypeScript function for binary search." }]);
    expect(factual.difficultyTier).toBe("SIMPLE");
    expect(implementation.difficultyTier).not.toBe("SIMPLE");
  });

  it.each([
    ["Translate this paragraph into Chinese.", "translation"],
    ["Summarize the document into key points.", "summarization"],
    ["Design a distributed high availability architecture.", "system_design"]
  ])("classifies %s as %s", (prompt, domain) => {
    expect(extractTaskFeatures([{ role: "user", content: prompt }]).primaryDomain).toBe(domain);
  });

  it("adds explicit multimodal and agentic evidence", () => {
    const features = extractTaskFeatures([{
      role: "user",
      content: [{ type: "text", text: "Inspect this" }, { type: "image_url", image_url: { url: "x" } }]
    }], [{ type: "function", function: { name: "inspect" } }]);
    expect(features.domainVector.multimodal).toBeGreaterThan(0.5);
    expect(features.domainVector.agentic_task).toBeGreaterThan(0.5);
    expect(features.featureVersion).toBe("domainrouter-12d-14d-v1");
  });
});

