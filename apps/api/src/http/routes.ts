import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { CatalogRepository } from "../modules/catalog/repository.js";
import { callOpenAICompatible } from "../modules/providers/openai-compatible.js";
import { estimateMessageTokens } from "../modules/routing/estimate.js";
import { route } from "../modules/routing/router.js";
import { chatCompletionSchema } from "./schemas.js";

interface RouteDependencies {
  config: AppConfig;
  catalog: CatalogRepository;
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

async function sendUpstream(reply: FastifyReply, response: Response, stream: boolean): Promise<void> {
  reply.code(response.status);
  const contentType = response.headers.get("content-type");
  if (contentType) reply.header("content-type", contentType);
  if (!response.ok || !stream) {
    reply.send(await response.text());
    return;
  }
  if (!response.body) {
    reply.code(502).send({ error: { message: "Upstream returned an empty stream", type: "upstream_error" } });
    return;
  }
  reply.header("cache-control", "no-cache");
  reply.header("connection", "keep-alive");
  reply.send(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream));
}

export async function registerRoutes(app: FastifyInstance, dependencies: RouteDependencies): Promise<void> {
  app.get("/health", async () => ({ status: "ok", version: "0.1.0" }));

  app.get("/v1/models", async () => {
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

  app.post("/v1/chat/completions", async (request, reply) => {
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
    let decision;
    try {
      decision = route(models, {
        requestedModel: body.model,
        promptTokensEstimate: estimateMessageTokens(body.messages),
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

    reply.header("x-routeflux-model", decision.selected.slug);
    reply.header("x-routeflux-mode", decision.mode);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), decision.selected.provider.timeoutMs);
    request.raw.once("aborted", () => controller.abort());
    reply.raw.once("close", () => {
      if (!reply.raw.writableEnded) controller.abort();
    });
    try {
      const upstream = await callOpenAICompatible(
        decision.selected,
        { ...body, max_tokens: decision.maxOutputTokens },
        dependencies.config.MASTER_KEY,
        controller.signal
      );
      await sendUpstream(reply, upstream.response, body.stream);
    } catch (error) {
      request.log.error({ err: error, model: decision.selected.slug }, "upstream request failed");
      if (!reply.sent) {
        return reply.code(502).send({
          error: {
            message: error instanceof Error ? error.message : "Upstream request failed",
            type: "upstream_error"
          }
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  });
}
