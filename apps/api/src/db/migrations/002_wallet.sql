CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_user_status_idx ON api_keys(user_id, status);

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  balance_micro_usd bigint NOT NULL DEFAULT 0 CHECK (balance_micro_usd >= 0),
  held_micro_usd bigint NOT NULL DEFAULT 0 CHECK (held_micro_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (held_micro_usd <= balance_micro_usd)
);

CREATE TABLE wallet_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('credit', 'usage', 'refund', 'adjustment')),
  amount_micro_usd bigint NOT NULL CHECK (amount_micro_usd <> 0),
  balance_after_micro_usd bigint NOT NULL CHECK (balance_after_micro_usd >= 0),
  reference_id text,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wallet_ledger_reference_kind_idx
  ON wallet_ledger_entries(wallet_id, reference_id, kind)
  WHERE reference_id IS NOT NULL;
CREATE INDEX wallet_ledger_wallet_created_idx ON wallet_ledger_entries(wallet_id, created_at DESC);

CREATE TABLE wallet_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  amount_micro_usd bigint NOT NULL CHECK (amount_micro_usd > 0),
  settled_micro_usd bigint,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'released')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wallet_holds_wallet_status_idx ON wallet_holds(wallet_id, status);

CREATE TABLE request_logs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE RESTRICT,
  requested_model text NOT NULL,
  selected_model_id uuid REFERENCES models(id) ON DELETE SET NULL,
  routing_mode text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  prompt_tokens integer,
  completion_tokens integer,
  cost_micro_usd bigint,
  latency_ms integer,
  error_code text,
  route_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX request_logs_user_created_idx ON request_logs(user_id, created_at DESC);
CREATE INDEX request_logs_model_created_idx ON request_logs(selected_model_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_ledger_no_update
BEFORE UPDATE OR DELETE ON wallet_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

