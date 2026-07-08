import type { PoolClient } from "pg";
import type { Database } from "../../db/pool.js";
import { withTransaction } from "../../db/pool.js";
import type {
  ReservationInput,
  ReservationResult,
  SettlementResult,
  WalletBalance
} from "./types.js";

interface WalletRow {
  id: string;
  currency: "USD";
  balance_micro_usd: string;
  held_micro_usd: string;
}

interface HoldRow {
  id: string;
  wallet_id: string;
  amount_micro_usd: string;
  status: string;
}

interface KeyLimitRow {
  monthly_budget_micro_usd: string | null;
  max_request_micro_usd: string | null;
}

function mapBalance(row: WalletRow): WalletBalance {
  const balanceMicroUsd = Number(row.balance_micro_usd);
  const heldMicroUsd = Number(row.held_micro_usd);
  return {
    walletId: row.id,
    currency: row.currency,
    balanceMicroUsd,
    heldMicroUsd,
    availableMicroUsd: balanceMicroUsd - heldMicroUsd
  };
}

async function reclaimExpiredHolds(client: PoolClient, walletId: string): Promise<number> {
  const expired = await client.query<{ amount_micro_usd: string }>(
    `UPDATE wallet_holds
     SET status = 'released', updated_at = now()
     WHERE wallet_id = $1 AND status = 'active' AND expires_at <= now()
     RETURNING amount_micro_usd`,
    [walletId]
  );
  const reclaimed = expired.rows.reduce((total, row) => total + Number(row.amount_micro_usd), 0);
  if (reclaimed > 0) {
    await client.query(
      `UPDATE wallets
       SET held_micro_usd = held_micro_usd - $1, updated_at = now()
       WHERE id = $2`,
      [reclaimed, walletId]
    );
  }
  return reclaimed;
}

export class WalletRepository {
  constructor(private readonly db: Database) {}

  async getBalance(walletId: string): Promise<WalletBalance | null> {
    return withTransaction(this.db, async (client) => {
      const locked = await client.query<WalletRow>(
        `SELECT id, currency, balance_micro_usd, held_micro_usd
         FROM wallets WHERE id = $1 FOR UPDATE`,
        [walletId]
      );
      if (!locked.rows[0]) return null;
      await reclaimExpiredHolds(client, walletId);
      const refreshed = await client.query<WalletRow>(
        "SELECT id, currency, balance_micro_usd, held_micro_usd FROM wallets WHERE id = $1",
        [walletId]
      );
      return refreshed.rows[0] ? mapBalance(refreshed.rows[0]) : null;
    });
  }

  async reserve(input: ReservationInput): Promise<ReservationResult> {
    if (!Number.isSafeInteger(input.amountMicroUsd) || input.amountMicroUsd <= 0) {
      throw new Error("Reservation amount must be a positive safe integer");
    }
    return withTransaction(this.db, async (client) => {
      // The key lock serializes all budget decisions for this API key.
      const key = await client.query<KeyLimitRow>(
        `SELECT k.monthly_budget_micro_usd, k.max_request_micro_usd
         FROM api_keys k
         JOIN wallets w ON w.user_id = k.user_id
         WHERE k.id = $1 AND w.id = $2
         FOR UPDATE OF k`,
        [input.apiKeyId, input.walletId]
      );
      const keyLimits = key.rows[0];
      if (!keyLimits) {
        return { ok: false, reason: "wallet_not_found", committedMicroUsd: 0, limitMicroUsd: null };
      }
      const monthlyBudgetMicroUsd = keyLimits.monthly_budget_micro_usd === null
        ? null
        : Number(keyLimits.monthly_budget_micro_usd);
      const maxRequestMicroUsd = keyLimits.max_request_micro_usd === null
        ? null
        : Number(keyLimits.max_request_micro_usd);
      const wallet = await client.query<WalletRow>(
        `SELECT id, currency, balance_micro_usd, held_micro_usd
         FROM wallets WHERE id = $1 FOR UPDATE`,
        [input.walletId]
      );
      const row = wallet.rows[0];
      if (!row) {
        return { ok: false, reason: "wallet_not_found", committedMicroUsd: 0, limitMicroUsd: null };
      }
      await reclaimExpiredHolds(client, input.walletId);

      const spend = await client.query<{ spent_micro_usd: string; reserved_micro_usd: string }>(
        `SELECT
           COALESCE((
             SELECT sum(charged) FROM (
               SELECT settled_micro_usd AS charged
               FROM wallet_holds
               WHERE api_key_id = $1 AND status = 'settled'
                 AND created_at >= date_trunc('month', now())
               UNION ALL
               SELECT r.cost_micro_usd AS charged
               FROM request_logs r
               WHERE r.api_key_id = $1 AND r.cost_micro_usd IS NOT NULL
                 AND r.created_at >= date_trunc('month', now())
                 AND NOT EXISTS (
                   SELECT 1 FROM wallet_holds h
                   WHERE h.request_id = r.id AND h.api_key_id = $1
                 )
             ) charged_rows
           ), 0) AS spent_micro_usd,
           COALESCE((
             SELECT sum(amount_micro_usd) FROM wallet_holds
             WHERE api_key_id = $1 AND status = 'active'
           ), 0) AS reserved_micro_usd`,
        [input.apiKeyId]
      );
      const committedMicroUsd =
        Number(spend.rows[0]!.spent_micro_usd) + Number(spend.rows[0]!.reserved_micro_usd);
      if (maxRequestMicroUsd !== null && input.amountMicroUsd > maxRequestMicroUsd) {
        return {
          ok: false,
          reason: "max_request",
          committedMicroUsd,
          limitMicroUsd: maxRequestMicroUsd
        };
      }
      if (
        monthlyBudgetMicroUsd !== null &&
        committedMicroUsd + input.amountMicroUsd > monthlyBudgetMicroUsd
      ) {
        return {
          ok: false,
          reason: "monthly_budget",
          committedMicroUsd,
          limitMicroUsd: monthlyBudgetMicroUsd
        };
      }

      const balance = await client.query<WalletRow>(
        "SELECT id, currency, balance_micro_usd, held_micro_usd FROM wallets WHERE id = $1",
        [input.walletId]
      );
      const current = balance.rows[0]!;
      const available = Number(current.balance_micro_usd) - Number(current.held_micro_usd);
      if (available < input.amountMicroUsd) {
        return {
          ok: false,
          reason: "insufficient_balance",
          committedMicroUsd,
          limitMicroUsd: null
        };
      }
      await client.query(
        `INSERT INTO wallet_holds (wallet_id, api_key_id, request_id, amount_micro_usd, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '15 minutes')`,
        [input.walletId, input.apiKeyId, input.requestId, input.amountMicroUsd]
      );
      await client.query(
        "UPDATE wallets SET held_micro_usd = held_micro_usd + $1, updated_at = now() WHERE id = $2",
        [input.amountMicroUsd, input.walletId]
      );
      return { ok: true, committedMicroUsd: committedMicroUsd + input.amountMicroUsd };
    });
  }

