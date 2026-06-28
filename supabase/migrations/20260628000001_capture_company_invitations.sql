/*
  Capture company_invitations table — created manually in Studio but never
  tracked in migrations. All statements are idempotent.
*/

CREATE TABLE IF NOT EXISTS public.company_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'viewer',
  invited_by   uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Add any columns that may be missing on existing installs
ALTER TABLE public.company_invitations ADD COLUMN IF NOT EXISTS expires_at   timestamptz;
ALTER TABLE public.company_invitations ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- Index for fast pending-invite lookups per company
CREATE INDEX IF NOT EXISTS idx_company_invitations_company_status
  ON public.company_invitations (company_id, status);

CREATE INDEX IF NOT EXISTS idx_company_invitations_email
  ON public.company_invitations (email);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select" ON public.company_invitations;
DROP POLICY IF EXISTS "invitations_insert" ON public.company_invitations;
DROP POLICY IF EXISTS "invitations_update" ON public.company_invitations;
DROP POLICY IF EXISTS "invitations_delete" ON public.company_invitations;

-- Members of the company can read all invitations (so directors see pending ones)
CREATE POLICY "invitations_select" ON public.company_invitations
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Only the edge function (service_role) inserts; allow authenticated for revoke flow
CREATE POLICY "invitations_insert" ON public.company_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('director', 'admin')
    )
  );

-- Directors/admins in the company can update (revoke)
CREATE POLICY "invitations_update" ON public.company_invitations
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('director', 'admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('director', 'admin')
    )
  );
