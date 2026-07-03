import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  MASTER_KEY: z.string().min(1),
  ADMIN_TOKEN: z.string().min(16),
  BOOTSTRAP_PROVIDER_NAME: z.string().optional(),
  BOOTSTRAP_PROVIDER_BASE_URL: z.string().url().optional(),
  BOOTSTRAP_PROVIDER_API_KEY: z.string().optional(),
  BOOTSTRAP_PROVIDER_MODELS: z.string().optional()
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}

