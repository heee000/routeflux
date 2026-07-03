import type { RoutedModel } from "../catalog/types.js";

export type RoutingMode = "manual" | "economy" | "balanced" | "quality";

export interface RoutingRequest {
  requestedModel: string;
  promptTokensEstimate: number;
  maxOutputTokens?: number | undefined;
  requiresTools: boolean;
  requiresVision: boolean;
  requiresJson: boolean;
}

export interface RouteDecision {
  mode: RoutingMode;
  selected: RoutedModel;
  candidates: RoutedModel[];
  maxOutputTokens: number;
  reason: string;
}
