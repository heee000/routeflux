import type { Database } from "../../db/pool.js";
import type { ModelRecord, ProviderRecord, RoutedModel } from "./types.js";

interface ModelRow {
  id: string;
  provider_id: string;
  slug: string;
  upstream_model: string;
  display_name: string;
  enabled: boolean;
  context_window: number;
  max_output_tokens: number;
  input_price_per_million: string;
  output_price_per_million: string;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_json: boolean;
  domains: Record<string, number>;
  metadata: Record<string, unknown>;
  provider_slug: string;
  provider_display_name: string;
  provider_base_url: string;
  provider_api_key_ciphertext: string;
  provider_enabled: boolean;
  provider_priority: number;
  provider_timeout_ms: number;
  provider_health_status: "healthy" | "degraded" | "open" | null;
  provider_circuit_open_until: string | null;
  provider_latency_ema_ms: string | null;
}

function mapRow(row: ModelRow): RoutedModel {
  const provider: ProviderRecord = {
    id: row.provider_id,
    slug: row.provider_slug,
    displayName: row.provider_display_name,
    baseUrl: row.provider_base_url,
    apiKeyCiphertext: row.provider_api_key_ciphertext,
    enabled: row.provider_enabled,
    priority: row.provider_priority,
    timeoutMs: row.provider_timeout_ms,
    healthStatus: row.provider_health_status ?? "healthy",
    circuitOpenUntil: row.provider_circuit_open_until,
    latencyEmaMs: row.provider_latency_ema_ms === null ? null : Number(row.provider_latency_ema_ms)
  };
  const model: ModelRecord = {
    id: row.id,
    providerId: row.provider_id,
    slug: row.slug,
    upstreamModel: row.upstream_model,
    displayName: row.display_name,
    enabled: row.enabled,
    contextWindow: row.context_window,
    maxOutputTokens: row.max_output_tokens,
    inputPricePerMillion: Number(row.input_price_per_million),
    outputPricePerMillion: Number(row.output_price_per_million),
    supportsTools: row.supports_tools,
    supportsVision: row.supports_vision,
    supportsJson: row.supports_json,
    domains: row.domains,
    metadata: row.metadata
  };
  return { ...model, provider };
}

const SELECT_MODELS = `
  SELECT
    m.*,
    p.slug AS provider_slug,
    p.display_name AS provider_display_name,
    p.base_url AS provider_base_url,
    p.api_key_ciphertext AS provider_api_key_ciphertext,
    p.enabled AS provider_enabled,
    p.priority AS provider_priority,
    p.timeout_ms AS provider_timeout_ms
    , h.status AS provider_health_status
    , h.circuit_open_until AS provider_circuit_open_until
    , h.latency_ema_ms AS provider_latency_ema_ms
  FROM models m
  JOIN providers p ON p.id = m.provider_id
  LEFT JOIN provider_health h ON h.provider_id = p.id
`;

export class CatalogRepository {
  constructor(private readonly db: Database) {}

  async listEnabled(): Promise<RoutedModel[]> {
    const result = await this.db.query<ModelRow>(
      `${SELECT_MODELS} WHERE m.enabled = true AND p.enabled = true ORDER BY p.priority, m.slug`
    );
    return result.rows.map(mapRow);
  }

  async findBySlug(slug: string): Promise<RoutedModel | null> {
    const result = await this.db.query<ModelRow>(
      `${SELECT_MODELS} WHERE m.slug = $1 AND m.enabled = true AND p.enabled = true LIMIT 1`,
      [slug]
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }
}
