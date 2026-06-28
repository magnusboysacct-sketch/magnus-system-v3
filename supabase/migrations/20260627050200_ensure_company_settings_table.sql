/*
  Ensure company_settings table exists with all columns used by the app.
  The table was created manually in Studio; this migration captures it so it
  is tracked in version control. All statements are idempotent.
*/

CREATE TABLE IF NOT EXISTS public.company_settings (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid UNIQUE NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name                  text,
  tagline                       text,
  address_line1                 text,
  address_line2                 text,
  parish                        text,
  country                       text DEFAULT 'Jamaica',
  phone                         text,
  email                         text,
  website                       text,
  logo_url                      text,
  watermark_url                 text,
  watermark_enabled             boolean DEFAULT false,
  watermark_opacity             numeric DEFAULT 0.15,
  watermark_size                integer DEFAULT 25,
  payment_notifications_enabled boolean DEFAULT true,
  -- Subscription / trial
  trial_expires_at              timestamptz,
  subscription_status           text DEFAULT 'inactive',
  subscription_expires_at       timestamptz,
  -- Internal
  _schema_refresh               timestamptz DEFAULT now(),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- Add any columns that may be missing on existing installs
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS parish text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS country text DEFAULT 'Jamaica';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS watermark_url text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS watermark_enabled boolean DEFAULT false;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS watermark_opacity numeric DEFAULT 0.15;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS watermark_size integer DEFAULT 25;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS payment_notifications_enabled boolean DEFAULT true;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS _schema_refresh timestamptz DEFAULT now();

-- RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_settings_select" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_insert" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_update" ON public.company_settings;

CREATE POLICY "company_settings_select" ON public.company_settings
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "company_settings_insert" ON public.company_settings
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "company_settings_update" ON public.company_settings
  FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));
