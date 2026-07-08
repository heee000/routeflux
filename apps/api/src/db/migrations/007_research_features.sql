ALTER TABLE request_logs
  ADD COLUMN routing_feature_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN domain_vector jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN difficulty_tier text,
  ADD COLUMN difficulty_dimensions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE request_logs
  ADD CONSTRAINT request_logs_difficulty_tier_valid
    CHECK (difficulty_tier IS NULL OR difficulty_tier IN ('SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING'));
