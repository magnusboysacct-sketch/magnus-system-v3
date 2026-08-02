/*
  Worker portal communication — company notices/announcements and two-way
  messaging between workers and management. All statements are idempotent.

  worker_user_id / sender_id / posted_by / worker_id below all store the
  auth user id, and are FK'd to user_profiles(id) (which itself is PK'd to
  auth.users(id)) rather than to auth.users directly, so PostgREST can embed
  full_name/email via the relationship in a single select.
*/

-- =====================================================
-- worker_portal_notices
-- =====================================================

CREATE TABLE IF NOT EXISTS public.worker_portal_notices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title        text NOT NULL,
  body         text NOT NULL,
  pinned       boolean NOT NULL DEFAULT false,
  visible_to   text NOT NULL DEFAULT 'all'
                 CHECK (visible_to IN ('all', 'internal_staff', 'site_workers')),
  expires_at   timestamptz,
  posted_by    uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_portal_notices_company
  ON public.worker_portal_notices (company_id, pinned DESC, created_at DESC);

ALTER TABLE public.worker_portal_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notices_select" ON public.worker_portal_notices;
DROP POLICY IF EXISTS "notices_insert" ON public.worker_portal_notices;
DROP POLICY IF EXISTS "notices_update" ON public.worker_portal_notices;
DROP POLICY IF EXISTS "notices_delete" ON public.worker_portal_notices;

-- Anyone in the company (workers and management) can read notices
CREATE POLICY "notices_select" ON public.worker_portal_notices
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- Only director/admin post, edit, or delete notices
CREATE POLICY "notices_insert" ON public.worker_portal_notices
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  );

CREATE POLICY "notices_update" ON public.worker_portal_notices
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  );

CREATE POLICY "notices_delete" ON public.worker_portal_notices
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  );

-- =====================================================
-- worker_portal_notice_reads
-- =====================================================

CREATE TABLE IF NOT EXISTS public.worker_portal_notice_reads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id   uuid NOT NULL REFERENCES public.worker_portal_notices(id) ON DELETE CASCADE,
  worker_id   uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  read_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notice_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_portal_notice_reads_worker
  ON public.worker_portal_notice_reads (worker_id);

ALTER TABLE public.worker_portal_notice_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notice_reads_select" ON public.worker_portal_notice_reads;
DROP POLICY IF EXISTS "notice_reads_insert" ON public.worker_portal_notice_reads;
DROP POLICY IF EXISTS "notice_reads_update" ON public.worker_portal_notice_reads;

-- A worker manages only their own read receipts
CREATE POLICY "notice_reads_select" ON public.worker_portal_notice_reads
  FOR SELECT TO authenticated
  USING (worker_id = auth.uid());

CREATE POLICY "notice_reads_insert" ON public.worker_portal_notice_reads
  FOR INSERT TO authenticated
  WITH CHECK (worker_id = auth.uid());

CREATE POLICY "notice_reads_update" ON public.worker_portal_notice_reads
  FOR UPDATE TO authenticated
  USING (worker_id = auth.uid())
  WITH CHECK (worker_id = auth.uid());

-- =====================================================
-- worker_portal_messages
-- =====================================================

CREATE TABLE IF NOT EXISTS public.worker_portal_messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  worker_user_id     uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  sender_type        text NOT NULL CHECK (sender_type IN ('worker', 'management')),
  sender_id          uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  body               text NOT NULL,
  read_by_worker     boolean NOT NULL DEFAULT false,
  read_by_management boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_portal_messages_thread
  ON public.worker_portal_messages (company_id, worker_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_worker_portal_messages_worker_unread
  ON public.worker_portal_messages (worker_user_id, sender_type, read_by_worker);

CREATE INDEX IF NOT EXISTS idx_worker_portal_messages_mgmt_unread
  ON public.worker_portal_messages (company_id, sender_type, read_by_management);

ALTER TABLE public.worker_portal_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON public.worker_portal_messages;
DROP POLICY IF EXISTS "messages_insert" ON public.worker_portal_messages;
DROP POLICY IF EXISTS "messages_update" ON public.worker_portal_messages;

-- A worker sees their own thread; director/admin see every thread in their company
CREATE POLICY "messages_select" ON public.worker_portal_messages
  FOR SELECT TO authenticated
  USING (
    worker_user_id = auth.uid()
    OR company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  );

-- A worker can only post as themselves; management can only post as themselves
-- into a thread within their own company
CREATE POLICY "messages_insert" ON public.worker_portal_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (sender_type = 'worker' AND worker_user_id = auth.uid())
      OR (
        sender_type = 'management'
        AND company_id IN (
          SELECT company_id FROM public.user_profiles
          WHERE id = auth.uid() AND role IN ('director', 'admin')
        )
      )
    )
  );

-- Either side can flip their own "read" flag on a thread they can see
CREATE POLICY "messages_update" ON public.worker_portal_messages
  FOR UPDATE TO authenticated
  USING (
    worker_user_id = auth.uid()
    OR company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  )
  WITH CHECK (
    worker_user_id = auth.uid()
    OR company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  );
