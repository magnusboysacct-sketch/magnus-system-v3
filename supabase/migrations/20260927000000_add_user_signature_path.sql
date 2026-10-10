-- Add user_profiles.signature_path (applied directly to the live database; this file version-controls it).
-- A user's personal signature: a storage PATH in the private private-files bucket (<companyId>/user-signatures/<userId>_<ts>.png),
-- never a URL, signed on read like the contract signatures. When it is null the company default (company_settings.signature_url) is
-- used instead. Users set it on their own row through the existing own-row UPDATE policy on user_profiles.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS signature_path text;
