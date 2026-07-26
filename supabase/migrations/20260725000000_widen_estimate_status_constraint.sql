-- estimate_headers.status is used as a full lifecycle (draft -> sent ->
-- approved/declined) via EstimatesPage's updateStatus() and the Send/Decline
-- actions, but the original CHECK constraint only allowed
-- draft/approved/archived. Widen it to match actual app usage.
ALTER TABLE estimate_headers
  DROP CONSTRAINT IF EXISTS estimate_headers_status_check;

ALTER TABLE estimate_headers
  ADD CONSTRAINT estimate_headers_status_check
  CHECK (status IN ('draft', 'sent', 'approved', 'declined', 'archived'));
