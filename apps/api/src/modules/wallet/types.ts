export interface WalletBalance {
  walletId: string;
  currency: "USD";
  balanceMicroUsd: number;
  heldMicroUsd: number;
  availableMicroUsd: number;
}

export interface UsageCharge {
  promptTokens: number;
  completionTokens: number;
  costMicroUsd: number;
}

export interface ReservationInput {
  walletId: string;
  apiKeyId: string;
  requestId: string;
  amountMicroUsd: number;
}

export type ReservationResult =
  | { ok: true; committedMicroUsd: number }
  | {
      ok: false;
      reason: "monthly_budget" | "max_request" | "insufficient_balance" | "wallet_not_found";
      committedMicroUsd: number;
      limitMicroUsd: number | null;
    };

export interface SettlementResult {
  chargedMicroUsd: number;
  requestedMicroUsd: number;
  shortfallMicroUsd: number;
}

