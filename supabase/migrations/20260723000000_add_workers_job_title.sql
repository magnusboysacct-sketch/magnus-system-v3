-- Adds a free-text job title / trade field to workers, editable via the
-- Job Title / Trade dropdown on the Add/Edit Worker form and shown on the ID card.
ALTER TABLE workers ADD COLUMN IF NOT EXISTS job_title text;
