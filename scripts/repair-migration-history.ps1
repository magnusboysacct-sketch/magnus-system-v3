# Marks migrations whose effects are already on the live database as applied in the migration history table.
# It changes ONLY supabase_migrations.schema_migrations - it does not run any migration SQL.
# Generated from the audit in supabase/migration-history-audit.md (2026-10-19). NOT run yet - review, then run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/repair-migration-history.ps1
# Afterwards `npx supabase migration list --linked` should show only the migrations listed in the "decide" section at the end as pending.
$ErrorActionPreference = "Stop"

# SUPERSEDED: Table, columns, RLS and email index are live [replay would be harmful]
# 20260628000001_capture_company_invitations.sql
npx supabase migration repair --status applied 20260628000001 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260628000001" }

# APPLIED: All 106 foreign keys to auth.users / user_profiles are CASCADE or SET NULL; none are NO ACTION / RESTRICT
# 20260628000002_fix_remaining_fk_cascades.sql
npx supabase migration repair --status applied 20260628000002 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260628000002" }

# SUPERSEDED: admin_delete_auth_user and the other objects are live [replay would be harmful]
# 20260629000001_session_schema_additions.sql
npx supabase migration repair --status applied 20260629000001 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260629000001" }

# APPLIED: Column present
# 20260711000000_add_boq_item_measurements.sql
npx supabase migration repair --status applied 20260711000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260711000000" }

# APPLIED: Column present
# 20260712000000_add_cost_items_grade.sql
npx supabase migration repair --status applied 20260712000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260712000000" }

# APPLIED: Column present
# 20260723000000_add_workers_job_title.sql
npx supabase migration repair --status applied 20260723000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260723000000" }

# APPLIED: Column present
# 20260723000001_add_workers_id_expiry_date.sql
npx supabase migration repair --status applied 20260723000001 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260723000001" }

# APPLIED: projects_status_check includes 'archived'
# 20260724000000_add_archived_project_status.sql
npx supabase migration repair --status applied 20260724000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260724000000" }

# APPLIED: estimate_headers_status_check includes 'archived'
# 20260725000000_widen_estimate_status_constraint.sql
npx supabase migration repair --status applied 20260725000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260725000000" }

# APPLIED: All 20 columns / constraints present
# 20260727130000_add_estimate_markup_and_contract_link.sql
npx supabase migration repair --status applied 20260727130000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260727130000" }

# APPLIED: Column present
# 20260727140000_add_estimate_invoice_link.sql
npx supabase migration repair --status applied 20260727140000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260727140000" }

# APPLIED: All columns present
# 20260729100000_add_overhead_and_cost_plan_columns.sql
npx supabase migration repair --status applied 20260729100000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260729100000" }

# APPLIED: help_articles table, RLS and policies present
# 20260729110000_add_help_articles.sql
npx supabase migration repair --status applied 20260729110000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260729110000" }

# SUPERSEDED: Delete policy replaced by field_payments_staff (ALL, _hr_staff_company()) [replay would be harmful]
# 20260730000000_add_field_payments_delete_policy.sql
npx supabase migration repair --status applied 20260730000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260730000000" }

# SUPERSEDED: Tables, functions and the notice_reads / messages policies are live and identical
# 20260802000000_create_worker_portal_communication.sql
npx supabase migration repair --status applied 20260802000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260802000000" }

# SUPERSEDED: Tables present [replay would be harmful]
# 20260803000000_create_staff_payroll_system.sql
npx supabase migration repair --status applied 20260803000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260803000000" }

# SUPERSEDED: Table present [replay would be harmful]
# 20260804000000_create_payroll_tax_settings.sql
npx supabase migration repair --status applied 20260804000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260804000000" }

# APPLIED: Columns present
# 20260805000000_add_staff_id_card_fields.sql
npx supabase migration repair --status applied 20260805000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260805000000" }

# APPLIED: Column present
# 20260806000000_add_user_profiles_job_title.sql
npx supabase migration repair --status applied 20260806000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260806000000" }

# APPLIED: Column present
# 20260807000000_add_company_signature_url.sql
npx supabase migration repair --status applied 20260807000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260807000000" }

# SUPERSEDED: All three workers policies are gone; workers_select_staff_or_self / workers_update_staff / workers_delete_policy and 'Managers can insert company workers' replace them [replay would be harmful]
# 20260808000000_role_gate_worker_creation.sql
npx supabase migration repair --status applied 20260808000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260808000000" }

# SUPERSEDED: 'Managers can delete company workers' replaced by workers_delete_policy (director, site_supervisor - same roles)
# 20260809000000_tighten_worker_delete_rls.sql
npx supabase migration repair --status applied 20260809000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260809000000" }

