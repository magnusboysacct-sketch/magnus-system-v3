#!/bin/bash
# Portal access tests against a throwaway local Postgres (NOT your Supabase project).
#   PGHOST/PGPORT/PGUSER point at any local Postgres 15+ you can create databases on.
#   ./run.sh                -> manager regression (before vs after the contact migration) + 71 leakage tests
#   deno run password_test.ts -> password hashing tests
set -e
cd "$(dirname "$0")"
M=../../migrations
P="psql -v ON_ERROR_STOP=1 -q -d portaltest"
psql -qc "DROP DATABASE IF EXISTS portaltest" -c "CREATE DATABASE portaltest"
$P -f stub.sql
# The portal migrations as they stand before contact scoping, in order
for f in 20260829000000_lock_down_client_comments_anon_rls 20260919000000_client_portal_activity 20260919000100_tighten_insert_portal_comment \
  20260919120000_share_with_client 20260920000000_portal_estimate_view_event 20260920100000_portal_server_functions \
  20260920110000_portal_contract_schedule 20260921000000_portal_contract_document_data 20260921000100_portal_contract_project_address \
  20260921100000_lock_down_portal_public_access 20260922000000_portal_project_picker 20260930000000_create_client_contacts; do
  $P -f $M/$f.sql 2>&1 | grep -v NOTICE || true
done
$P -f fixtures.sql
$P -v phase=before -f capture.sql
$P -f $M/20260936000000_contact_scoped_portal_access.sql
$P -v phase=after -f capture.sql
echo "--- manager outputs that changed (should be none):"
$P -Atc "SELECT b.name FROM regress b JOIN regress a ON a.name=b.name AND a.phase='after' WHERE b.phase='before' AND a.out IS DISTINCT FROM b.out"
$P -f leak_tests.sql 2>&1 | grep -E "PASS|FAIL|passed"
