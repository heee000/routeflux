import type { RoutedModel } from "../catalog/types.js";
import type {
  RouteDecision,
  RoutingMode,
  RoutingRequest,
  ScoredCandidate,
  TaskFeatures
} from "./types.js";

const AUTO_MODES = new Map<string, RoutingMode>([
  ["auto", "balanced"],
  ["auto/balanced", "balanced"],
  ["auto/economy", "economy"],
  ["auto/quality", "quality"]
]);

const DEFAULT_FEATURES: TaskFeatures = {
  promptTokens: 0,
  textTokens: 0,
  domainVector: { general: 1 },
  primaryDomain: "general",
  difficulty: 0.3,
  predictedOutputTokens: 768,
  signals: []
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function numberHint(model: RoutedModel, name: string, fallback: number): number {
  const value = model.metadata[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cosine(left: Record<string, number>, right: Record<string, number>): number {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const key of keys) {
    const l = left[key] ?? 0;
    const r = right[key] ?? 0;
    dot += l * r;
    leftMagnitude += l * l;
    rightMagnitude += r * r;
  }
  if (!leftMagnitude || !rightMagnitude) return 0.5;
  return clamp(dot / Math.sqrt(leftMagnitude * rightMagnitude));
}

function eligible(model: RoutedModel, request: RoutingRequest, tokenBudget: number): boolean {
  if (model.provider.healthStatus === "open" && model.provider.circuitOpenUntil && new Date(model.provider.circuitOpenUntil).getTime() > Date.now()) {
    return false;
  }
  if (request.requiresTools && !model.supportsTools) return false;
  if (request.requiresVision && !model.supportsVision) return false;
  if (request.requiresJson && !model.supportsJson) return false;
  if (request.policy?.maxLatencyMs !== undefined && numberHint(model, "latencyMs", 5_000) > request.policy.maxLatencyMs) {
    return false;
  }
  return request.promptTokensEstimate + tokenBudget <= model.contextWindow;
}

function costUsd(model: RoutedModel, inputTokens: number, outputTokens: number): number {
  return (
    model.inputPricePerMillion * inputTokens + model.outputPricePerMillion * outputTokens
  ) / 1_000_000;
}

function budgetsFor(model: RoutedModel, mode: RoutingMode, request: RoutingRequest, features: TaskFeatures): number[] {
  const hardBudget = request.maxOutputTokens ??
    (typeof request.policy?.tokenBudget === "number" ? request.policy.tokenBudget : undefined);
  if (hardBudget !== undefined) return [Math.max(1, Math.min(hardBudget, model.maxOutputTokens))];
  const verbosity = numberHint(model, "outputLengthMultiplier", 1);
  const required = Math.max(64, Math.round(features.predictedOutputTokens * verbosity));
  const factors = mode === "economy" ? [0.6, 0.85, 1] : mode === "quality" ? [1, 1.25, 1.5] : [0.75, 1, 1.25];
  return [...new Set(factors.map((factor) => Math.max(64, Math.min(model.maxOutputTokens, Math.round(required * factor)))))]
    .sort((left, right) => left - right);
}

function predictQuality(model: RoutedModel, features: TaskFeatures, tokenBudget: number): {
  quality: number;
  domainSimilarity: number;
} {
  const baseQuality = numberHint(model, "qualityScore", 0.55);
  const difficultyCapacity = numberHint(model, "difficultyCapacity", baseQuality);
  const domainSimilarity = cosine(features.domainVector, model.domains);
  const required = Math.max(64, features.predictedOutputTokens * numberHint(model, "outputLengthMultiplier", 1));
  const adequacy = clamp(tokenBudget / required);
  const difficultyPenalty = Math.max(0, features.difficulty - difficultyCapacity) * 0.48;
  const tokenPenalty = (1 - adequacy) * (0.24 + features.difficulty * 0.18);
  const domainAdjustment = (domainSimilarity - 0.5) * 0.18;
  return {
    quality: clamp(baseQuality + domainAdjustment - difficultyPenalty - tokenPenalty, 0.01, 0.99),
    domainSimilarity
  };
}

function weights(mode: RoutingMode): { quality: number; cost: number; latency: number } {
  if (mode === "economy") return { quality: 0.38, cost: 0.48, latency: 0.14 };
  if (mode === "quality") return { quality: 0.82, cost: 0.08, latency: 0.1 };
  return { quality: 0.58, cost: 0.24, latency: 0.18 };
}

function scoreCandidate(model: RoutedModel, tokenBudget: number, mode: RoutingMode, request: RoutingRequest, features: TaskFeatures): ScoredCandidate {
  const predicted = predictQuality(model, features, tokenBudget);
  const predictedCostUsd = costUsd(model, request.promptTokensEstimate, tokenBudget);
  const predictedLatencyMs = model.provider.latencyEmaMs ?? numberHint(model, "latencyMs", 5_000);
  const modeWeights = weights(mode);
  const costScale = request.policy?.maxCostUsd ?? 0.02;
  const utility =
    predicted.quality * modeWeights.quality -
    clamp(predictedCostUsd / Math.max(0.000001, costScale), 0, 2) * modeWeights.cost -
    clamp(predictedLatencyMs / 20_000, 0, 2) * modeWeights.latency;
  return {
    model,
    tokenBudget,
    predictedQuality: predicted.quality,
    domainSimilarity: predicted.domainSimilarity,
    predictedCostUsd,
    predictedLatencyMs,
    utility
  };
}

export function route(models: RoutedModel[], request: RoutingRequest): RouteDecision {
  const mode = AUTO_MODES.get(request.requestedModel) ?? "manual";
  const features = request.features ?? { ...DEFAULT_FEATURES, promptTokens: request.promptTokensEstimate };

  if (mode === "manual") {
    const selected = models.find((model) => model.slug === request.requestedModel);
    if (!selected) throw new Error(`Model '${request.requestedModel}' is unavailable`);
    const tokenBudget = budgetsFor(selected, mode, request, features)[0]!;
    if (!eligible(selected, request, tokenBudget)) {
      throw new Error(`Model '${request.requestedModel}' is incompatible with the request`);
    }
    const scored = scoreCandidate(selected, tokenBudget, "balanced", request, features);
    return {
      mode,
      selected,
      candidates: [selected],
      ranked: [scored],
      features,
      maxOutputTokens: tokenBudget,
      predictedQuality: scored.predictedQuality,
      reason: "explicit model selection"
    };
  }

  const scored: ScoredCandidate[] = [];
  for (const model of models) {
    for (const tokenBudget of budgetsFor(model, mode, request, features)) {
      if (!eligible(model, request, tokenBudget)) continue;
      const candidate = scoreCandidate(model, tokenBudget, mode, request, features);
      if (request.policy?.maxCostUsd !== undefined && candidate.predictedCostUsd > request.policy.maxCostUsd) continue;
      if (request.policy?.minQuality !== undefined && candidate.predictedQuality < request.policy.minQuality) continue;
      scored.push(candidate);
    }
  }
  scored.sort((left, right) => right.utility - left.utility);
  const winner = scored[0];
  if (!winner) throw new Error("No model and token budget satisfy the routing constraints");
  const orderedModels = [...new Map(scored.map((candidate) => [candidate.model.id, candidate.model])).values()];
  return {
    mode,
    selected: winner.model,
    candidates: orderedModels,
    ranked: scored,
    features,
    maxOutputTokens: winner.tokenBudget,
    predictedQuality: winner.predictedQuality,
    reason: `${mode} joint model-token optimization for ${features.primaryDomain}`
  };
}
