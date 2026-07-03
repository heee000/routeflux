import type { Database } from "../../db/pool.js";

export interface ProviderAttempt {
  provider: string;
  model: string;
  token_budget: number;
  status: number | null;
  latency_ms: number;
  outcome: "success" | "retryable_error" | "terminal_error" | "error";
  error?: string | undefined;
}

export class ProviderHealthRepository {
  constructor(private readonly db: Database) {}

  async recordSuccess(providerId: string, latencyMs: number): Promise<void> {
    await this.db.query(
      `INSERT INTO provider_health (
         provider_id, status, consecutive_failures, success_count, latency_ema_ms, last_checked_at
       ) VALUES ($1, 'healthy', 0, 1, $2, now())
       ON CONFLICT (provider_id) DO UPDATE SET
         status = 'healthy',
         consecutive_failures = 0,
         success_count = provider_health.success_count + 1,
         latency_ema_ms = CASE
           WHEN provider_health.latency_ema_ms IS NULL THEN EXCLUDED.latency_ema_ms
           ELSE provider_health.latency_ema_ms * 0.8 + EXCLUDED.latency_ema_ms * 0.2
         END,
         circuit_open_until = NULL,
         last_error = NULL,
         last_checked_at = now(),
         updated_at = now()`,
      [providerId, latencyMs]
    );
  }

  async recordFailure(providerId: string, error: string): Promise<void> {
    await this.db.query(
      `INSERT INTO provider_health (
         provider_id, status, consecutive_failures, failure_count,
         circuit_open_until, last_error, last_checked_at
       ) VALUES ($1, 'degraded', 1, 1, NULL, $2, now())
       ON CONFLICT (provider_id) DO UPDATE SET
         consecutive_failures = provider_health.consecutive_failures + 1,
         failure_count = provider_health.failure_count + 1,
         status = CASE WHEN provider_health.consecutive_failures + 1 >= 3 THEN 'open' ELSE 'degraded' END,
         circuit_open_until = CASE
           WHEN provider_health.consecutive_failures + 1 >= 3 THEN now() + interval '30 seconds'
           ELSE provider_health.circuit_open_until
         END,
         last_error = EXCLUDED.last_error,
         last_checked_at = now(),
         updated_at = now()`,
      [providerId, error.slice(0, 500)]
    );
  }
}