# APPLIED: ai_usage_log table, RLS and policy present
# 20260810000000_create_ai_usage_log.sql
npx supabase migration repair --status applied 20260810000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260810000000" }

# APPLIED: three_way_match_status check includes no_po, invalid_po, ..
# 20260816000000_widen_supplier_invoices_three_way_match_status_check.sql
npx supabase migration repair --status applied 20260816000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260816000000" }

# APPLIED (data-only): Columns present; 0 rows still match the Zoho backfill pattern with bill_number NULL
# 20260817000000_add_field_payments_bill_number_and_payment_date.sql
npx supabase migration repair --status applied 20260817000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260817000000" }

# SUPERSEDED: update_account_balance redefined by 20260932000000 (live body equals it) [replay would be harmful]
# 20260820000000_fix_account_balance_sign_convention.sql
npx supabase migration repair --status applied 20260820000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260820000000" }

# APPLIED: 'supplier_invoice' is in the gl_transactions and posting_rules source_type checks
# 20260820010000_add_supplier_invoice_source_type.sql
npx supabase migration repair --status applied 20260820010000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260820010000" }

# APPLIED: Trigger present
# 20260820020000_add_balance_update_trigger_on_posting.sql
npx supabase migration repair --status applied 20260820020000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260820020000" }

# APPLIED: Trigger present
# 20260820030000_fix_circular_reference_trigger_syntax.sql
npx supabase migration repair --status applied 20260820030000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260820030000" }

# APPLIED: 'fund_transfer' is in both source_type checks
# 20260821000000_add_fund_transfer_source_type.sql
npx supabase migration repair --status applied 20260821000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260821000000" }

# APPLIED: get_monthly_pnl present, body identical
# 20260822000000_add_monthly_pnl_function.sql
npx supabase migration repair --status applied 20260822000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260822000000" }

# APPLIED: chart_of_accounts_check / chart_of_accounts_check1 no longer exist
# 20260822020000_allow_negative_equity_liability_balances.sql
npx supabase migration repair --status applied 20260822020000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260822020000" }

# SUPERSEDED: get_ar_ap_aging redefined by 20260822040000 (live body equals it) [replay would be harmful]
# 20260822030000_add_ar_ap_aging_function.sql
npx supabase migration repair --status applied 20260822030000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260822030000" }

# APPLIED: get_ar_ap_aging body identical to live
# 20260822040000_add_not_yet_due_aging_bucket.sql
npx supabase migration repair --status applied 20260822040000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260822040000" }

# SUPERSEDED: bulk_update_rates redefined by 20260929000000 (live body equals it) [replay would be harmful]
# 20260822050000_skip_noop_bulk_rate_inserts.sql
npx supabase migration repair --status applied 20260822050000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260822050000" }

# APPLIED: Secretary workspace tables, RLS and policies present
# 20260823000000_create_secretary_workspace.sql
npx supabase migration repair --status applied 20260823000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823000000" }

# APPLIED: Column present
# 20260823010000_add_secretary_documents_worker_id.sql
npx supabase migration repair --status applied 20260823010000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823010000" }

# APPLIED: worker_certifications table, RLS and policies present
# 20260823020000_create_worker_certifications.sql
npx supabase migration repair --status applied 20260823020000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823020000" }

# APPLIED: company_documents table, policies and the private company-documents bucket present
# 20260823030000_create_company_documents.sql
npx supabase migration repair --status applied 20260823030000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823030000" }

# APPLIED: scheduled_events table, RLS and policies present
# 20260823040000_create_scheduled_events.sql
npx supabase migration repair --status applied 20260823040000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823040000" }

# APPLIED: admin_tasks table, RLS and policies present
# 20260823050000_create_admin_tasks.sql
npx supabase migration repair --status applied 20260823050000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823050000" }

# APPLIED: meeting_minutes table, RLS and policies present
# 20260823060000_create_meeting_minutes.sql
npx supabase migration repair --status applied 20260823060000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823060000" }

# APPLIED: company_invitations_role_check present (NOT VALID, current vocabulary)
# 20260823070000_fix_company_invitations_role_check.sql
npx supabase migration repair --status applied 20260823070000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823070000" }

# APPLIED (data-only): gl_transactions.currency default is 'JMD'; the only 3 USD rows left are exactly the 3 excluded ids [replay would be harmful]
# 20260823080000_backfill_gl_transactions_currency_jmd.sql
npx supabase migration repair --status applied 20260823080000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260823080000" }

# SUPERSEDED: get_portal_comments / insert_portal_comment redefined by 20260936000000 [replay would be harmful]
# 20260829000000_lock_down_client_comments_anon_rls.sql
npx supabase migration repair --status applied 20260829000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260829000000" }

# APPLIED: Trigger function identical to live
# 20260829010000_fix_validate_gl_entries_balance_trigger.sql
npx supabase migration repair --status applied 20260829010000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260829010000" }

