import type { RoutedModel } from "../catalog/types.js";
import type { DifficultyDimension, DifficultyTier } from "./difficulty.js";

export type RoutingMode = "manual" | "economy" | "balanced" | "quality";

export interface TaskFeatures {
  featureVersion: string;
  promptTokens: number;
  textTokens: number;
  domainVector: Record<string, number>;
  primaryDomain: string;
  difficulty: number;
  difficultyTier: DifficultyTier;
  difficultyDimensions: DifficultyDimension[];
  predictedOutputTokens: number;
  signals: string[];
}

export interface RoutingPolicy {
  maxCostUsd?: number | undefined;
  maxLatencyMs?: number | undefined;
  minQuality?: number | undefined;
  tokenBudget?: "dynamic" | number | undefined;
}

export interface RoutingRequest {
  requestedModel: string;
  promptTokensEstimate: number;
  maxOutputTokens?: number | undefined;
  requiresTools: boolean;
  requiresVision: boolean;
  requiresJson: boolean;
  features?: TaskFeatures | undefined;
  policy?: RoutingPolicy | undefined;
}

export interface ScoredCandidate {
  model: RoutedModel;
  tokenBudget: number;
  predictedQuality: number;
  domainSimilarity: number;
  predictedCostUsd: number;
  predictedLatencyMs: number;
  utility: number;
}

export interface RouteDecision {
  mode: RoutingMode;
  selected: RoutedModel;
  candidates: RoutedModel[];
  ranked: ScoredCandidate[];
  features: TaskFeatures;
  maxOutputTokens: number;
  predictedQuality: number;
  reason: string;
}
