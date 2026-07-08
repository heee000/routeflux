import { describe, expect, it } from "vitest";
import type { RoutedModel } from "../src/modules/catalog/types.js";
import { route } from "../src/modules/routing/router.js";
import { fallbackCandidates } from "../src/http/routes.js";

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
      timeoutMs: 60_000,
      healthStatus: "healthy",
      circuitOpenUntil: null,
      latencyEmaMs: null
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

  it("uses domain similarity when quality and price are comparable", () => {
    const coding = model({
      slug: "coding-specialist",
      domains: { coding: 1 },
      metadata: { qualityScore: 0.72, difficultyCapacity: 0.85, latencyMs: 1000 }
    });
    const general = model({
      slug: "general-model",
      domains: { general: 1 },
      metadata: { qualityScore: 0.72, difficultyCapacity: 0.85, latencyMs: 1000 }
    });
    const decision = route([general, coding], {
      requestedModel: "auto/quality",
      promptTokensEstimate: 500,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false,
      features: {
        promptTokens: 500,
        textTokens: 480,
        domainVector: { coding: 1 },
        primaryDomain: "coding",
        difficulty: 0.65,
        predictedOutputTokens: 1000,
        signals: ["code"]
      }
    });
    expect(decision.selected.slug).toBe("coding-specialist");
    expect(decision.ranked[0]!.domainSimilarity).toBe(1);
  });

  it("jointly chooses a smaller token budget in economy mode", () => {
    const candidate = model({
      slug: "curve-model",
      outputPricePerMillion: 20,
      metadata: { qualityScore: 0.8, difficultyCapacity: 0.9, latencyMs: 1000 }
    });
    const features = {
      promptTokens: 300,
      textTokens: 280,
      domainVector: { general: 1 },
      primaryDomain: "general",
      difficulty: 0.5,
      predictedOutputTokens: 1200,
      signals: []
    };
    const economy = route([candidate], {
      requestedModel: "auto/economy",
      promptTokensEstimate: 300,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false,
      features
    });
    const quality = route([candidate], {
      requestedModel: "auto/quality",
      promptTokensEstimate: 300,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false,
      features
    });
    expect(economy.maxOutputTokens).toBeLessThan(quality.maxOutputTokens);
    expect(economy.maxOutputTokens).toBeLessThan(features.predictedOutputTokens);
    expect(quality.maxOutputTokens).toBeGreaterThan(features.predictedOutputTokens);
  });

  it("enforces caller cost constraints", () => {
    const candidate = model({ slug: "expensive", inputPricePerMillion: 100, outputPricePerMillion: 200 });
    expect(() => route([candidate], {
      requestedModel: "auto",
      promptTokensEstimate: 1000,
      maxOutputTokens: 1000,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false,
      policy: { maxCostUsd: 0.01 }
    })).toThrow("No model and token budget");
  });

  it("removes providers with an open circuit", () => {
    const unavailable = model({
      slug: "open-circuit",
      provider: {
        ...model({}).provider,
        id: "provider-open",
        slug: "provider-open",
        healthStatus: "open",
        circuitOpenUntil: new Date(Date.now() + 60_000).toISOString()
      }
    });
    const healthy = model({ slug: "healthy" });
    const decision = route([unavailable, healthy], {
      requestedModel: "auto",
      promptTokensEstimate: 100,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false
    });
    expect(decision.selected.slug).toBe("healthy");
  });

  it("builds a provider-diverse fallback sequence", () => {
    const providerOne = model({}).provider;
    const providerTwo = { ...providerOne, id: "provider-2", slug: "provider-2" };
    const first = model({ slug: "first", metadata: { qualityScore: 0.9, latencyMs: 1000 }, provider: providerOne });
    const sameProvider = model({ slug: "same-provider", metadata: { qualityScore: 0.85, latencyMs: 1000 }, provider: providerOne });
    const otherProvider = model({ slug: "other-provider", metadata: { qualityScore: 0.8, latencyMs: 1000 }, provider: providerTwo });
    const decision = route([first, sameProvider, otherProvider], {
      requestedModel: "auto/quality",
      promptTokensEstimate: 100,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false
    });
    const fallbacks = fallbackCandidates(decision);
    expect(fallbacks[0]!.model.provider.id).toBe(providerOne.id);
    expect(fallbacks[1]!.model.provider.id).toBe(providerTwo.id);
    expect(new Set(fallbacks.map((candidate) => candidate.model.id)).size).toBe(fallbacks.length);
  });
});
