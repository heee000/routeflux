import type { AppConfig } from "../../config.js";
import type { Database } from "../../db/pool.js";
import { encryptSecret } from "../../security/crypto.js";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function bootstrapCatalog(db: Database, config: AppConfig): Promise<void> {
  const name = config.BOOTSTRAP_PROVIDER_NAME?.trim();
  const baseUrl = config.BOOTSTRAP_PROVIDER_BASE_URL?.trim();
  const apiKey = config.BOOTSTRAP_PROVIDER_API_KEY?.trim();
  const modelNames = config.BOOTSTRAP_PROVIDER_MODELS
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  if (!name || !baseUrl || !apiKey || !modelNames?.length) return;

  const providerSlug = slugify(name);
  const provider = await db.query<{ id: string }>(
    `INSERT INTO providers (slug, display_name, base_url, api_key_ciphertext)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       base_url = EXCLUDED.base_url,
       api_key_ciphertext = EXCLUDED.api_key_ciphertext,
       updated_at = now()
     RETURNING id`,
    [providerSlug, name, baseUrl.replace(/\/$/, ""), encryptSecret(apiKey, config.MASTER_KEY)]
  );
  const providerId = provider.rows[0]!.id;

  for (const upstreamModel of modelNames) {
    const modelSlug = `${providerSlug}/${slugify(upstreamModel)}`;
    await db.query(
      `INSERT INTO models (
         provider_id, slug, upstream_model, display_name, context_window, max_output_tokens
       ) VALUES ($1, $2, $3, $4, 131072, 8192)
       ON CONFLICT (provider_id, upstream_model) DO UPDATE SET
         slug = EXCLUDED.slug,
         display_name = EXCLUDED.display_name,
         enabled = true,
         updated_at = now()`,
      [providerId, modelSlug, upstreamModel, upstreamModel]
    );
  }
}

