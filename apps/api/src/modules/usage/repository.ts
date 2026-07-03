import type { Database } from "../../db/pool.js";
import type { Principal } from "../auth/repository.js";
import type { RouteDecision } from "../routing/types.js";
import type { UsageCharge } from "../wallet/types.js";

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

  async succeed(requestId: string, usage: UsageCharge, latencyMs: number): Promise<void> {
    await this.db.query(
      `UPDATE request_logs SET
         status = 'succeeded', prompt_tokens = $1, completion_tokens = $2,
         cost_micro_usd = $3, latency_ms = $4, completed_at = now()
       WHERE id = $5`,
      [usage.promptTokens, usage.completionTokens, usage.costMicroUsd, latencyMs, requestId]
    );
  }

  async fail(requestId: string, errorCode: string, latencyMs: number): Promise<void> {
    await this.db.query(
      `UPDATE request_logs SET status = 'failed', error_code = $1, latency_ms = $2, completed_at = now()
       WHERE id = $3`,
      [errorCode, latencyMs, requestId]
    );
  }
}
