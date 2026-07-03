CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  base_url text NOT NULL,
  api_key_ciphertext text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  timeout_ms integer NOT NULL DEFAULT 60000 CHECK (timeout_ms > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  upstream_model text NOT NULL,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  context_window integer NOT NULL CHECK (context_window > 0),
  max_output_tokens integer NOT NULL CHECK (max_output_tokens > 0),
  input_price_per_million numeric(18,8) NOT NULL DEFAULT 0 CHECK (input_price_per_million >= 0),
  output_price_per_million numeric(18,8) NOT NULL DEFAULT 0 CHECK (output_price_per_million >= 0),
  supports_tools boolean NOT NULL DEFAULT false,
  supports_vision boolean NOT NULL DEFAULT false,
  supports_json boolean NOT NULL DEFAULT true,
  domains jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, upstream_model)
);

CREATE INDEX models_provider_enabled_idx ON models(provider_id, enabled);

