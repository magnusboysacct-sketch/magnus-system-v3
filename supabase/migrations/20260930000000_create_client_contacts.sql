-- Client contacts (applied directly to the live database; this file version-controls it).
-- Several named contact people per client (client_contacts), exactly one of them primary. The primary contact is mirrored onto the
-- client's own contact_name / phone / email by trigger, so everything that already reads those columns keeps working unchanged.
-- Also adds projects.contact_id (a project's contact, cleared automatically if it isn't one of the project's client's contacts) and a
-- one-time backfill that turns each existing client contact person into that client's primary contact.
BEGIN;

-- 1. The table: several named contact people per client.
CREATE TABLE IF NOT EXISTS public.client_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name        text NOT NULL,
  title       text,
  phone       text,
  email       text,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id  ON public.client_contacts (client_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_company_id ON public.client_contacts (company_id);

-- 2. At most ONE primary contact per client (a safety net: the trigger below normally keeps this true by itself).
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_contacts_one_primary ON public.client_contacts (client_id) WHERE is_primary;

-- 3. Company-scoped access, the same pattern as the other company tables.
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_contacts_select ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_insert ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_update ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_delete ON public.client_contacts;

CREATE POLICY client_contacts_select ON public.client_contacts FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

-- A contact can only be attached to a client of the SAME company.
CREATE POLICY client_contacts_insert ON public.client_contacts FOR INSERT TO authenticated
WITH CHECK (
  company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_contacts.client_id AND c.company_id = client_contacts.company_id)
);

CREATE POLICY client_contacts_update ON public.client_contacts FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))
WITH CHECK (
  company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_contacts.client_id AND c.company_id = client_contacts.company_id)
);

CREATE POLICY client_contacts_delete ON public.client_contacts FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

-- 4. Keeping exactly one primary. BEFORE a contact is written:
--    * a client's only contact is always the primary;
--    * marking a contact primary un-marks the client's previous primary (so the app needs ONE update to switch primaries).
--    The flag stops the mirror trigger below from reacting to that internal un-marking.
CREATE OR REPLACE FUNCTION public.client_contacts_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;

  IF NOT NEW.is_primary
     AND NOT EXISTS (SELECT 1 FROM public.client_contacts WHERE client_id = NEW.client_id AND id <> NEW.id) THEN
    NEW.is_primary := true;
  END IF;

  IF NEW.is_primary THEN
    PERFORM set_config('client_contacts.switching', 'on', true);
    UPDATE public.client_contacts SET is_primary = false
    WHERE client_id = NEW.client_id AND is_primary AND id <> NEW.id;
    PERFORM set_config('client_contacts.switching', 'off', true);
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Mirror the primary contact onto the client's own contact_name / phone / email, so everything that already reads those columns
--    keeps working. If a client has contacts but no primary (the primary was deleted or moved to another client) the oldest contact
--    is promoted first. A client with no contacts left gets those three columns cleared.
CREATE OR REPLACE FUNCTION public.client_contacts_refresh_client(p_client uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.client_contacts WHERE client_id = p_client AND is_primary)
     AND EXISTS (SELECT 1 FROM public.client_contacts WHERE client_id = p_client) THEN
    UPDATE public.client_contacts SET is_primary = true
    WHERE id = (SELECT id FROM public.client_contacts WHERE client_id = p_client ORDER BY created_at, id LIMIT 1);
    RETURN; -- that update fires the mirror again
  END IF;

  SELECT name, phone, email INTO p FROM public.client_contacts WHERE client_id = p_client AND is_primary;

  UPDATE public.clients
  SET contact_name = p.name, phone = p.phone, email = p.email, updated_at = now()
  WHERE id = p_client
    AND (contact_name, phone, email) IS DISTINCT FROM (p.name, p.phone, p.email);
END;
$$;

CREATE OR REPLACE FUNCTION public.client_contacts_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('client_contacts.switching', true) = 'on' THEN
    RETURN NULL; -- the primary is being switched; the row that caused it mirrors afterwards
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.client_contacts_refresh_client(OLD.client_id);
  ELSE
    PERFORM public.client_contacts_refresh_client(NEW.client_id);
    IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      PERFORM public.client_contacts_refresh_client(OLD.client_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS client_contacts_before_write ON public.client_contacts;
CREATE TRIGGER client_contacts_before_write
  BEFORE INSERT OR UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.client_contacts_before_write();

DROP TRIGGER IF EXISTS client_contacts_after_write ON public.client_contacts;
CREATE TRIGGER client_contacts_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.client_contacts_after_write();

REVOKE ALL ON FUNCTION public.client_contacts_before_write()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_contacts_refresh_client(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_contacts_after_write()             FROM PUBLIC, anon, authenticated;

-- 6. A project's contact. It must belong to the project's client: if the client changes (or the contact is someone else's) the
--    contact is cleared, whatever part of the app made the change.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_contact_id ON public.projects (contact_id) WHERE contact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.projects_contact_matches_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.client_contacts c WHERE c.id = NEW.contact_id AND c.client_id = NEW.client_id) THEN
    NEW.contact_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_contact_matches_client ON public.projects;
CREATE TRIGGER projects_contact_matches_client
  BEFORE INSERT OR UPDATE OF client_id, contact_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_contact_matches_client();

REVOKE ALL ON FUNCTION public.projects_contact_matches_client() FROM PUBLIC, anon, authenticated;

-- 7. One-time backfill: every client that has a contact person becomes one primary contact (safe to run again: clients that
--    already have contacts are skipped; clients with no company are skipped because a contact needs one).
INSERT INTO public.client_contacts (company_id, client_id, name, phone, email, is_primary)
SELECT c.company_id, c.id, btrim(c.contact_name), nullif(btrim(c.phone), ''), nullif(btrim(c.email), ''), true
FROM public.clients c
WHERE nullif(btrim(c.contact_name), '') IS NOT NULL
  AND c.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.client_contacts x WHERE x.client_id = c.id);

COMMIT;
