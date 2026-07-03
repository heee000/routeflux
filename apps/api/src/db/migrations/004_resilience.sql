CREATE TABLE provider_health (
  provider_id uuid PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'open')),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  success_count bigint NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failure_count bigint NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  latency_ema_ms numeric(12,3),
  circuit_open_until timestamptz,
  last_error text,
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE request_logs
  ADD COLUMN provider_attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN fallback_count integer NOT NULL DEFAULT 0;

CREATE TABLE routing_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES request_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score numeric(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  category text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);

CREATE INDEX routing_feedback_request_idx ON routing_feedback(request_id);

CREATE TABLE calibration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  minimum_samples integer NOT NULL,
  updated_models integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
