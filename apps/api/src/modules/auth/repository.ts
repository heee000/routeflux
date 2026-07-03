import type { Database } from "../../db/pool.js";
import { bearerToken, hashApiKey } from "../../security/api-keys.js";

export interface Principal {
  userId: string;
  apiKeyId: string;
  walletId: string;
  email: string;
  requestsPerMinute: number;
  monthlyBudgetMicroUsd: number | null;
  maxRequestMicroUsd: number | null;
  allowedModels: string[];
}

interface PrincipalRow {
  user_id: string;
  api_key_id: string;
  wallet_id: string;
  email: string;
  requests_per_minute: number;
  monthly_budget_micro_usd: string | null;
  max_request_micro_usd: string | null;
  allowed_models: string[];
}

export class AuthRepository {
  constructor(private readonly db: Database) {}

  async authenticate(authorization: string | undefined): Promise<Principal | null> {
    const token = bearerToken(authorization);
    if (!token?.startsWith("rf_")) return null;
    const result = await this.db.query<PrincipalRow>(
      `SELECT u.id AS user_id, k.id AS api_key_id, w.id AS wallet_id, u.email,
              k.requests_per_minute, k.monthly_budget_micro_usd,
              k.max_request_micro_usd, k.allowed_models
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       JOIN wallets w ON w.user_id = u.id
       WHERE k.key_hash = $1
         AND k.status = 'active'
         AND u.status = 'active'
         AND (k.expires_at IS NULL OR k.expires_at > now())
       LIMIT 1`,
      [hashApiKey(token)]
    );
    const row = result.rows[0];
    if (!row) return null;
    void this.db.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [row.api_key_id]);
    return {
      userId: row.user_id,
      apiKeyId: row.api_key_id,
      walletId: row.wallet_id,
      email: row.email,
      requestsPerMinute: row.requests_per_minute,
      monthlyBudgetMicroUsd: row.monthly_budget_micro_usd === null ? null : Number(row.monthly_budget_micro_usd),
      maxRequestMicroUsd: row.max_request_micro_usd === null ? null : Number(row.max_request_micro_usd),
      allowedModels: row.allowed_models
    };
  }
}

