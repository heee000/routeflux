import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/pool.js";
import { AuthRepository, type Principal } from "../modules/auth/repository.js";
import type { CatalogRepository } from "../modules/catalog/repository.js";
import { callOpenAICompatible } from "../modules/providers/openai-compatible.js";
import { estimateMessageTokens } from "../modules/routing/estimate.js";
import { route } from "../modules/routing/router.js";
import { createUsageMeter, usageFromJson, type TokenUsage } from "../modules/usage/metering.js";
import { UsageRepository } from "../modules/usage/repository.js";
import { calculateCharge, microUsdToUsd } from "../modules/wallet/money.js";
import { WalletRepository } from "../modules/wallet/repository.js";
import { chatCompletionSchema } from "./schemas.js";

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

export async function registerRoutes(app: FastifyInstance, dependencies: RouteDependencies): Promise<void> {
  const auth = new AuthRepository(dependencies.db);
  const wallets = new WalletRepository(dependencies.db);
  const usageLogs = new UsageRepository(dependencies.db);

  const principalFor = async (request: FastifyRequest, reply: FastifyReply): Promise<Principal | null> => {
    const principal = await auth.authenticate(request.headers.authorization);
    if (!principal) authenticationError(reply);
    return principal;
  };

  app.get("/health", async () => ({ status: "ok", version: "0.2.0" }));

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
    const models = await dependencies.catalog.listEnabled();
    const promptTokensEstimate = estimateMessageTokens(body.messages);
    let decision;
    try {
      decision = route(models, {
        requestedModel: body.model,
        promptTokensEstimate,
        ...((body.max_completion_tokens ?? body.max_tokens) !== undefined
          ? { maxOutputTokens: body.max_completion_tokens ?? body.max_tokens }
          : {}),
        requiresTools: !!body.tools?.length,
        requiresVision: hasVision(body.messages),
        requiresJson: body.response_format?.type === "json_object"
      });
    } catch (error) {
      return reply.code(400).send({
        error: {
          message: error instanceof Error ? error.message : "Routing failed",
          type: "routing_error"
        }
      });
    }

    const requestId = randomUUID();
    const reservationPromptTokens = Math.ceil(promptTokensEstimate * 1.25 + 64);
    const reserved = calculateCharge(decision.selected, reservationPromptTokens, decision.maxOutputTokens);
    const hasFunds = await wallets.reserve(principal.walletId, requestId, Math.max(1, reserved.costMicroUsd));
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

    reply.header("x-request-id", requestId);
    reply.header("x-routeflux-model", decision.selected.slug);
    reply.header("x-routeflux-mode", decision.mode);

    let finalized = false;
    const finalizeSuccess = async (tokens: TokenUsage): Promise<void> => {
      if (finalized) return;
      finalized = true;
      const charge = calculateCharge(decision.selected, tokens.promptTokens, tokens.completionTokens);
      await wallets.settle(requestId, charge.costMicroUsd, {
        model: decision.selected.slug,
        prompt_tokens: tokens.promptTokens,
        completion_tokens: tokens.completionTokens
      });
      await usageLogs.succeed(requestId, charge, Date.now() - startedAt);
    };
    const finalizeFailure = async (code: string): Promise<void> => {
      if (finalized) return;
      finalized = true;
      await wallets.release(requestId);
      await usageLogs.fail(requestId, code, Date.now() - startedAt);
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), decision.selected.provider.timeoutMs);
    request.raw.once("aborted", () => {
      controller.abort();
      void finalizeFailure("client_aborted");
    });
    reply.raw.once("close", () => {
      if (!reply.raw.writableEnded) {
        controller.abort();
        void finalizeFailure("client_disconnected");
      }
    });

    try {
      const upstreamBody: Record<string, unknown> = {
        ...body,
        max_tokens: decision.maxOutputTokens,
        ...(body.stream ? { stream_options: { include_usage: true } } : {})
      };
      const upstream = await callOpenAICompatible(
        decision.selected,
        upstreamBody,
        dependencies.config.MASTER_KEY,
        controller.signal
      );
      copyResponseHeaders(reply, upstream.response);
      reply.code(upstream.response.status);

      if (!upstream.response.ok) {
        clearTimeout(timeout);
        const errorBody = await upstream.response.text();
        await finalizeFailure(`upstream_${upstream.response.status}`);
        return reply.send(errorBody);
      }

      if (!body.stream) {
        clearTimeout(timeout);
        const responseBody = await upstream.response.text();
        await finalizeSuccess(usageFromJson(responseBody, promptTokensEstimate));
        return reply.send(responseBody);
      }

      if (!upstream.response.body) {
        clearTimeout(timeout);
        await finalizeFailure("empty_stream");
        return reply.code(502).send({
          error: { message: "Upstream returned an empty stream", type: "upstream_error" }
        });
      }

      reply.header("cache-control", "no-cache");
      reply.header("connection", "keep-alive");
      const source = Readable.fromWeb(upstream.response.body as import("node:stream/web").ReadableStream);
      const meter = createUsageMeter(
        promptTokensEstimate,
        async (tokens) => {
          clearTimeout(timeout);
          await finalizeSuccess(tokens);
        },
        (error) => request.log.error({ err: error, requestId }, "stream settlement failed")
      );
      source.once("error", (error) => {
        clearTimeout(timeout);
        request.log.error({ err: error, requestId }, "upstream stream failed");
        void finalizeFailure("stream_error");
      });
      return reply.send(source.pipe(meter));
    } catch (error) {
      clearTimeout(timeout);
      await finalizeFailure(error instanceof Error && error.name === "AbortError" ? "upstream_timeout" : "upstream_error");
      request.log.error({ err: error, model: decision.selected.slug, requestId }, "upstream request failed");
      if (!reply.sent) {
        return reply.code(502).send({
          error: {
            message: error instanceof Error ? error.message : "Upstream request failed",
            type: "upstream_error"
          }
        });
      }
    }
  });
}
