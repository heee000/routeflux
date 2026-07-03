import { describe, expect, it } from "vitest";
import type { RoutedModel } from "../src/modules/catalog/types.js";
import { route } from "../src/modules/routing/router.js";

function model(overrides: Partial<RoutedModel>): RoutedModel {
  return {
    id: crypto.randomUUID(),
    providerId: "provider-1",
    slug: "test-model",
    upstreamModel: "test-model",
    displayName: "Test Model",
    enabled: true,
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    inputPricePerMillion: 1,
    outputPricePerMillion: 2,
    supportsTools: true,
    supportsVision: false,
    supportsJson: true,
    domains: {},
    metadata: { qualityScore: 0.7, latencyMs: 1000 },
    provider: {
      id: "provider-1",
      slug: "provider",
      displayName: "Provider",
      baseUrl: "https://example.com/v1",
      apiKeyCiphertext: "encrypted",
      enabled: true,
      priority: 100,
      timeoutMs: 60_000
    },
    ...overrides
  };
}

describe("route", () => {
  it("honors explicit model selection", () => {
    const selected = model({ slug: "manual" });
    const decision = route([selected], {
      requestedModel: "manual",
      promptTokensEstimate: 100,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false
    });
    expect(decision.selected.slug).toBe("manual");
    expect(decision.mode).toBe("manual");
  });

  it("selects the cheapest eligible model", () => {
    const cheap = model({ slug: "cheap", inputPricePerMillion: 0.1, outputPricePerMillion: 0.2 });
    const costly = model({ slug: "costly", inputPricePerMillion: 10, outputPricePerMillion: 20 });
    const decision = route([costly, cheap], {
      requestedModel: "auto/economy",
      promptTokensEstimate: 500,
      maxOutputTokens: 500,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false
    });
    expect(decision.selected.slug).toBe("cheap");
  });

  it("filters models missing required capabilities", () => {
    const textOnly = model({ slug: "text", supportsVision: false });
    const vision = model({ slug: "vision", supportsVision: true });
    const decision = route([textOnly, vision], {
      requestedModel: "auto",
      promptTokensEstimate: 100,
      requiresTools: false,
      requiresVision: true,
      requiresJson: false
    });
    expect(decision.selected.slug).toBe("vision");
  });
});