# APPLIED: All 9 columns / indexes present
# 20260906000000_add_boq_assembly_grouping_fields.sql
npx supabase migration repair --status applied 20260906000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260906000000" }

# APPLIED: Column present
# 20260912000000_add_assembly_component_optional_flag.sql
npx supabase migration repair --status applied 20260912000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260912000000" }

# APPLIED: Column present
# 20260914000000_add_boq_assembly_master_openings.sql
npx supabase migration repair --status applied 20260914000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260914000000" }

# SUPERSEDED: client_portal_activity table and staff policy identical; log_portal_event redefined by 20260936000000 [replay would be harmful]
# 20260919000000_client_portal_activity.sql
npx supabase migration repair --status applied 20260919000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260919000000" }

# SUPERSEDED: insert_portal_comment redefined by 20260936000000 [replay would be harmful]
# 20260919000100_tighten_insert_portal_comment.sql
npx supabase migration repair --status applied 20260919000100 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260919000100" }

# SUPERSEDED: Tables, columns and policies present; _portal_session_client, get_portal_invoices / contracts / estimates redefined by 20260936 / 20260922 / 20260921000100 [replay would be harmful]
# 20260919120000_share_with_client.sql
npx supabase migration repair --status applied 20260919120000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260919120000" }

# APPLIED: Lock-contract trigger present
# 20260919130000_lock_contract_after_send.sql
npx supabase migration repair --status applied 20260919130000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260919130000" }

# APPLIED: Function identical to live
# 20260920000000_portal_estimate_view_event.sql
npx supabase migration repair --status applied 20260920000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260920000000" }

# SUPERSEDED: get_portal_data redefined by 20260936000000; other 5 functions identical [replay would be harmful]
# 20260920100000_portal_server_functions.sql
npx supabase migration repair --status applied 20260920100000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260920100000" }

# SUPERSEDED: get_portal_contract_schedule identical; get_portal_contracts redefined by 20260921000100 [replay would be harmful]
# 20260920110000_portal_contract_schedule.sql
npx supabase migration repair --status applied 20260920110000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260920110000" }

# SUPERSEDED: get_portal_data (20260936) and get_portal_contracts (20260921000100) redefined later [replay would be harmful]
# 20260921000000_portal_contract_document_data.sql
npx supabase migration repair --status applied 20260921000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260921000000" }

# APPLIED: get_portal_contracts body identical to live
# 20260921000100_portal_contract_project_address.sql
npx supabase migration repair --status applied 20260921000100 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260921000100" }

# APPLIED: All 8 effects present (policies / grants of the portal lock-down)
# 20260921100000_lock_down_portal_public_access.sql
npx supabase migration repair --status applied 20260921100000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260921100000" }

# SUPERSEDED: Storage policy 'public read' was dropped later [replay would be harmful]
# 20260921100100_restrict_storage_public_read.sql
npx supabase migration repair --status applied 20260921100100 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260921100100" }

# SUPERSEDED: get_portal_data(text, uuid) redefined by 20260936000000; also does DROP FUNCTION get_portal_data(text) [replay would be harmful]
# 20260922000000_portal_project_picker.sql
npx supabase migration repair --status applied 20260922000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260922000000" }

# APPLIED: takeoff_measurements_type_check includes 'perimeter'
# 20260923000000_add_perimeter_to_takeoff_type_check.sql
npx supabase migration repair --status applied 20260923000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260923000000" }

# APPLIED: Policies and view lock-down present
# 20260924000000_fix_cost_item_rates_read_and_lock_down_cost_items_view.sql
npx supabase migration repair --status applied 20260924000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000000" }

# APPLIED: All 6 policies present
# 20260924000100_scope_cost_item_rates_write_policies.sql
npx supabase migration repair --status applied 20260924000100 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000100" }

# APPLIED: Duplicate policy absent
# 20260924000200_remove_duplicate_open_assemblies_read_policy.sql
npx supabase migration repair --status applied 20260924000200 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000200" }

# APPLIED: All 9 policies present
# 20260924000300_scope_assembly_components_policies.sql
npx supabase migration repair --status applied 20260924000300 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000300" }

# APPLIED: Unrestricted upload policy absent
# 20260924000400_remove_unrestricted_storage_upload_policy.sql
npx supabase migration repair --status applied 20260924000400 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000400" }

# SUPERSEDED: private-files bucket present; its 4 company-wide 'private-files company *' policies were dropped later (role-based policies from 20260942-48) [replay would be harmful]
# 20260924000500_create_private_files_bucket.sql
npx supabase migration repair --status applied 20260924000500 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000500" }

