import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { bearerToken, generateApiKey, secureTokenEqual } from "../security/api-keys.js";
import { encryptSecret } from "../security/crypto.js";

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
const providerSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  display_name: z.string().min(1).max(120),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  priority: z.number().int().min(0).max(10000).default(100),
  timeout_ms: z.number().int().min(1000).max(600000).default(60000)
});
const modelSchema = z.object({
  provider_id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9._/-]*$/),
  upstream_model: z.string().min(1).max(200),
  display_name: z.string().min(1).max(200),
  context_window: z.number().int().positive(),
  max_output_tokens: z.number().int().positive(),
  input_price_per_million: z.number().min(0),
  output_price_per_million: z.number().min(0),
  supports_tools: z.boolean().default(false),
  supports_vision: z.boolean().default(false),
  supports_json: z.boolean().default(true),
  domains: z.record(z.number().min(0).max(1)).default({}),
  metadata: z.record(z.unknown()).default({})
});
const modelPatchSchema = modelSchema.omit({ provider_id: true }).partial().extend({ enabled: z.boolean().optional() });

function requireAdmin(request: FastifyRequest, reply: FastifyReply, config: AppConfig): boolean {
  const token = bearerToken(request.headers.authorization);
  if (!token || !secureTokenEqual(token, config.ADMIN_TOKEN)) {
    reply.code(401).send({ error: { message: "Invalid admin token", type: "authentication_error" } });
    return false;
  }
  return true;
}

export async function registerAdminRoutes(app: FastifyInstance, config: AppConfig, db: Database): Promise<void> {
  app.get("/admin/overview", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const [users, requests, spend, models] = await Promise.all([
      db.query<{ count: string }>("SELECT count(*) FROM users WHERE status = 'active'"),
      db.query<{ count: string }>("SELECT count(*) FROM request_logs WHERE created_at >= now() - interval '24 hours'"),
      db.query<{ total: string }>("SELECT COALESCE(sum(cost_micro_usd), 0) AS total FROM request_logs WHERE created_at >= date_trunc('month', now()) AND status = 'succeeded'"),
      db.query<{ count: string }>("SELECT count(*) FROM models WHERE enabled = true")
    ]);
    return {
      active_users: Number(users.rows[0]!.count),
      requests_24h: Number(requests.rows[0]!.count),
      spend_month_usd: (Number(spend.rows[0]!.total) / 1_000_000).toFixed(6),
      active_models: Number(models.rows[0]!.count)
    };
  });

  app.get("/admin/users", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const result = await db.query(
      `SELECT u.id, u.email, u.display_name, u.status, u.created_at,
              w.balance_micro_usd, w.held_micro_usd,
              count(k.id)::int AS api_key_count
       FROM users u
       JOIN wallets w ON w.user_id = u.id
       LEFT JOIN api_keys k ON k.user_id = u.id AND k.status = 'active'
       GROUP BY u.id, w.id
       ORDER BY u.created_at DESC
       LIMIT 500`
    );
    return { data: result.rows };
  });

  app.get("/admin/providers", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const result = await db.query(
      `SELECT id, slug, display_name, base_url, enabled, priority, timeout_ms, created_at, updated_at
       FROM providers ORDER BY priority, display_name`
    );
    return { data: result.rows };
  });

  app.post("/admin/providers", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const body = providerSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: { message: body.error.message } });
    const result = await db.query(
      `INSERT INTO providers (
         slug, display_name, base_url, api_key_ciphertext, priority, timeout_ms
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, slug, display_name, base_url, enabled, priority, timeout_ms`,
      [
        body.data.slug,
        body.data.display_name,
        body.data.base_url.replace(/\/$/, ""),
        encryptSecret(body.data.api_key, config.MASTER_KEY),
        body.data.priority,
        body.data.timeout_ms
      ]
    );
    return reply.code(201).send(result.rows[0]);
  });

  app.get("/admin/models", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const result = await db.query(
      `SELECT m.*, p.slug AS provider_slug, p.display_name AS provider_name
       FROM models m JOIN providers p ON p.id = m.provider_id
       ORDER BY m.slug`
    );
    return { data: result.rows };
  });

  app.post("/admin/models", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const body = modelSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: { message: body.error.message } });
    const value = body.data;
    const result = await db.query(
      `INSERT INTO models (
         provider_id, slug, upstream_model, display_name, context_window, max_output_tokens,
         input_price_per_million, output_price_per_million, supports_tools, supports_vision,
         supports_json, domains, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        value.provider_id, value.slug, value.upstream_model, value.display_name,
        value.context_window, value.max_output_tokens, value.input_price_per_million,
        value.output_price_per_million, value.supports_tools, value.supports_vision,
        value.supports_json, JSON.stringify(value.domains), JSON.stringify(value.metadata)
      ]
    );
    return reply.code(201).send(result.rows[0]);
  });

  app.patch("/admin/models/:modelId", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const params = z.object({ modelId: z.string().uuid() }).safeParse(request.params);
    const body = modelPatchSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { message: "Invalid request" } });
    const entries = Object.entries(body.data);
    if (!entries.length) return reply.code(400).send({ error: { message: "No fields to update" } });
    const columnMap: Record<string, string> = {
      upstream_model: "upstream_model",
      display_name: "display_name",
      context_window: "context_window",
      max_output_tokens: "max_output_tokens",
      input_price_per_million: "input_price_per_million",
      output_price_per_million: "output_price_per_million",
      supports_tools: "supports_tools",
      supports_vision: "supports_vision",
      supports_json: "supports_json",
      domains: "domains",
      metadata: "metadata",
      enabled: "enabled",
      slug: "slug"
    };
    const values: unknown[] = [];
    const assignments = entries.map(([key, value], index) => {
      values.push(key === "domains" || key === "metadata" ? JSON.stringify(value) : value);
      return `${columnMap[key]} = $${index + 1}`;
    });
    values.push(params.data.modelId);
    const result = await db.query(
      `UPDATE models SET ${assignments.join(", ")}, updated_at = now()
       WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows[0]) return reply.code(404).send({ error: { message: "Model not found" } });
    return result.rows[0];
  });

  app.get("/admin/requests", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { message: "Invalid limit" } });
    const result = await db.query(
      `SELECT r.*, u.email, m.slug AS selected_model
       FROM request_logs r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN models m ON m.id = r.selected_model_id
       ORDER BY r.created_at DESC LIMIT $1`,
      [query.data.limit]
    );
    return { data: result.rows };
  });

  app.get("/admin/ledger", async (request, reply) => {
    if (!requireAdmin(request, reply, config)) return;
    const result = await db.query(
      `SELECT l.*, u.email
       FROM wallet_ledger_entries l
       JOIN wallets w ON w.id = l.wallet_id
       JOIN users u ON u.id = w.user_id
       ORDER BY l.created_at DESC LIMIT 200`
    );
    return { data: result.rows };
  });

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