  async settle(
    requestId: string,
    actualMicroUsd: number,
    metadata: Record<string, unknown>
  ): Promise<SettlementResult> {
    if (!Number.isSafeInteger(actualMicroUsd) || actualMicroUsd < 0) {
      throw new Error("Settlement amount must be a non-negative safe integer");
    }
    return withTransaction(this.db, async (client) => {
      const lookup = await client.query<{ wallet_id: string }>(
        "SELECT wallet_id FROM wallet_holds WHERE request_id = $1",
        [requestId]
      );
      if (!lookup.rows[0]) {
        return { chargedMicroUsd: 0, requestedMicroUsd: actualMicroUsd, shortfallMicroUsd: actualMicroUsd };
      }
      const walletResult = await client.query<WalletRow>(
        `SELECT id, currency, balance_micro_usd, held_micro_usd
         FROM wallets WHERE id = $1 FOR UPDATE`,
        [lookup.rows[0].wallet_id]
      );
      const holdResult = await client.query<HoldRow>(
        `SELECT id, wallet_id, amount_micro_usd, status
         FROM wallet_holds WHERE request_id = $1 FOR UPDATE`,
        [requestId]
      );
      const hold = holdResult.rows[0];
      const wallet = walletResult.rows[0];
      if (!hold || !wallet || hold.status !== "active") {
        return { chargedMicroUsd: 0, requestedMicroUsd: actualMicroUsd, shortfallMicroUsd: actualMicroUsd };
      }
      const held = Number(hold.amount_micro_usd);
      const otherHolds = Math.max(0, Number(wallet.held_micro_usd) - held);
      const maximumCharge = Math.max(0, Number(wallet.balance_micro_usd) - otherHolds);
      // Never exceed the authorized hold: this keeps both wallet and API-key budgets strict.
      const chargedMicroUsd = Math.min(actualMicroUsd, held, maximumCharge);
      const shortfallMicroUsd = actualMicroUsd - chargedMicroUsd;
      const updatedWallet = await client.query<WalletRow>(
        `UPDATE wallets
         SET balance_micro_usd = balance_micro_usd - $1,
             held_micro_usd = held_micro_usd - $2,
             updated_at = now()
         WHERE id = $3
         RETURNING id, currency, balance_micro_usd, held_micro_usd`,
        [chargedMicroUsd, held, hold.wallet_id]
      );
      await client.query(
        `UPDATE wallet_holds
         SET status = 'settled', settled_micro_usd = $1, updated_at = now()
         WHERE id = $2`,
        [chargedMicroUsd, hold.id]
      );
      if (chargedMicroUsd > 0) {
        await client.query(
          `INSERT INTO wallet_ledger_entries (
             wallet_id, kind, amount_micro_usd, balance_after_micro_usd,
             reference_id, description, metadata
           ) VALUES ($1, 'usage', $2, $3, $4, 'Model API usage', $5)`,
          [
            hold.wallet_id,
            -chargedMicroUsd,
            updatedWallet.rows[0]!.balance_micro_usd,
            requestId,
            JSON.stringify({
              ...metadata,
              provider_cost_micro_usd: actualMicroUsd,
              billing_shortfall_micro_usd: shortfallMicroUsd
            })
          ]
        );
      }
      return { chargedMicroUsd, requestedMicroUsd: actualMicroUsd, shortfallMicroUsd };
    });
  }

  async release(requestId: string): Promise<void> {
    await withTransaction(this.db, async (client) => {
      const lookup = await client.query<{ wallet_id: string }>(
        "SELECT wallet_id FROM wallet_holds WHERE request_id = $1",
        [requestId]
      );
      if (!lookup.rows[0]) return;
      await client.query("SELECT id FROM wallets WHERE id = $1 FOR UPDATE", [lookup.rows[0].wallet_id]);
      const result = await client.query<HoldRow>(
        `SELECT id, wallet_id, amount_micro_usd, status
         FROM wallet_holds WHERE request_id = $1 FOR UPDATE`,
        [requestId]
      );
      const hold = result.rows[0];
      if (!hold || hold.status !== "active") return;
      await client.query(
        "UPDATE wallets SET held_micro_usd = held_micro_usd - $1, updated_at = now() WHERE id = $2",
        [hold.amount_micro_usd, hold.wallet_id]
      );
      await client.query("UPDATE wallet_holds SET status = 'released', updated_at = now() WHERE id = $1", [hold.id]);
    });
  }
}
