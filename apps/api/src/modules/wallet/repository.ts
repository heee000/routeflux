import type { Database } from "../../db/pool.js";
import { withTransaction } from "../../db/pool.js";
import type { WalletBalance } from "./types.js";

interface WalletRow {
  id: string;
  currency: "USD";
  balance_micro_usd: string;
  held_micro_usd: string;
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

export class WalletRepository {
  constructor(private readonly db: Database) {}

  async getBalance(walletId: string): Promise<WalletBalance | null> {
    const result = await this.db.query<WalletRow>(
      "SELECT id, currency, balance_micro_usd, held_micro_usd FROM wallets WHERE id = $1",
      [walletId]
    );
    return result.rows[0] ? mapBalance(result.rows[0]) : null;
  }

  async reserve(walletId: string, requestId: string, amountMicroUsd: number): Promise<boolean> {
    return withTransaction(this.db, async (client) => {
      const wallet = await client.query<WalletRow>(
        `SELECT id, currency, balance_micro_usd, held_micro_usd
         FROM wallets WHERE id = $1 FOR UPDATE`,
        [walletId]
      );
      const row = wallet.rows[0];
      if (!row) return false;
      const available = Number(row.balance_micro_usd) - Number(row.held_micro_usd);
      if (available < amountMicroUsd) return false;
      await client.query(
        `INSERT INTO wallet_holds (wallet_id, request_id, amount_micro_usd, expires_at)
         VALUES ($1, $2, $3, now() + interval '15 minutes')`,
        [walletId, requestId, amountMicroUsd]
      );
      await client.query(
        "UPDATE wallets SET held_micro_usd = held_micro_usd + $1, updated_at = now() WHERE id = $2",
        [amountMicroUsd, walletId]
      );
      return true;
    });
  }

  async settle(requestId: string, actualMicroUsd: number, metadata: Record<string, unknown>): Promise<void> {
    await withTransaction(this.db, async (client) => {
      const holdResult = await client.query<{
        id: string;
        wallet_id: string;
        amount_micro_usd: string;
        status: string;
      }>("SELECT id, wallet_id, amount_micro_usd, status FROM wallet_holds WHERE request_id = $1 FOR UPDATE", [requestId]);
      const hold = holdResult.rows[0];
      if (!hold || hold.status !== "active") return;
      const held = Number(hold.amount_micro_usd);
      if (actualMicroUsd > held) throw new Error("Actual charge exceeds reserved amount");
      const walletResult = await client.query<WalletRow>(
        `UPDATE wallets
         SET balance_micro_usd = balance_micro_usd - $1,
             held_micro_usd = held_micro_usd - $2,
             updated_at = now()
         WHERE id = $3
         RETURNING id, currency, balance_micro_usd, held_micro_usd`,
        [actualMicroUsd, held, hold.wallet_id]
      );
      const wallet = walletResult.rows[0]!;
      await client.query(
        `UPDATE wallet_holds
         SET status = 'settled', settled_micro_usd = $1, updated_at = now()
         WHERE id = $2`,
        [actualMicroUsd, hold.id]
      );
      if (actualMicroUsd > 0) {
        await client.query(
          `INSERT INTO wallet_ledger_entries (
             wallet_id, kind, amount_micro_usd, balance_after_micro_usd,
             reference_id, description, metadata
           ) VALUES ($1, 'usage', $2, $3, $4, 'Model API usage', $5)`,
          [hold.wallet_id, -actualMicroUsd, wallet.balance_micro_usd, requestId, JSON.stringify(metadata)]
        );
      }
    });
  }

  async release(requestId: string): Promise<void> {
    await withTransaction(this.db, async (client) => {
      const result = await client.query<{ id: string; wallet_id: string; amount_micro_usd: string; status: string }>(
        "SELECT id, wallet_id, amount_micro_usd, status FROM wallet_holds WHERE request_id = $1 FOR UPDATE",
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
