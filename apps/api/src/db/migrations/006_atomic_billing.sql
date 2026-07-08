ALTER TABLE wallet_holds
  ADD COLUMN api_key_id uuid REFERENCES api_keys(id) ON DELETE RESTRICT;

UPDATE wallet_holds h
SET api_key_id = r.api_key_id
FROM request_logs r
WHERE r.id = h.request_id
  AND h.api_key_id IS NULL;

CREATE INDEX wallet_holds_api_key_status_idx
  ON wallet_holds(api_key_id, status)
  WHERE api_key_id IS NOT NULL;

ALTER TABLE request_logs
  ADD COLUMN provider_cost_micro_usd bigint,
  ADD COLUMN billing_shortfall_micro_usd bigint NOT NULL DEFAULT 0;

ALTER TABLE request_logs
  ADD CONSTRAINT request_logs_provider_cost_nonnegative
    CHECK (provider_cost_micro_usd IS NULL OR provider_cost_micro_usd >= 0),
  ADD CONSTRAINT request_logs_billing_shortfall_nonnegative
    CHECK (billing_shortfall_micro_usd >= 0);
