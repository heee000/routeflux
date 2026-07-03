ALTER TABLE request_logs
  ADD COLUMN primary_domain text,
  ADD COLUMN difficulty numeric(5,4),
  ADD COLUMN predicted_output_tokens integer,
  ADD COLUMN selected_token_budget integer,
  ADD COLUMN predicted_quality numeric(6,5),
  ADD COLUMN candidate_scores jsonb NOT NULL DEFAULT '[]'::jsonb;

