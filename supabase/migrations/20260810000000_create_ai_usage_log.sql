-- Backs the magnus-ai Edge Function's per-company rate limit (100 calls/hour)
-- added alongside the function's new auth check. Only ever written/read by
-- the Edge Function via the service-role key (which bypasses RLS), so RLS
-- is enabled here with no policies — default-deny for the anon/authenticated
-- roles, consistent with how this project treats every other
-- service-role-only table.
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Speeds up the rate-limit query: count rows for one company_id in the last hour.
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_company_created
  ON ai_usage_log (company_id, created_at);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
