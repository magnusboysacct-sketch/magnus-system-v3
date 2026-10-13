-- Minimal stand-in for the live schema: only tables/columns the portal functions touch.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$q$anon$q$) THEN CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE TABLE companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE user_profiles (id uuid PRIMARY KEY, company_id uuid, role text);
CREATE TABLE company_settings (company_id uuid, company_name text, logo_url text, phone text, email text, address_line1 text,
  address_line2 text, parish text, tagline text, watermark_url text, watermark_enabled bool, watermark_opacity numeric, watermark_size numeric);
CREATE TABLE clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, name text, contact_name text, phone text, email text,
  address text, portal_email text, portal_password_hash text, portal_activated_at timestamptz, portal_enabled bool DEFAULT false,
  portal_token text DEFAULT gen_random_uuid()::text, portal_reset_token text, portal_reset_expires_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, client_id uuid REFERENCES clients(id), name text,
  status text DEFAULT 'active', site_address text, start_date date, end_date date, created_at timestamptz DEFAULT now());
CREATE POLICY projects_select ON projects FOR SELECT USING (true);
CREATE TABLE project_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, status text);
CREATE TABLE project_photos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, photo_url text, caption text, created_at timestamptz DEFAULT now());
CREATE TABLE project_daily_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, log_date date DEFAULT current_date, weather text,
  workers_count int, work_performed text, deliveries text);
CREATE TABLE change_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, title text, description text, amount numeric,
  status text DEFAULT 'pending', client_response text, responded_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE client_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, project_id uuid, message text, sender_type text,
  created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE client_reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, project_id uuid, rating int, comment text);
CREATE TABLE client_invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, client_id uuid, project_id uuid, status text DEFAULT 'sent',
  invoice_date date DEFAULT current_date, sent_date date, created_by uuid, reminder_enabled bool, reminder_days_before int, reminder_repeat_days int,
  last_reminder_sent_at timestamptz, updated_at timestamptz);
CREATE TABLE client_contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, client_id uuid, project_id uuid, status text DEFAULT 'sent',
  notes text, created_by uuid, contractor_signed_by uuid, client_signature_token text, created_at timestamptz DEFAULT now(), updated_at timestamptz);
CREATE TABLE estimate_headers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, title text, version int, status text, updated_at timestamptz);
CREATE TABLE boq_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE contract_payment_schedules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid, milestone_name text, milestone_description text,
  due_date date, amount numeric, percent_complete numeric, sort_order int);
CREATE TABLE client_portal_sessions (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, client_id uuid, session_token text NOT NULL,
  created_at timestamptz DEFAULT now(), expires_at timestamptz DEFAULT (now() + '30 days'::interval), device_info text);
CREATE POLICY "Public session management" ON client_portal_sessions USING (true);
-- what Supabase grants by default
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
