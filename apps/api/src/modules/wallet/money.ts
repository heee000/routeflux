import type { RoutedModel } from "../catalog/types.js";
import type { UsageCharge } from "./types.js";

export function calculateCharge(
  model: Pick<RoutedModel, "inputPricePerMillion" | "outputPricePerMillion">,
  promptTokens: number,
  completionTokens: number
): UsageCharge {
  const raw =
    model.inputPricePerMillion * Math.max(0, promptTokens) +
    model.outputPricePerMillion * Math.max(0, completionTokens);
  return {
    promptTokens,
    completionTokens,
    costMicroUsd: Math.max(0, Math.ceil(raw))
  };
}

export function microUsdToUsd(value: number): string {
  return (value / 1_000_000).toFixed(6);
}
