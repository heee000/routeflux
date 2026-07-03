import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/pool.js";
import { AuthRepository, type Principal } from "../modules/auth/repository.js";
import { QuotaRepository } from "../modules/auth/quota-repository.js";
import type { CatalogRepository } from "../modules/catalog/repository.js";
import type { RoutedModel } from "../modules/catalog/types.js";
import { ProviderHealthRepository, type ProviderAttempt } from "../modules/providers/health-repository.js";
import { callOpenAICompatible } from "../modules/providers/openai-compatible.js";
import { estimateMessageTokens } from "../modules/routing/estimate.js";
import { extractTaskFeatures } from "../modules/routing/features.js";
import { route } from "../modules/routing/router.js";
import type { RouteDecision, ScoredCandidate } from "../modules/routing/types.js";
import { createUsageMeter, usageFromJson, type TokenUsage } from "../modules/usage/metering.js";
import { UsageRepository } from "../modules/usage/repository.js";
import { calculateCharge, microUsdToUsd } from "../modules/wallet/money.js";
import { WalletRepository } from "../modules/wallet/repository.js";
import { chatCompletionSchema, feedbackSchema } from "./schemas.js";

interface RouteDependencies {
  config: AppConfig;
  catalog: CatalogRepository;
  db: Database;
}

function hasVision(messages: unknown[]): boolean {
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const content = (message as Record<string, unknown>).content;
    return Array.isArray(content) && content.some((part) => {
      return !!part && typeof part === "object" && (part as Record<string, unknown>).type === "image_url";
    });
  });
}

function copyResponseHeaders(reply: FastifyReply, response: Response): void {
  const contentType = response.headers.get("content-type");
  if (contentType) reply.header("content-type", contentType);
  const requestId = response.headers.get("x-request-id");
  if (requestId) reply.header("x-upstream-request-id", requestId);
}

