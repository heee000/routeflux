import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, type Database } from "../src/db/pool.js";
import { WalletRepository } from "../src/modules/wallet/repository.js";

const connectionString = process.env.TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration("wallet PostgreSQL integration", () => {
  let db: Database;
  let wallets: WalletRepository;
  let userId: string;
  let walletId: string;
  let apiKeyId: string;

  beforeAll(async () => {
    db = createPool(connectionString!);
    wallets = new WalletRepository(db);
    const user = await db.query<{ id: string }>(
      "INSERT INTO users (email, display_name) VALUES ($1, 'Integration') RETURNING id",
      [`wallet-${randomUUID()}@example.test`]
    );
    userId = user.rows[0]!.id;
    const wallet = await db.query<{ id: string }>(
      "INSERT INTO wallets (user_id, balance_micro_usd) VALUES ($1, 1000) RETURNING id",
      [userId]
    );
    walletId = wallet.rows[0]!.id;
    const key = await db.query<{ id: string }>(
      `INSERT INTO api_keys (
         user_id, name, key_prefix, key_hash, monthly_budget_micro_usd
       ) VALUES ($1, 'integration', 'rf_test', $2, 150) RETURNING id`,
      [userId, randomUUID()]
    );
    apiKeyId = key.rows[0]!.id;
  });

  beforeEach(async () => {
    await db.query("DELETE FROM wallet_holds WHERE wallet_id = $1", [walletId]);
    await db.query(
      "UPDATE wallets SET balance_micro_usd = 1000, held_micro_usd = 0 WHERE id = $1",
      [walletId]
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.end();
  });

  function reserve(requestId: string, amountMicroUsd = 100) {
    return wallets.reserve({ walletId, apiKeyId, requestId, amountMicroUsd });
  }

  it("serializes concurrent reservations against one key budget", async () => {
    const [left, right] = await Promise.all([reserve(randomUUID()), reserve(randomUUID())]);
    expect([left.ok, right.ok].filter(Boolean)).toHaveLength(1);
    const rejected = left.ok ? right : left;
    expect(rejected).toMatchObject({ ok: false, reason: "monthly_budget" });
    const balance = await wallets.getBalance(walletId);
    expect(balance?.heldMicroUsd).toBe(100);
  });

  it("reclaims expired holds when reading a wallet", async () => {
    const requestId = randomUUID();
    expect((await reserve(requestId)).ok).toBe(true);
    await db.query("UPDATE wallet_holds SET expires_at = now() - interval '1 second' WHERE request_id = $1", [requestId]);
    const balance = await wallets.getBalance(walletId);
    expect(balance?.heldMicroUsd).toBe(0);
    const hold = await db.query<{ status: string }>("SELECT status FROM wallet_holds WHERE request_id = $1", [requestId]);
    expect(hold.rows[0]!.status).toBe("released");
  });

  it("records a shortfall instead of exceeding the authorized hold", async () => {
    const requestId = randomUUID();
    expect((await reserve(requestId)).ok).toBe(true);
    const settlement = await wallets.settle(requestId, 250, { test: true });
    expect(settlement).toEqual({
      chargedMicroUsd: 100,
      requestedMicroUsd: 250,
      shortfallMicroUsd: 150
    });
    const balance = await wallets.getBalance(walletId);
    expect(balance).toMatchObject({ balanceMicroUsd: 900, heldMicroUsd: 0 });
  });
});
