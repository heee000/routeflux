import { z } from "zod";

const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().optional()
);
const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  MASTER_KEY: z.string().min(1),
  ADMIN_TOKEN: z.string().min(16),
  BOOTSTRAP_PROVIDER_NAME: optionalText,
  BOOTSTRAP_PROVIDER_BASE_URL: optionalUrl,
  BOOTSTRAP_PROVIDER_API_KEY: optionalText,
  BOOTSTRAP_PROVIDER_MODELS: optionalText
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
