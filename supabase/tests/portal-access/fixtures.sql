-- Fixed ids so outputs can be diffed between builds.
-- Company A = contractor (Magnus). Company B = another tenant.
-- Client F = Food For The Poor (portal on). Client O = another client of A (portal on).
-- Contacts of F: k1 (officer 1), k2 (officer 2), k3 (officer 3, revoked). Contact of O: kx.
-- Projects: P1 -> k1, P5 -> k1 (second assignment), P2 -> k2, P3 -> F no contact, P4 -> O / kx.
\set A  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B  '''bbbbbbbb-0000-0000-0000-000000000001'''

INSERT INTO companies (id, name) VALUES (:A, 'Magnus'), (:B, 'Other Co');
INSERT INTO company_settings (company_id, company_name) VALUES (:A, 'Magnus Boys'), (:B, 'Other Co');
INSERT INTO user_profiles (id, company_id, role) VALUES
  ('5aff0000-0000-0000-0000-00000000000a', :A, 'admin'),
  ('5aff0000-0000-0000-0000-00000000000b', :B, 'admin'),
  ('5aff0000-0000-0000-0000-00000000000c', :A, 'field_worker');

INSERT INTO clients (id, company_id, name, contact_name, email, portal_email, portal_enabled, portal_activated_at, portal_password_hash) VALUES
  ('c1000000-0000-0000-0000-00000000000f', :A, 'Food For The Poor', 'Head Office', 'office@fftp.test', 'office@fftp.test', true, now(), 'x'),
  ('c1000000-0000-0000-0000-00000000000e', :A, 'Other Client', 'Bob', 'bob@other.test', 'bob@other.test', true, now(), 'x');

INSERT INTO client_contacts (id, company_id, client_id, name, email, is_primary, created_at) VALUES
  ('c0000000-0000-0000-0000-0000000000a0', :A, 'c1000000-0000-0000-0000-00000000000f', 'Head Office', 'office@fftp.test', true, now() - interval '1 day'),
  ('c0000000-0000-0000-0000-0000000000a1', :A, 'c1000000-0000-0000-0000-00000000000f', 'Officer One', 'one@fftp.test', false, now()),
  ('c0000000-0000-0000-0000-0000000000a2', :A, 'c1000000-0000-0000-0000-00000000000f', 'Officer Two', 'two@fftp.test', false, now()),
  ('c0000000-0000-0000-0000-0000000000a3', :A, 'c1000000-0000-0000-0000-00000000000f', 'Officer Three', 'three@fftp.test', false, now()),
  ('c0000000-0000-0000-0000-0000000000b9', :A, 'c1000000-0000-0000-0000-00000000000e', 'Other Officer', 'x@other.test', false, now());

INSERT INTO projects (id, company_id, client_id, contact_id, name, created_at) VALUES
  ('90000000-0000-0000-0000-000000000001', :A, 'c1000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-0000000000a1', 'P1 Clarendon house', '2026-01-01'),
  ('90000000-0000-0000-0000-000000000002', :A, 'c1000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-0000000000a2', 'P2 St Mary house',   '2026-01-02'),
  ('90000000-0000-0000-0000-000000000003', :A, 'c1000000-0000-0000-0000-00000000000f', NULL,                                   'P3 No contact',      '2026-01-03'),
  ('90000000-0000-0000-0000-000000000004', :A, 'c1000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-0000000000b9', 'P4 Other client',    '2026-01-04'),
  ('90000000-0000-0000-0000-000000000005', :A, 'c1000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-0000000000a1', 'P5 Second for k1',   '2025-12-01');

-- Per-project data, tagged with the project number so leaks are obvious
INSERT INTO project_photos (project_id, photo_url, caption, created_at)
  SELECT id, 'photo-' || right(id::text, 1), 'photo of ' || name, '2026-02-01' FROM projects;
INSERT INTO project_daily_logs (project_id, log_date, work_performed)
  SELECT id, '2026-02-01', 'log of ' || name FROM projects;
INSERT INTO project_tasks (project_id, status) SELECT id, 'complete' FROM projects;
INSERT INTO change_orders (id, project_id, title, amount, created_at)
  SELECT ('d0000000-0000-0000-0000-00000000000' || right(id::text, 1))::uuid, id, 'CO for ' || name, 1000, '2026-02-01' FROM projects;
INSERT INTO client_comments (client_id, project_id, message, sender_type, created_at)
  SELECT client_id, id, 'msg on ' || name, 'staff', '2026-02-01' FROM projects;
INSERT INTO client_comments (client_id, project_id, message, sender_type, created_at) VALUES
  ('c1000000-0000-0000-0000-00000000000f', NULL, 'GENERAL msg to FFTP', 'staff', '2026-02-02');
INSERT INTO client_invoices (id, company_id, client_id, project_id, shared_at, invoice_date)
  SELECT ('e0000000-0000-0000-0000-00000000000' || right(id::text, 1))::uuid, :A, client_id, id, '2026-02-01', '2026-02-01' FROM projects;
INSERT INTO client_invoices (id, company_id, client_id, project_id, shared_at, invoice_date) VALUES
  ('e0000000-0000-0000-0000-0000000000ff', :A, 'c1000000-0000-0000-0000-00000000000f', NULL, '2026-02-01', '2026-02-03');
INSERT INTO client_contracts (id, company_id, client_id, project_id, shared_at, created_at)
  SELECT ('f0000000-0000-0000-0000-00000000000' || right(id::text, 1))::uuid, :A, client_id, id, '2026-02-01', '2026-02-01' FROM projects;
INSERT INTO contract_payment_schedules (contract_id, milestone_name, sort_order)
  SELECT id, 'milestone', 1 FROM client_contracts;
INSERT INTO estimate_headers (project_id, title, version, shared_at, shared_snapshot)
  SELECT id, 'est ' || name, 1, '2026-02-01', '{}'::jsonb FROM projects;

-- Sessions. M = manager of F, MO = manager of O, X = expired manager.
INSERT INTO client_portal_sessions (client_id, session_token, expires_at) VALUES
  ('c1000000-0000-0000-0000-00000000000f', 'tok-M',  now() + interval '1 day'),
  ('c1000000-0000-0000-0000-00000000000e', 'tok-MO', now() + interval '1 day'),
  ('c1000000-0000-0000-0000-00000000000f', 'tok-X',  now() - interval '1 minute');
