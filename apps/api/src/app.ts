import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { CatalogRepository } from "./modules/catalog/repository.js";
import type { Database } from "./db/pool.js";
import { registerRoutes } from "./http/routes.js";

export interface AppDependencies {
  config: AppConfig;
  db: Database;
}

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: dependencies.config.LOG_LEVEL,
      redact: ["req.headers.authorization", "request.headers.authorization"]
    },
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024
  });
  await app.register(sensible);
  await app.register(cors, { origin: false });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  const catalog = new CatalogRepository(dependencies.db);
  await registerRoutes(app, { config: dependencies.config, catalog });
  return app;
}

