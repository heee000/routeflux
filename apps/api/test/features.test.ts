import { describe, expect, it } from "vitest";
import { extractTaskFeatures } from "../src/modules/routing/features.js";

describe("task feature extraction", () => {
  it("builds a normalized domain vector for coding requests", () => {
    const features = extractTaskFeatures([
      { role: "user", content: "Debug this TypeScript API and explain the database transaction bug." }
    ]);
    expect(features.primaryDomain).toBe("coding");
    expect(features.domainVector.coding).toBeGreaterThan(features.domainVector.general ?? 0);
  });

  it("raises difficulty for formal multi-constraint reasoning", () => {
    const easy = extractTaskFeatures([{ role: "user", content: "Say hello." }]);
    const hard = extractTaskFeatures([{
      role: "user",
      content: "Prove the theorem step by step, derive the integral, and optimize the result under at least three constraints: ∫ x² dx."
    }]);
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty + 0.2);
    expect(hard.signals).toContain("reasoning");
    expect(hard.signals).toContain("formal_math");
  });

  it("honors concise output intent", () => {
    const features = extractTaskFeatures([{ role: "user", content: "请用一句话简短回答这个问题。" }]);
    expect(features.predictedOutputTokens).toBe(192);
  });
});

