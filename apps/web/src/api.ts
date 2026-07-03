const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface Overview {
  active_users: number;
  requests_24h: number;
  spend_month_usd: string;
  active_models: number;
}

export interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  status: string;
  balance_micro_usd: string;
  held_micro_usd: string;
  api_key_count: number;
  created_at: string;
}

export interface ProviderRecord {
  id: string;
  slug: string;
  display_name: string;
  base_url: string;
  enabled: boolean;
  priority: number;
  timeout_ms: number;
}

export interface ModelRecord {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_slug: string;
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
}

export interface RequestRecord {
  id: string;
  email: string;
  requested_model: string;
  selected_model: string | null;
  routing_mode: string;
  status: string;
  primary_domain: string | null;
  difficulty: string | null;
  selected_token_budget: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_micro_usd: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface LedgerRecord {
  id: string;
  email: string;
  kind: string;
  amount_micro_usd: string;
  balance_after_micro_usd: string;
  description: string;
  created_at: string;
}

export class ApiClient {
  constructor(private readonly token: string) {}

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? `Request failed with status ${response.status}`);
    return data;
  }

  overview(): Promise<Overview> { return this.request("/admin/overview"); }
  users(): Promise<{ data: UserRecord[] }> { return this.request("/admin/users"); }
  providers(): Promise<{ data: ProviderRecord[] }> { return this.request("/admin/providers"); }
  models(): Promise<{ data: ModelRecord[] }> { return this.request("/admin/models"); }
  requests(): Promise<{ data: RequestRecord[] }> { return this.request("/admin/requests?limit=200"); }
  ledger(): Promise<{ data: LedgerRecord[] }> { return this.request("/admin/ledger"); }

  createProvider(body: Record<string, unknown>): Promise<ProviderRecord> {
    return this.request("/admin/providers", { method: "POST", body: JSON.stringify(body) });
  }

  createModel(body: Record<string, unknown>): Promise<ModelRecord> {
    return this.request("/admin/models", { method: "POST", body: JSON.stringify(body) });
  }

  createUser(email: string, displayName: string): Promise<UserRecord> {
    return this.request("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, display_name: displayName })
    });
  }

  issueKey(userId: string, name: string): Promise<{ api_key: string; prefix: string }> {
    return this.request(`/admin/users/${userId}/keys`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
  }

  credit(userId: string, amountUsd: number): Promise<{ balance_usd: string }> {
    return this.request(`/admin/users/${userId}/credits`, {
      method: "POST",
      body: JSON.stringify({
        amount_usd: amountUsd,
        reference_id: `console-${crypto.randomUUID()}`,
        description: "Console wallet credit"
      })
    });
  }
}

