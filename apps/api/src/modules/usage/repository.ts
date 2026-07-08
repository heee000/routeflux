import type { Database } from "../../db/pool.js";
import type { Principal } from "../auth/repository.js";
import type { RouteDecision } from "../routing/types.js";
import type { UsageCharge } from "../wallet/types.js";
import type { ProviderAttempt } from "../providers/health-repository.js";

export class UsageRepository {
  constructor(private readonly db: Database) {}

  async start(requestId: string, principal: Principal, requestedModel: string, decision: RouteDecision): Promise<void> {
    await this.db.query(
      `INSERT INTO request_logs (
         id, user_id, api_key_id, requested_model, selected_model_id,
         routing_mode, status, route_reason, primary_domain, difficulty,
         predicted_output_tokens, selected_token_budget, predicted_quality,
         candidate_scores
       ) VALUES ($1, $2, $3, $4, $5, $6, 'started', $7, $8, $9, $10, $11, $12, $13)`,
      [
        requestId,
        principal.userId,
        principal.apiKeyId,
        requestedModel,
        decision.selected.id,
        decision.mode,
        decision.reason,
        decision.features.primaryDomain,
        decision.features.difficulty,
        decision.features.predictedOutputTokens,
        decision.maxOutputTokens,
        decision.predictedQuality,
        JSON.stringify(decision.ranked.slice(0, 20).map((candidate) => ({
          model: candidate.model.slug,
          token_budget: candidate.tokenBudget,
          predicted_quality: candidate.predictedQuality,
          domain_similarity: candidate.domainSimilarity,
          predicted_cost_usd: candidate.predictedCostUsd,
          predicted_latency_ms: candidate.predictedLatencyMs,
          utility: candidate.utility
        })))
      ]
    );
  }

  async succeed(
    requestId: string,
    usage: UsageCharge,
    providerCostMicroUsd: number,
    billingShortfallMicroUsd: number,
    latencyMs: number,
    selectedModelId: string,
    attempts: ProviderAttempt[]
  ): Promise<void> {
    await this.db.query(
      `UPDATE request_logs SET
         status = 'succeeded', prompt_tokens = $1, completion_tokens = $2,
         cost_micro_usd = $3, provider_cost_micro_usd = $4,
         billing_shortfall_micro_usd = $5, latency_ms = $6, selected_model_id = $7,
         provider_attempts = $8, fallback_count = $9, completed_at = now()
       WHERE id = $10`,
      [
        usage.promptTokens,
        usage.completionTokens,
        usage.costMicroUsd,
        providerCostMicroUsd,
        billingShortfallMicroUsd,
        latencyMs,
        selectedModelId,
        JSON.stringify(attempts),
        Math.max(0, attempts.length - 1),
        requestId
      ]
    );
  }

  async fail(requestId: string, errorCode: string, latencyMs: number, attempts: ProviderAttempt[] = []): Promise<void> {
    await this.db.query(
      `UPDATE request_logs SET status = 'failed', error_code = $1, latency_ms = $2,
         provider_attempts = $3, fallback_count = $4, completed_at = now()
       WHERE id = $5`,
      [errorCode, latencyMs, JSON.stringify(attempts), Math.max(0, attempts.length - 1), requestId]
    );
  }

  async failCharged(
    requestId: string,
    errorCode: string,
    usage: UsageCharge,
    providerCostMicroUsd: number,
    billingShortfallMicroUsd: number,
    latencyMs: number,
    selectedModelId: string,
    attempts: ProviderAttempt[]
  ): Promise<void> {
    await this.db.query(
      `UPDATE request_logs SET status = 'failed', error_code = $1,
         prompt_tokens = $2, completion_tokens = $3, cost_micro_usd = $4,
         provider_cost_micro_usd = $5, billing_shortfall_micro_usd = $6,
         latency_ms = $7, selected_model_id = $8, provider_attempts = $9,
         fallback_count = $10, completed_at = now()
       WHERE id = $11`,
      [
        errorCode,
        usage.promptTokens,
        usage.completionTokens,
        usage.costMicroUsd,
        providerCostMicroUsd,
        billingShortfallMicroUsd,
        latencyMs,
        selectedModelId,
        JSON.stringify(attempts),
        Math.max(0, attempts.length - 1),
        requestId
      ]
    );
  }
}