function authenticationError(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({
    error: { message: "Invalid or missing API key", type: "authentication_error" }
  });
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export function fallbackCandidates(decision: RouteDecision, maximum = 3): ScoredCandidate[] {
  if (decision.mode === "manual") return decision.ranked.slice(0, 1);
  const selected: ScoredCandidate[] = [];
  const deferred: ScoredCandidate[] = [];
  const models = new Set<string>();
  const providers = new Set<string>();
  for (const candidate of decision.ranked) {
    if (models.has(candidate.model.id)) continue;
    models.add(candidate.model.id);
    if (providers.has(candidate.model.provider.id)) deferred.push(candidate);
    else {
      selected.push(candidate);
      providers.add(candidate.model.provider.id);
    }
    if (selected.length >= maximum) break;
  }
  for (const candidate of deferred) {
    if (selected.length >= maximum) break;
    selected.push(candidate);
  }
  return selected;
}

function routeHeaders(
  reply: FastifyReply,
  requestId: string,
  decision: RouteDecision,
  candidate: ScoredCandidate,
  trace: boolean
): void {
  reply.header("x-request-id", requestId);
  reply.header("x-routeflux-model", candidate.model.slug);
  reply.header("x-routeflux-mode", decision.mode);
  reply.header("x-routeflux-domain", decision.features.primaryDomain);
  reply.header("x-routeflux-difficulty", decision.features.difficulty.toFixed(4));
  reply.header("x-routeflux-token-budget", String(candidate.tokenBudget));
  if (trace) reply.header("x-routeflux-predicted-quality", candidate.predictedQuality.toFixed(5));
}

export async function registerRoutes(app: FastifyInstance, dependencies: RouteDependencies): Promise<void> {
  const auth = new AuthRepository(dependencies.db);
  const wallets = new WalletRepository(dependencies.db);
  const usageLogs = new UsageRepository(dependencies.db);
  const providerHealth = new ProviderHealthRepository(dependencies.db);
  const quotas = new QuotaRepository(dependencies.db);

  const principalFor = async (request: FastifyRequest, reply: FastifyReply): Promise<Principal | null> => {
    const principal = await auth.authenticate(request.headers.authorization);
    if (!principal) authenticationError(reply);
    return principal;
  };

  app.get("/health", async () => ({ status: "ok", version: "0.6.0" }));

  app.get("/v1/models", async (request, reply) => {
    if (!(await principalFor(request, reply))) return;
    const models = await dependencies.catalog.listEnabled();
    return {
      object: "list",
      data: models.map((model) => ({
        id: model.slug,
        object: "model",
        created: 0,
        owned_by: model.provider.slug,
        context_window: model.contextWindow,
        pricing: {
          prompt: model.inputPricePerMillion / 1_000_000,
          completion: model.outputPricePerMillion / 1_000_000
        }
      }))
    };
  });

  app.get("/v1/account/balance", async (request, reply) => {
    const principal = await principalFor(request, reply);
    if (!principal) return;
    const balance = await wallets.getBalance(principal.walletId);
    if (!balance) return reply.code(404).send({ error: { message: "Wallet not found" } });
    return {
      object: "balance",
      currency: balance.currency,
      balance: microUsdToUsd(balance.balanceMicroUsd),
      held: microUsdToUsd(balance.heldMicroUsd),
      available: microUsdToUsd(balance.availableMicroUsd)
    };
  });

  app.post("/v1/feedback", async (request, reply) => {
    const principal = await principalFor(request, reply);
    if (!principal) return;
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: parsed.error.message, type: "invalid_request_error" } });
    }
    const result = await dependencies.db.query<{ id: string }>(
      `INSERT INTO routing_feedback (request_id, user_id, score, category, comment)
       SELECT r.id, $1, $2, $3, $4 FROM request_logs r
       WHERE r.id = $5 AND r.user_id = $1
       ON CONFLICT (request_id, user_id) DO UPDATE SET
         score = EXCLUDED.score, category = EXCLUDED.category,
         comment = EXCLUDED.comment, updated_at = now()
       RETURNING id`,
      [
        principal.userId,
        parsed.data.score,
        parsed.data.category ?? null,
        parsed.data.comment ?? null,
        parsed.data.request_id
      ]
    );
    if (!result.rows[0]) return reply.code(404).send({ error: { message: "Request not found" } });
    return reply.code(201).send({ id: result.rows[0].id, object: "routing_feedback" });
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    const startedAt = Date.now();
    const principal = await principalFor(request, reply);
    if (!principal) return;
    const parsed = chatCompletionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          message: parsed.error.issues.map((issue) => issue.message).join("; "),
          type: "invalid_request_error"
        }
      });
    }

    const body = parsed.data;
    const rateLimit = await quotas.consumeRateLimit(principal);
    reply.header("x-ratelimit-limit-requests", String(rateLimit.limit));
    reply.header("x-ratelimit-remaining-requests", String(rateLimit.remaining));
    reply.header("x-ratelimit-reset-requests", String(rateLimit.resetEpochSeconds));
    if (!rateLimit.allowed) {
      reply.header("retry-after", String(Math.max(1, rateLimit.resetEpochSeconds - Math.floor(Date.now() / 1000))));
      return reply.code(429).send({
        error: { message: "API key rate limit exceeded", type: "rate_limit_error" }
      });
    }

    const catalogModels = await dependencies.catalog.listEnabled();
    const models = principal.allowedModels.length
      ? catalogModels.filter((model) => principal.allowedModels.includes(model.slug))
      : catalogModels;
    const features = extractTaskFeatures(body.messages, body.tools ?? [], body.routing?.domains ?? []);
    const promptTokensEstimate = features.promptTokens || estimateMessageTokens(body.messages);
    let decision: RouteDecision;
    try {
      decision = route(models, {
        requestedModel: body.model,
        promptTokensEstimate,
        ...((body.max_completion_tokens ?? body.max_tokens) !== undefined
          ? { maxOutputTokens: body.max_completion_tokens ?? body.max_tokens }
          : {}),
        requiresTools: !!body.tools?.length,
        requiresVision: hasVision(body.messages),
        requiresJson: body.response_format?.type === "json_object",
        features,
        policy: {
          maxCostUsd: body.routing?.max_cost_usd,
          maxLatencyMs: body.routing?.max_latency_ms,
          minQuality: body.routing?.min_quality,
          tokenBudget: body.routing?.token_budget
        }
      });
    } catch (error) {
      return reply.code(400).send({
        error: {
          message: error instanceof Error ? error.message : "Routing failed",
          type: "routing_error"
        }
      });
    }

    const candidates = fallbackCandidates(decision);
    const requestId = randomUUID();
    const reservationPromptTokens = Math.ceil(promptTokensEstimate * 1.25 + 64);
    const reservationMicroUsd = Math.max(...candidates.map((candidate) => {
      return calculateCharge(candidate.model, reservationPromptTokens, candidate.tokenBudget).costMicroUsd;
    }), 1);
    const budget = await quotas.checkBudget(principal, reservationMicroUsd);
    if (!budget.allowed) {
      return reply.code(402).send({
        error: {
          message: budget.reason === "max_request"
            ? "Predicted request cost exceeds the API key limit"
            : "API key monthly budget exceeded",
          type: "quota_exceeded",
          limit_usd: budget.limitMicroUsd === null ? null : microUsdToUsd(budget.limitMicroUsd),
          spent_usd: microUsdToUsd(budget.spentMicroUsd)
        }
      });
    }
    const hasFunds = await wallets.reserve(principal.walletId, requestId, reservationMicroUsd);
    if (!hasFunds) {
      return reply.code(402).send({
        error: { message: "Insufficient wallet balance", type: "insufficient_balance" }
      });
    }

    try {
      await usageLogs.start(requestId, principal, body.model, decision);
    } catch (error) {
      await wallets.release(requestId);
      throw error;
    }

    const attempts: ProviderAttempt[] = [];
    let finalCandidate = candidates[0]!;
    let finalized = false;
    let streamFailed = false;
    let currentController: AbortController | null = null;
    let currentTimeout: ReturnType<typeof setTimeout> | null = null;
    const clearAttemptTimeout = (): void => {
      if (currentTimeout) clearTimeout(currentTimeout);
      currentTimeout = null;
    };
    const finalizeTokens = async (tokens: TokenUsage): Promise<void> => {
      if (finalized) return;
      finalized = true;
      const charge = calculateCharge(finalCandidate.model, tokens.promptTokens, tokens.completionTokens);
      await wallets.settle(requestId, charge.costMicroUsd, {
        model: finalCandidate.model.slug,
        prompt_tokens: tokens.promptTokens,
        completion_tokens: tokens.completionTokens,
        fallback_count: Math.max(0, attempts.length - 1)
      });
      if (streamFailed) {
        await usageLogs.failCharged(
          requestId,
          "stream_error",
          charge,
          Date.now() - startedAt,
          finalCandidate.model.id,
          attempts
        );
      } else {
        await usageLogs.succeed(
          requestId,
          charge,
          Date.now() - startedAt,
          finalCandidate.model.id,
          attempts
        );
      }
    };
    const finalizeFailure = async (code: string): Promise<void> => {
      if (finalized) return;
      finalized = true;
      await wallets.release(requestId);
      await usageLogs.fail(requestId, code, Date.now() - startedAt, attempts);
    };

    request.raw.once("aborted", () => {
      currentController?.abort();
      void finalizeFailure("client_aborted");
    });
    reply.raw.once("close", () => {
      if (!reply.raw.writableEnded) {
        currentController?.abort();
        void finalizeFailure("client_disconnected");
      }
    });

    const { routing: _routing, ...providerRequestBody } = body;
    let selectedResponse: Response | null = null;
    let lastError: unknown = null;

    for (let index = 0; index < candidates.length; index += 1) {
      if (finalized) break;
      const candidate = candidates[index]!;
      finalCandidate = candidate;
      currentController = new AbortController();
      currentTimeout = setTimeout(() => currentController?.abort(), candidate.model.provider.timeoutMs);
      const attemptStarted = Date.now();
      try {
        const upstream = await callOpenAICompatible(
          candidate.model,
          {
            ...providerRequestBody,
            max_tokens: candidate.tokenBudget,
            ...(body.stream ? { stream_options: { include_usage: true } } : {})
          },
          dependencies.config.MASTER_KEY,
          currentController.signal
        );
        const latencyMs = Date.now() - attemptStarted;
        const retryable = retryableStatus(upstream.response.status);
        if (retryable && index < candidates.length - 1) {
          const message = (await upstream.response.text()).slice(0, 500);
          attempts.push({
            provider: candidate.model.provider.slug,
            model: candidate.model.slug,
            token_budget: candidate.tokenBudget,
            status: upstream.response.status,
            latency_ms: latencyMs,
            outcome: "retryable_error",
            error: message
          });
          await providerHealth.recordFailure(candidate.model.provider.id, `HTTP ${upstream.response.status}: ${message}`);
          clearAttemptTimeout();
          continue;
        }
        selectedResponse = upstream.response;
        attempts.push({
          provider: candidate.model.provider.slug,
          model: candidate.model.slug,
          token_budget: candidate.tokenBudget,
          status: upstream.response.status,
          latency_ms: latencyMs,
          outcome: upstream.response.ok ? "success" : retryable ? "retryable_error" : "terminal_error"
        });
        if (retryable) {
          await providerHealth.recordFailure(candidate.model.provider.id, `HTTP ${upstream.response.status}`);
        } else {
          await providerHealth.recordSuccess(candidate.model.provider.id, latencyMs);
        }
        break;
      } catch (error) {
        clearAttemptTimeout();
        lastError = error;
        const message = error instanceof Error ? error.message : "Provider request failed";
        attempts.push({
          provider: candidate.model.provider.slug,
          model: candidate.model.slug,
          token_budget: candidate.tokenBudget,
          status: null,
          latency_ms: Date.now() - attemptStarted,
          outcome: "error",
          error: message
        });
        await providerHealth.recordFailure(candidate.model.provider.id, message);
      }
    }

    if (!selectedResponse) {
      clearAttemptTimeout();
      await finalizeFailure("all_providers_failed");
      request.log.error({ err: lastError, requestId, attempts }, "all provider attempts failed");
      if (!reply.sent) {
        return reply.code(502).send({
          error: { message: "All eligible providers failed", type: "upstream_error" }
        });
      }
      return;
    }

    routeHeaders(reply, requestId, decision, finalCandidate, !!body.routing?.trace);
    copyResponseHeaders(reply, selectedResponse);
    reply.code(selectedResponse.status);

    if (!selectedResponse.ok) {
      clearAttemptTimeout();
      const errorBody = await selectedResponse.text();
      await finalizeFailure(`upstream_${selectedResponse.status}`);
      return reply.send(errorBody);
    }

    if (!body.stream) {
      try {
        const responseBody = await selectedResponse.text();
        clearAttemptTimeout();
        await finalizeTokens(usageFromJson(responseBody, promptTokensEstimate));
        return reply.send(responseBody);
      } catch (error) {
        clearAttemptTimeout();
        await finalizeFailure(error instanceof Error && error.name === "AbortError" ? "upstream_timeout" : "upstream_error");
        return reply.code(502).send({
          error: { message: error instanceof Error ? error.message : "Upstream response failed", type: "upstream_error" }
        });
      }
    }

    if (!selectedResponse.body) {
      clearAttemptTimeout();
      await finalizeFailure("empty_stream");
      return reply.code(502).send({
        error: { message: "Upstream returned an empty stream", type: "upstream_error" }
      });
    }

    reply.header("cache-control", "no-cache");
    reply.header("connection", "keep-alive");
    const source = Readable.fromWeb(selectedResponse.body as import("node:stream/web").ReadableStream);
    const meter = createUsageMeter(
      promptTokensEstimate,
      async (tokens) => {
        clearAttemptTimeout();
        await finalizeTokens(tokens);
      },
      (error) => request.log.error({ err: error, requestId }, "stream settlement failed")
    );
    source.once("error", (error) => {
      streamFailed = true;
      clearAttemptTimeout();
      request.log.error({ err: error, requestId }, "upstream stream failed");
      meter.end();
    });
    return reply.send(source.pipe(meter));
  });
}
