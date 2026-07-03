import { describe, expect, it } from "vitest";
import { calculateCharge, microUsdToUsd } from "../src/modules/wallet/money.js";

describe("wallet money", () => {
  it("calculates integer micro-dollar charges without floating balances", () => {
    const charge = calculateCharge(
      { inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
      1_000,
      500
    );
    expect(charge.costMicroUsd).toBe(7_500);
    expect(microUsdToUsd(charge.costMicroUsd)).toBe("0.007500");
  });

  it("supports free models", () => {
    expect(calculateCharge({ inputPricePerMillion: 0, outputPricePerMillion: 0 }, 100, 100).costMicroUsd).toBe(0);
  });
});

