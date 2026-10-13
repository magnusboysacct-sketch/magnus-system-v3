-- Leakage tests: contact sessions vs manager sessions. Runs after the migration, on the fixtures.
\set ON_ERROR_STOP 1
CREATE TABLE test_results (n serial, name text, ok boolean, detail text);
GRANT ALL ON test_results TO anon, authenticated; GRANT ALL ON SEQUENCE test_results_n_seq TO anon, authenticated;
CREATE FUNCTION t(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS
$$ INSERT INTO test_results (name, ok, detail) VALUES (p_name, coalesce(p_ok, false), p_detail) $$;
GRANT EXECUTE ON FUNCTION t TO anon, authenticated;
-- does a call raise?
CREATE FUNCTION raises(p_sql text) RETURNS boolean LANGUAGE plpgsql AS
$$ BEGIN EXECUTE p_sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;
GRANT EXECUTE ON FUNCTION raises TO anon, authenticated;
-- the set of project names a get_portal_data payload exposes anywhere
CREATE FUNCTION names_in(d jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(DISTINCT m[1], ',' ORDER BY m[1]), '') FROM regexp_matches(coalesce(d::text,''), '(P[0-9])', 'g') m $$;
GRANT EXECUTE ON FUNCTION names_in TO anon, authenticated;

-- Contact logins (as the login edge function would create them)
INSERT INTO client_contact_portal_access (contact_id, company_id, portal_token, portal_email, password_hash, activated_at, enabled, revoked_at) VALUES
  ('c0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'link-k1', 'one@fftp.test', 'h', now(), true, NULL),
  ('c0000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', 'link-k2', 'two@fftp.test', 'h', now(), true, NULL),
  ('c0000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001', 'link-k3', 'three@fftp.test', 'h', now(), false, now()),
  ('c0000000-0000-0000-0000-0000000000b9', 'aaaaaaaa-0000-0000-0000-000000000001', 'link-kx', 'x@other.test', 'h', now(), true, NULL);
INSERT INTO client_portal_sessions (client_id, contact_id, session_token, expires_at) VALUES
  ('c1000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-0000000000a1', 'tok-k1',  now() + interval '1 day'),
  ('c1000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-0000000000a2', 'tok-k2',  now() + interval '1 day'),
  ('c1000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-0000000000a3', 'tok-k3',  now() + interval '1 day'),
  ('c1000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-0000000000b9', 'tok-kx',  now() + interval '1 day'),
  -- forged: officer of client O riding on client F's id
  ('c1000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-0000000000b9', 'tok-forged', now() + interval '1 day'),
  ('c1000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-0000000000a1', 'tok-k1-expired', now() - interval '1 second'),
  (NULL, NULL, 'tok-nullclient', now() + interval '1 day');

SET ROLE anon;

-- ── get_portal_data ─────────────────────────────────────────────────
SELECT t('k1 sees only P1,P5 by default', names_in(get_portal_data('tok-k1')) = 'P1,P5', names_in(get_portal_data('tok-k1')));
SELECT t('k1 project list is P1,P5', (SELECT string_agg(x->>'name', '|' ORDER BY x->>'name') FROM jsonb_array_elements(get_portal_data('tok-k1')->'projects') x) = 'P1 Clarendon house|P5 Second for k1');
SELECT t('k1 asking for P2 (other officer) gets no P2 data', position('P2' in names_in(get_portal_data('tok-k1', '90000000-0000-0000-0000-000000000002'))) = 0,
         names_in(get_portal_data('tok-k1', '90000000-0000-0000-0000-000000000002')));
SELECT t('k1 asking for P3 (unassigned) gets no P3 data', position('P3' in names_in(get_portal_data('tok-k1', '90000000-0000-0000-0000-000000000003'))) = 0);
SELECT t('k1 asking for P4 (other client) gets no P4 data', position('P4' in names_in(get_portal_data('tok-k1', '90000000-0000-0000-0000-000000000004'))) = 0);
SELECT t('k1 can switch to own P5', get_portal_data('tok-k1', '90000000-0000-0000-0000-000000000005')->'project'->>'name' = 'P5 Second for k1');
SELECT t('k2 sees only P2', names_in(get_portal_data('tok-k2')) = 'P2', names_in(get_portal_data('tok-k2')));
SELECT t('kx sees only P4', names_in(get_portal_data('tok-kx')) = 'P4', names_in(get_portal_data('tok-kx')));
SELECT t('k1 payload hides client login email', get_portal_data('tok-k1')->'client' ? 'portal_email' = false
                                               AND position('office@fftp.test' in get_portal_data('tok-k1')::text) = 0);
SELECT t('k1 viewer is contact Officer One', get_portal_data('tok-k1')->'viewer'->>'kind' = 'contact'
                                            AND get_portal_data('tok-k1')->'viewer'->>'name' = 'Officer One');
SELECT t('manager viewer is manager', get_portal_data('tok-M')->'viewer'->>'kind' = 'manager');
SELECT t('manager still sees all 4 F projects', jsonb_array_length(get_portal_data('tok-M')->'projects') = 4);
SELECT t('revoked contact session is dead', get_portal_data('tok-k3') IS NULL);
SELECT t('forged cross-client contact session is dead', get_portal_data('tok-forged') IS NULL);
SELECT t('expired contact session is dead', get_portal_data('tok-k1-expired') IS NULL);
SELECT t('null-client session is dead', get_portal_data('tok-nullclient') IS NULL);
SELECT t('empty / null token is dead', get_portal_data('') IS NULL AND get_portal_data(NULL) IS NULL);

-- ── messages ────────────────────────────────────────────────────────
SELECT t('k1 messages: only P1,P5', (SELECT string_agg(message, '|' ORDER BY message) FROM get_portal_comments('tok-k1')) = 'msg on P1 Clarendon house|msg on P5 Second for k1',
         (SELECT string_agg(message, '|' ORDER BY message) FROM get_portal_comments('tok-k1')));
SELECT t('k1 never sees GENERAL message', NOT EXISTS (SELECT 1 FROM get_portal_comments('tok-k1') WHERE project_id IS NULL));
SELECT t('manager still sees GENERAL message', EXISTS (SELECT 1 FROM get_portal_comments('tok-M') WHERE project_id IS NULL));
SELECT t('k1 cannot post on P2',   raises($$SELECT * FROM insert_portal_comment('tok-k1', '90000000-0000-0000-0000-000000000002', 'hi')$$));
SELECT t('k1 cannot post on P3',   raises($$SELECT * FROM insert_portal_comment('tok-k1', '90000000-0000-0000-0000-000000000003', 'hi')$$));
SELECT t('k1 cannot post on P4',   raises($$SELECT * FROM insert_portal_comment('tok-k1', '90000000-0000-0000-0000-000000000004', 'hi')$$));
SELECT t('k1 cannot post general', raises($$SELECT * FROM insert_portal_comment('tok-k1', NULL, 'hi')$$));
SELECT t('k1 can post on P1, tagged with k1', (SELECT contact_id FROM insert_portal_comment('tok-k1', '90000000-0000-0000-0000-000000000001', 'from k1'))
         = 'c0000000-0000-0000-0000-0000000000a1');
SELECT t('k2 does not see k1''s new message', NOT EXISTS (SELECT 1 FROM get_portal_comments('tok-k2') WHERE message = 'from k1'));
SELECT t('manager sees k1''s new message', EXISTS (SELECT 1 FROM get_portal_comments('tok-M') WHERE message = 'from k1'));
SELECT t('manager post untagged', (SELECT contact_id FROM insert_portal_comment('tok-M', '90000000-0000-0000-0000-000000000002', 'from mgr')) IS NULL);

-- ── manager-only features are closed to contacts ───────────────────
SELECT t('k1 invoices empty',  NOT EXISTS (SELECT 1 FROM get_portal_invoices('tok-k1')));
SELECT t('k1 contracts empty', NOT EXISTS (SELECT 1 FROM get_portal_contracts('tok-k1')));
SELECT t('k1 estimates empty', NOT EXISTS (SELECT 1 FROM get_portal_estimates('tok-k1')));
SELECT t('k1 own-project contract schedule empty', NOT EXISTS (SELECT 1 FROM get_portal_contract_schedule('tok-k1', 'f0000000-0000-0000-0000-000000000001')));
SELECT t('k1 cannot approve own-project change order', raises($$SELECT respond_portal_change_order('tok-k1', 'd0000000-0000-0000-0000-000000000001', 'approved')$$));
SELECT t('k1 cannot review own project', raises($$SELECT submit_portal_review('tok-k1', '90000000-0000-0000-0000-000000000001', 5, 'x')$$));
SELECT t('k1 change order on P1 still pending', get_portal_data('tok-k1', '90000000-0000-0000-0000-000000000001')->'change_orders'->0->>'status' = 'pending');
SELECT t('manager invoices incl. general (5)', (SELECT count(*) FROM get_portal_invoices('tok-M')) = 5);
SELECT t('manager can still approve', (respond_portal_change_order('tok-M', 'd0000000-0000-0000-0000-000000000002', 'approved'))->>'status' = 'approved');
SELECT t('manager can still review', submit_portal_review('tok-M', '90000000-0000-0000-0000-000000000001', 5, 'ok') ? 'id');

-- ── activity log ────────────────────────────────────────────────────
SELECT log_portal_event('tok-k1', 'photo_view', 'photo', 'p2photo', '90000000-0000-0000-0000-000000000002');
SELECT log_portal_event('tok-k1', 'tab_view', 'tab', 'overview', '90000000-0000-0000-0000-000000000001');
SELECT log_portal_event('tok-k1', 'estimate_view', 'estimate', 'e1', '90000000-0000-0000-0000-000000000001');
RESET ROLE;
SELECT t('log: k1 cannot attach P2 to an event', (SELECT project_id FROM client_portal_activity WHERE entity_id = 'p2photo') IS NULL);
SELECT t('log: k1 event on P1 keeps project and contact', EXISTS (SELECT 1 FROM client_portal_activity WHERE entity_id = 'overview'
          AND project_id = '90000000-0000-0000-0000-000000000001' AND contact_id = 'c0000000-0000-0000-0000-0000000000a1'));
SELECT t('log: estimate_view still accepted', EXISTS (SELECT 1 FROM client_portal_activity WHERE event_type = 'estimate_view'));

-- ── direct table / helper access from the browser key ──────────────
SET ROLE anon;
SELECT t('anon cannot read contact credentials', raises($$SELECT * FROM client_contact_portal_access$$));
SELECT t('anon cannot read sessions',            raises($$SELECT * FROM client_portal_sessions$$));
SELECT t('anon cannot read client_contacts', raises($$SELECT * FROM client_contacts$$));
SELECT t('anon cannot call _portal_session_ctx', raises($$SELECT * FROM _portal_session_ctx('tok-k1')$$));
SELECT t('anon cannot call _portal_can_see_project', raises($$SELECT _portal_can_see_project(NULL,NULL,NULL)$$));
SELECT t('anon cannot invite', raises($$SELECT invite_project_contact_to_portal('90000000-0000-0000-0000-000000000001')$$));
SELECT t('link info: k1 is login mode, no secrets', get_contact_portal_link_info('link-k1')->>'mode' = 'login'
          AND position('link-k1' in get_contact_portal_link_info('link-k1')::text) = 0
          AND position('"h"' in get_contact_portal_link_info('link-k1')::text) = 0);
SELECT t('link info: revoked k3 link is dead', get_contact_portal_link_info('link-k3') IS NULL);
SELECT t('link info: client magic-link token is not a contact link', get_contact_portal_link_info((SELECT 'tok-M')) IS NULL);
RESET ROLE;
SELECT t('authenticated cannot read contact credentials', raises($$SET LOCAL ROLE authenticated; SELECT * FROM client_contact_portal_access$$));
SELECT t('authenticated cannot read sessions directly', raises($$SET LOCAL ROLE authenticated; SELECT * FROM client_portal_sessions$$));
SELECT t('authenticated cannot truncate client_contacts', raises($$SET LOCAL ROLE authenticated; TRUNCATE client_contacts CASCADE$$));

-- ── live reassignment, moves, revocation, portal switch-off ────────
UPDATE projects SET contact_id = 'c0000000-0000-0000-0000-0000000000a2' WHERE id = '90000000-0000-0000-0000-000000000001';
SET ROLE anon;
SELECT t('after reassigning P1: k1 sees only P5', names_in(get_portal_data('tok-k1')) = 'P5', names_in(get_portal_data('tok-k1')));
SELECT t('after reassigning P1: k1 loses P1 messages', NOT EXISTS (SELECT 1 FROM get_portal_comments('tok-k1') WHERE project_id = '90000000-0000-0000-0000-000000000001'));
SELECT t('after reassigning P1: k2 sees P1,P2', names_in(get_portal_data('tok-k2')) = 'P1,P2', names_in(get_portal_data('tok-k2')));
RESET ROLE;
UPDATE projects SET contact_id = NULL WHERE contact_id = 'c0000000-0000-0000-0000-0000000000a1';
SET ROLE anon;
SELECT t('k1 with no projects: valid session, nothing shown', get_portal_data('tok-k1') IS NOT NULL
          AND jsonb_array_length(get_portal_data('tok-k1')->'projects') = 0 AND get_portal_data('tok-k1')->'project' = 'null'::jsonb
          AND names_in(get_portal_data('tok-k1')) = '');
SELECT t('k1 with no projects: no messages', NOT EXISTS (SELECT 1 FROM get_portal_comments('tok-k1')));
RESET ROLE;
UPDATE client_contacts SET client_id = 'c1000000-0000-0000-0000-00000000000e' WHERE id = 'c0000000-0000-0000-0000-0000000000a2';
SET ROLE anon;
SELECT t('contact moved to another client: old session dead', get_portal_data('tok-k2') IS NULL);
RESET ROLE;
UPDATE clients SET portal_enabled = false WHERE id = 'c1000000-0000-0000-0000-00000000000e';
SET ROLE anon;
SELECT t('client portal off: contact session dead', get_portal_data('tok-kx') IS NULL);
SELECT t('client portal off: manager session dead too', get_portal_data('tok-MO') IS NULL);
RESET ROLE;

-- ── staff RPCs ──────────────────────────────────────────────────────
UPDATE clients SET portal_enabled = true WHERE id = 'c1000000-0000-0000-0000-00000000000e';
UPDATE client_contacts SET client_id = 'c1000000-0000-0000-0000-00000000000f' WHERE id = 'c0000000-0000-0000-0000-0000000000a2';
UPDATE projects SET contact_id = 'c0000000-0000-0000-0000-0000000000a3' WHERE id = '90000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
SET test.uid = '5aff0000-0000-0000-0000-00000000000b';  -- staff of ANOTHER company
SELECT t('other company cannot see status',  raises($$SELECT get_project_contact_portal_status('90000000-0000-0000-0000-000000000003')$$));
SELECT t('other company cannot invite',      raises($$SELECT invite_project_contact_to_portal('90000000-0000-0000-0000-000000000003')$$));
SELECT t('other company cannot revoke',      raises($$SELECT revoke_contact_portal_access('c0000000-0000-0000-0000-0000000000a2')$$));
SET test.uid = '5aff0000-0000-0000-0000-00000000000c';  -- same company, non-office role
SELECT t('field role cannot invite',         raises($$SELECT invite_project_contact_to_portal('90000000-0000-0000-0000-000000000003')$$));
SET test.uid = '5aff0000-0000-0000-0000-00000000000a';  -- admin of company A
SELECT t('status of revoked k3 is revoked, no token', get_project_contact_portal_status('90000000-0000-0000-0000-000000000003')->>'status' = 'revoked'
          AND get_project_contact_portal_status('90000000-0000-0000-0000-000000000003')->>'portal_token' IS NULL);
SELECT t('re-invite revoked k3 gives a NEW token', invite_project_contact_to_portal('90000000-0000-0000-0000-000000000003')->>'portal_token' <> 'link-k3');
SELECT t('re-invited k3 is back to setup', get_project_contact_portal_status('90000000-0000-0000-0000-000000000003')->>'status' = 'invited');
SELECT t('cannot invite on a project with no contact', raises($$SELECT invite_project_contact_to_portal('90000000-0000-0000-0000-000000000005')$$));
SELECT revoke_contact_portal_access('c0000000-0000-0000-0000-0000000000a2');
RESET ROLE; RESET test.uid;
SET ROLE anon;
SELECT t('revoke kills k2 session immediately', get_portal_data('tok-k2') IS NULL);
SELECT t('revoke kills k2 link', get_contact_portal_link_info('link-k2') IS NULL);
SELECT t('revoke leaves manager alone', get_portal_data('tok-M') IS NOT NULL);
RESET ROLE;
SELECT t('revoke deleted k2 session rows', NOT EXISTS (SELECT 1 FROM client_portal_sessions WHERE contact_id = 'c0000000-0000-0000-0000-0000000000a2'));

-- ── contact deleted ────────────────────────────────────────────────
DELETE FROM client_contacts WHERE id = 'c0000000-0000-0000-0000-0000000000b9';
SELECT t('deleting a contact removes their sessions and login', NOT EXISTS (SELECT 1 FROM client_portal_sessions WHERE session_token IN ('tok-kx','tok-forged'))
          AND NOT EXISTS (SELECT 1 FROM client_contact_portal_access WHERE contact_id = 'c0000000-0000-0000-0000-0000000000b9'));

\echo
SELECT (CASE WHEN ok THEN 'PASS ' ELSE 'FAIL ' END) || name || coalesce('  [' || detail || ']', '') AS result FROM test_results ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM test_results;
