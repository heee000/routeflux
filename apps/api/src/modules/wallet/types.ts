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

