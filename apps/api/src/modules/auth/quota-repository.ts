import type { Database } from "../../db/pool.js";
import type { Principal } from "./repository.js";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
}

export interface BudgetResult {
  allowed: boolean;
  spentMicroUsd: number;
  limitMicroUsd: number | null;
  reason?: "monthly_budget" | "max_request" | undefined;
}

export class QuotaRepository {
  constructor(private readonly db: Database) {}

  async consumeRateLimit(principal: Principal): Promise<RateLimitResult> {
    const result = await this.db.query<{ request_count: number; reset_epoch: string }>(
      `INSERT INTO api_key_rate_windows (api_key_id, window_started_at, request_count)
       VALUES ($1, date_trunc('minute', now()), 1)
       ON CONFLICT (api_key_id, window_started_at) DO UPDATE SET
         request_count = api_key_rate_windows.request_count + 1
       RETURNING request_count,
         extract(epoch FROM window_started_at + interval '1 minute')::bigint AS reset_epoch`,
      [principal.apiKeyId]
    );
    const count = result.rows[0]!.request_count;
    return {
      allowed: count <= principal.requestsPerMinute,
      limit: principal.requestsPerMinute,
      remaining: Math.max(0, principal.requestsPerMinute - count),
      resetEpochSeconds: Number(result.rows[0]!.reset_epoch)
    };
  }

  async checkBudget(principal: Principal, predictedMicroUsd: number): Promise<BudgetResult> {
    if (principal.maxRequestMicroUsd !== null && predictedMicroUsd > principal.maxRequestMicroUsd) {
      return {
        allowed: false,
        spentMicroUsd: 0,
        limitMicroUsd: principal.maxRequestMicroUsd,
        reason: "max_request"
      };
    }
    if (principal.monthlyBudgetMicroUsd === null) {
      return { allowed: true, spentMicroUsd: 0, limitMicroUsd: null };
    }
    const result = await this.db.query<{ spent: string }>(
      `SELECT COALESCE(sum(cost_micro_usd), 0) AS spent
       FROM request_logs
       WHERE api_key_id = $1
         AND status = 'succeeded'
         AND created_at >= date_trunc('month', now())`,
      [principal.apiKeyId]
    );
    const spentMicroUsd = Number(result.rows[0]!.spent);
    return {
      allowed: spentMicroUsd + predictedMicroUsd <= principal.monthlyBudgetMicroUsd,
      spentMicroUsd,
      limitMicroUsd: principal.monthlyBudgetMicroUsd,
      ...(spentMicroUsd + predictedMicroUsd > principal.monthlyBudgetMicroUsd
        ? { reason: "monthly_budget" as const }
        : {})
    };
  }

  async cleanupRateWindows(): Promise<number> {
    const result = await this.db.query(
      "DELETE FROM api_key_rate_windows WHERE window_started_at < now() - interval '1 day'"
    );
    return result.rowCount ?? 0;
  }
}

