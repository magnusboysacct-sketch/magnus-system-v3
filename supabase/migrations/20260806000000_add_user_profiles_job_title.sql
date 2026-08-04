-- Adds a free-text job title field to user_profiles (internal staff),
-- mirroring workers.job_title (see 20260723000000_add_workers_job_title.sql).
-- Distinct from `role`, which stays a fixed permission enum — job_title is
-- purely descriptive/display (Edit Staff Details form, shown on StaffIDCard).
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS job_title text;
