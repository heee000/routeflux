import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { bearerToken, generateApiKey, secureTokenEqual } from "../security/api-keys.js";

const userSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(120)
});
const keySchema = z.object({ name: z.string().min(1).max(120) });
const creditSchema = z.object({
  amount_usd: z.number().positive().max(1_000_000),
  reference_id: z.string().min(1).max(200),
  description: z.string().min(1).max(500).default("Wallet credit")
});

function requireAdmin(request: FastifyRequest, reply: FastifyReply, config: AppConfig): boolean {
  const token = bearerToken(request.headers.authorization);
  if (!token || !secureTokenEqual(token, config.ADMIN_TOKEN)) {
    reply.code(401).send({ error: { message: "Invalid admin token", type: "authentication_error" } });
    return false;
  }
  return true;
}

export async function registerAdminRoutes(app: FastifyInstance, config: AppConfig, db: Database): Promise<void> {
  app.post("/admin/users", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const body = userSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: { message: body.error.message } });
    const created = await withTransaction(db, async (client) => {
      const user = await client.query<{ id: string; email: string; display_name: string }>(
        `INSERT INTO users (email, display_name) VALUES ($1, $2)
         RETURNING id, email, display_name`,
        [body.data.email.toLowerCase(), body.data.display_name]
      );
      const wallet = await client.query<{ id: string }>(
        "INSERT INTO wallets (user_id) VALUES ($1) RETURNING id",
        [user.rows[0]!.id]
      );
      return { ...user.rows[0]!, wallet_id: wallet.rows[0]!.id };
    });
    return reply.code(201).send(created);
  });

  app.post("/admin/users/:userId/keys", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    const body = keySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { message: "Invalid request" } });
    const key = generateApiKey();
    const result = await db.query<{ id: string }>(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [params.data.userId, body.data.name, key.prefix, key.hash]
    );
    return reply.code(201).send({ id: result.rows[0]!.id, api_key: key.plaintext, prefix: key.prefix });
  });

  app.post("/admin/users/:userId/credits", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    const body = creditSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { message: "Invalid request" } });
    const amountMicroUsd = Math.round(body.data.amount_usd * 1_000_000);
    const balance = await withTransaction(db, async (client) => {
      const wallet = await client.query<{ id: string; balance_micro_usd: string }>(
        `UPDATE wallets SET balance_micro_usd = balance_micro_usd + $1, updated_at = now()
         WHERE user_id = $2 RETURNING id, balance_micro_usd`,
        [amountMicroUsd, params.data.userId]
      );
      const row = wallet.rows[0];
      if (!row) return null;
      await client.query(
        `INSERT INTO wallet_ledger_entries (
           wallet_id, kind, amount_micro_usd, balance_after_micro_usd,
           reference_id, description
         ) VALUES ($1, 'credit', $2, $3, $4, $5)`,
        [row.id, amountMicroUsd, row.balance_micro_usd, body.data.reference_id, body.data.description]
      );
      return Number(row.balance_micro_usd);
    });
    if (balance === null) return reply.code(404).send({ error: { message: "User wallet not found" } });
    return { balance_usd: (balance / 1_000_000).toFixed(6) };
  });
}

