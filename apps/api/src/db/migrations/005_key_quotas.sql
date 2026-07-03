ALTER TABLE api_keys
  ADD COLUMN requests_per_minute integer NOT NULL DEFAULT 60 CHECK (requests_per_minute > 0),
  ADD COLUMN monthly_budget_micro_usd bigint CHECK (monthly_budget_micro_usd IS NULL OR monthly_budget_micro_usd > 0),
  ADD COLUMN max_request_micro_usd bigint CHECK (max_request_micro_usd IS NULL OR max_request_micro_usd > 0),
  ADD COLUMN allowed_models jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE api_key_rate_windows (
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (api_key_id, window_started_at)
);

CREATE INDEX api_key_rate_windows_started_idx ON api_key_rate_windows(window_started_at);

