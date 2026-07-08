import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Database } from "../src/db/pool.js";
import type { Principal } from "../src/modules/auth/repository.js";
import type { RoutedModel } from "../src/modules/catalog/types.js";
import { extractTaskFeatures } from "../src/modules/routing/features.js";
import { route } from "../src/modules/routing/router.js";
import { UsageRepository } from "../src/modules/usage/repository.js";

const connectionString = process.env.TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration("routing feature PostgreSQL integration", () => {
  let db: Database;
  let usage: UsageRepository;
  let principal: Principal;
  let model: RoutedModel;

  beforeAll(async () => {
    db = createPool(connectionString!);
    usage = new UsageRepository(db);
    const user = await db.query<{ id: string }>(
      "INSERT INTO users (email, display_name) VALUES ($1, 'Routing Integration') RETURNING id",
      [`routing-${randomUUID()}@example.test`]
    );
    const userId = user.rows[0]!.id;
    const wallet = await db.query<{ id: string }>(
      "INSERT INTO wallets (user_id, balance_micro_usd) VALUES ($1, 1000) RETURNING id",
      [userId]
    );
    const key = await db.query<{ id: string }>(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
       VALUES ($1, 'routing-integration', 'rf_test', $2) RETURNING id`,
      [userId, randomUUID()]
    );
    const provider = await db.query<{ id: string }>(
      `INSERT INTO providers (slug, display_name, base_url, api_key_ciphertext)
       VALUES ($1, 'Integration', 'https://example.test/v1', 'encrypted') RETURNING id`,
      [`integration-${randomUUID()}`]
    );
    const modelRow = await db.query<{ id: string }>(
      `INSERT INTO models (
         provider_id, slug, upstream_model, display_name, context_window, max_output_tokens,
         input_price_per_million, output_price_per_million, domains, metadata
       ) VALUES ($1, $2, 'integration', 'Integration', 32000, 4096, 1, 2, $3, $4)
       RETURNING id`,
      [
        provider.rows[0]!.id,
        `integration/model-${randomUUID()}`,
        JSON.stringify({ code_debugging: 1 }),
        JSON.stringify({ qualityScore: 0.8, difficultyCapacity: 0.8, latencyMs: 100 })
      ]
    );
    principal = {
      userId,
      apiKeyId: key.rows[0]!.id,
      walletId: wallet.rows[0]!.id,
      email: "routing@example.test",
      requestsPerMinute: 60,
      monthlyBudgetMicroUsd: null,
      maxRequestMicroUsd: null,
      allowedModels: []
    };
    model = {
      id: modelRow.rows[0]!.id,
      providerId: provider.rows[0]!.id,
      slug: "integration/model",
      upstreamModel: "integration",
      displayName: "Integration",
      enabled: true,
      contextWindow: 32000,
      maxOutputTokens: 4096,
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      supportsTools: false,
      supportsVision: false,
      supportsJson: true,
      domains: { code_debugging: 1 },
      metadata: { qualityScore: 0.8, difficultyCapacity: 0.8, latencyMs: 100 },
      provider: {
        id: provider.rows[0]!.id,
        slug: "integration",
        displayName: "Integration",
        baseUrl: "https://example.test/v1",
        apiKeyCiphertext: "encrypted",
        enabled: true,
        priority: 100,
        timeoutMs: 1000,
        healthStatus: "healthy",
        circuitOpenUntil: null,
        latencyEmaMs: null
      }
    };
  });

  afterAll(async () => {
    if (db) await db.end();
  });

  it("persists the 12-domain vector and 14 difficulty dimensions", async () => {
    const features = extractTaskFeatures([{
      role: "user",
      content: "Debug this TypeScript transaction error and explain the root cause."
    }]);
    const decision = route([model], {
      requestedModel: model.slug,
      promptTokensEstimate: features.promptTokens,
      requiresTools: false,
      requiresVision: false,
      requiresJson: false,
      features
    });
    const requestId = randomUUID();
    await usage.start(requestId, principal, model.slug, decision);
    const saved = await db.query<{
      routing_feature_version: string;
      domain_vector: Record<string, number>;
      difficulty_tier: string;
      difficulty_dimensions: unknown[];
    }>(
      `SELECT routing_feature_version, domain_vector, difficulty_tier, difficulty_dimensions
       FROM request_logs WHERE id = $1`,
      [requestId]
    );
    expect(saved.rows[0]!.routing_feature_version).toBe("domainrouter-12d-14d-v1");
    expect(Object.keys(saved.rows[0]!.domain_vector)).toHaveLength(12);
    expect(saved.rows[0]!.difficulty_tier).toMatch(/SIMPLE|MEDIUM|COMPLEX|REASONING/);
    expect(saved.rows[0]!.difficulty_dimensions).toHaveLength(14);
  });
});
