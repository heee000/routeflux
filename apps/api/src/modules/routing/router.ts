import type { RoutedModel } from "../catalog/types.js";
import type { RouteDecision, RoutingMode, RoutingRequest } from "./types.js";

const AUTO_MODES = new Map<string, RoutingMode>([
  ["auto", "balanced"],
  ["auto/balanced", "balanced"],
  ["auto/economy", "economy"],
  ["auto/quality", "quality"]
]);

function eligible(model: RoutedModel, request: RoutingRequest): boolean {
  if (request.requiresTools && !model.supportsTools) return false;
  if (request.requiresVision && !model.supportsVision) return false;
  if (request.requiresJson && !model.supportsJson) return false;
  const output = request.maxOutputTokens ?? Math.min(1024, model.maxOutputTokens);
  return request.promptTokensEstimate + output <= model.contextWindow;
}

function costAt(model: RoutedModel, inputTokens: number, outputTokens: number): number {
  return (
    (model.inputPricePerMillion * inputTokens + model.outputPricePerMillion * outputTokens) /
    1_000_000
  );
}

function qualityHint(model: RoutedModel): number {
  const value = model.metadata.qualityScore;
  return typeof value === "number" ? value : 0.5;
}

function latencyHint(model: RoutedModel): number {
  const value = model.metadata.latencyMs;
  return typeof value === "number" ? value : 5_000;
}

export function route(models: RoutedModel[], request: RoutingRequest): RouteDecision {
  const mode = AUTO_MODES.get(request.requestedModel) ?? "manual";
  const candidates = models.filter((model) => eligible(model, request));
  if (candidates.length === 0) {
    throw new Error("No model satisfies the request constraints");
  }

  if (mode === "manual") {
    const selected = candidates.find((model) => model.slug === request.requestedModel);
    if (!selected) throw new Error(`Model '${request.requestedModel}' is unavailable or incompatible`);
    return {
      mode,
      selected,
      candidates: [selected],
      maxOutputTokens: Math.min(request.maxOutputTokens ?? 1024, selected.maxOutputTokens),
      reason: "explicit model selection"
    };
  }

  const maxOutput = request.maxOutputTokens ?? 1024;
  const ranked = [...candidates].sort((left, right) => {
    const leftCost = costAt(left, request.promptTokensEstimate, Math.min(maxOutput, left.maxOutputTokens));
    const rightCost = costAt(right, request.promptTokensEstimate, Math.min(maxOutput, right.maxOutputTokens));
    if (mode === "economy") return leftCost - rightCost;
    if (mode === "quality") return qualityHint(right) - qualityHint(left);
    const leftUtility = qualityHint(left) - leftCost * 10 - latencyHint(left) / 100_000;
    const rightUtility = qualityHint(right) - rightCost * 10 - latencyHint(right) / 100_000;
    return rightUtility - leftUtility;
  });
  const selected = ranked[0]!;
  return {
    mode,
    selected,
    candidates: ranked,
    maxOutputTokens: Math.min(maxOutput, selected.maxOutputTokens),
    reason: `${mode} policy ranking`
  };
}

