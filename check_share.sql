select
  (select logo_url from company_settings where logo_url is not null limit 1) as a_logo_url,
  (select count(*) from photo_share_links where expires_at is null)        as photo_links_without_expiry,
  (select count(*) from pg_proc where proname = 'get_share_preview')        as fn;