# APPLIED: v_cost_items_current has security_invoker = true; anon has no privilege on it
# 20260924000600_recreate_v_cost_items_current_with_grade_and_piece_weight.sql
npx supabase migration repair --status applied 20260924000600 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000600" }

# APPLIED: RLS enabled on the tables
# 20260924000700_enable_rls_on_pricing_and_assembly_tables.sql
npx supabase migration repair --status applied 20260924000700 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000700" }

# APPLIED: Unscoped receipts policies absent
# 20260924000800_remove_unscoped_receipts_bucket_policies.sql
npx supabase migration repair --status applied 20260924000800 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000800" }

# APPLIED: The 3 project-files policies are identical to live
# 20260924000900_fix_project_files_access_policy.sql
npx supabase migration repair --status applied 20260924000900 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260924000900" }

# APPLIED: photo_share_links table and 3 policies identical to live
# 20260925000000_create_photo_share_links.sql
npx supabase migration repair --status applied 20260925000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260925000000" }

# APPLIED: Seed function and trigger present
# 20260926000000_auto_seed_rate_library_for_new_companies.sql
npx supabase migration repair --status applied 20260926000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260926000000" }

# APPLIED: Column present
# 20260927000000_add_user_signature_path.sql
npx supabase migration repair --status applied 20260927000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260927000000" }

# APPLIED: Column present
# 20260928000000_add_project_id_to_client_payments.sql
npx supabase migration repair --status applied 20260928000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260928000000" }

# APPLIED: bulk_update_rates identical to live
# 20260929000000_fix_bulk_update_rates_same_day_conflict.sql
npx supabase migration repair --status applied 20260929000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260929000000" }

# APPLIED: client_contacts table, triggers and 4 policies identical to live; 0 clients with a contact name lack a contact row
# 20260930000000_create_client_contacts.sql
npx supabase migration repair --status applied 20260930000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260930000000" }

# APPLIED: Columns present
# 20260930300000_add_line_name_to_boq_and_invoice_items.sql
npx supabase migration repair --status applied 20260930300000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260930300000" }

# APPLIED: Seed function and trigger present
# 20260930500000_auto_seed_chart_of_accounts_for_new_companies.sql
npx supabase migration repair --status applied 20260930500000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260930500000" }

# APPLIED: seed_default_chart_of_accounts no longer exists
# 20260931000000_drop_unused_chart_of_accounts_seed.sql
npx supabase migration repair --status applied 20260931000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260931000000" }

# APPLIED (data-only): Columns and indexes present; 0 unlinked expense categories (of 29), 0 expenses missing their GL link
# 20260931500000_link_expenses_to_chart_of_accounts.sql
npx supabase migration repair --status applied 20260931500000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260931500000" }

# APPLIED: Function bodies identical to live
# 20260932000000_fix_gl_balance_reversal_on_unposted_delete.sql
npx supabase migration repair --status applied 20260932000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260932000000" }

# APPLIED: Unique index present
# 20260933000000_unique_live_gl_transaction_per_source.sql
npx supabase migration repair --status applied 20260933000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260933000000" }

# APPLIED (data-only): Column present; 0 expenses missing chart_account_id where the category has one
# 20260934000000_link_expenses_directly_to_chart_of_accounts.sql
npx supabase migration repair --status applied 20260934000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260934000000" }

# APPLIED: All 14 columns are ON DELETE SET NULL
# 20260935000000_allow_user_deletion_across_newer_tables.sql
npx supabase migration repair --status applied 20260935000000 --linked
if ($LASTEXITCODE -ne 0) { throw "repair failed for 20260935000000" }

# ---------------------------------------------------------------------------------------------------------------------------
# NOT marked above - decide for each (see supabase/migration-history-audit.md):
#
# 20260628000003_admin_delete_user_rpc.sql  [PARTIAL]
#   invitations_accept_own policy is live and identical. Live admin_delete_user was hand-edited: it LACKS the 'Only a director can remove another director' guard, so an admin can delete a director. Not superseded by any migration.
#   Replay harmful: no (replay would add the missing guard) - but live has a gap, see report
#   If you apply it yourself: review it, run it, then: npx supabase migration repair --status applied 20260628000003 --linked
#   If you decide it is not wanted: delete or rewrite the local file so it no longer shows as pending.
#
# 20260822010000_fix_project_finance_summary_security_invoker.sql  [NOT APPLIED]
#   v_project_finance_summary still has NO security_invoker (reloptions empty), owner postgres. Confirmed live: a user of company VERON'S sees 24 rows through the view but only 2 of their own projects - a cross-company read of project financials.
#   Replay harmful: no (it is the fix) - URGENT to apply
#   If you apply it yourself: review it, run it, then: npx supabase migration repair --status applied 20260822010000 --linked
#   If you decide it is not wanted: delete or rewrite the local file so it no longer shows as pending.
