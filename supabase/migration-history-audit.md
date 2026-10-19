# Migration history audit

Checked on 2026-10-19 against the live database (project julylfxbdwgekzqsxykb), read-only. `supabase migration list --linked` showed 88 migrations that exist locally but are not recorded as applied on live, and none recorded on live that are missing locally.

- APPLIED / SUPERSEDED / data-only: 88 (their effects are live, or later migrations replaced them) - all marked in `scripts/repair-migration-history.ps1`
- Need a decision: none. The two that were open (`20260628000003`, a live `admin_delete_user` missing the director rule, and `20260822010000`, the finance view that leaks across companies) are replaced by the new migration `20260949000000_finance_view_and_admin_delete_fix.sql`, which has to be applied.
- Harmful if replayed (would undo a security or behaviour fix): 20 - this is why `supabase db push` must not be run while they show as pending

| Migration | Classification | Evidence | Harmful if replayed |
|---|---|---|---|
| 20260628000001_capture_company_invitations.sql | SUPERSEDED | Table, columns, RLS and email index are live. The 3 policies invitations_select/insert/update are gone, replaced by 'directors can create/update/view company invites'; the company+status index is covered by separate company_id and status indexes. | YES - replay re-opens invitation reads to every company member |
| 20260628000002_fix_remaining_fk_cascades.sql | APPLIED | All 106 foreign keys to auth.users / user_profiles are CASCADE or SET NULL; none are NO ACTION / RESTRICT. | no (dynamic, idempotent) |
| 20260628000003_admin_delete_user_rpc.sql | SUPERSEDED by 20260949000000 (was PARTIAL) | invitations_accept_own policy is live and identical. Live admin_delete_user was hand-edited: it LACKS the 'Only a director can remove another director' guard, so an admin can delete a director. Not superseded by any migration. | no (replay would add the missing guard) - but live has a gap, see report |
| 20260629000001_session_schema_additions.sql | SUPERSEDED | admin_delete_auth_user and the other objects are live. The 'allow updates to client_comments' USING(true) WITH CHECK(true) policy is gone (replaced by 'Staff can update their company client comments'). | YES - re-opens client_comments to unrestricted UPDATE |
| 20260711000000_add_boq_item_measurements.sql | APPLIED | Column present. | no |
| 20260712000000_add_cost_items_grade.sql | APPLIED | Column present. | no |
| 20260723000000_add_workers_job_title.sql | APPLIED | Column present. | no |
| 20260723000001_add_workers_id_expiry_date.sql | APPLIED | Column present. | no |
| 20260724000000_add_archived_project_status.sql | APPLIED | projects_status_check includes 'archived'. | no |
| 20260725000000_widen_estimate_status_constraint.sql | APPLIED | estimate_headers_status_check includes 'archived'. | no |
| 20260727130000_add_estimate_markup_and_contract_link.sql | APPLIED | All 20 columns / constraints present. | no |
| 20260727140000_add_estimate_invoice_link.sql | APPLIED | Column present. | no |
| 20260729100000_add_overhead_and_cost_plan_columns.sql | APPLIED | All columns present. | no |
| 20260729110000_add_help_articles.sql | APPLIED | help_articles table, RLS and policies present. | no |
| 20260730000000_add_field_payments_delete_policy.sql | SUPERSEDED | Delete policy replaced by field_payments_staff (ALL, _hr_staff_company()). | YES - the old policy lets ANY company user delete field payments |
| 20260802000000_create_worker_portal_communication.sql | SUPERSEDED | Tables, functions and the notice_reads / messages policies are live and identical. notices_insert/update/delete replaced by 'Director and admin manage notices'. | no (re-adds the same director/admin rights) |
| 20260803000000_create_staff_payroll_system.sql | SUPERSEDED | Tables present. The 6 payroll-run / remittance policies now also allow 'secretary' (widened later). | YES - replay removes secretary access to payroll runs and remittances |
| 20260804000000_create_payroll_tax_settings.sql | SUPERSEDED | Table present. payroll_tax_settings_select replaced by company_id = _payroll_staff_company(); insert/update/delete identical. Seed rows exist for the 2 companies that existed then; 3 later companies (VERON'S + 2 system templates) have none. | YES - select reverts to every company member; re-seeds rows for the template companies |
| 20260805000000_add_staff_id_card_fields.sql | APPLIED | Columns present. | no |
| 20260806000000_add_user_profiles_job_title.sql | APPLIED | Column present. | no |
| 20260807000000_add_company_signature_url.sql | APPLIED | Column present. | no |
| 20260808000000_role_gate_worker_creation.sql | SUPERSEDED | All three workers policies are gone; workers_select_staff_or_self / workers_update_staff / workers_delete_policy and 'Managers can insert company workers' replace them. | YES - recreates UPDATE/DELETE of workers for every company member |
| 20260809000000_tighten_worker_delete_rls.sql | SUPERSEDED | 'Managers can delete company workers' replaced by workers_delete_policy (director, site_supervisor - same roles). | no (same roles) |
| 20260810000000_create_ai_usage_log.sql | APPLIED | ai_usage_log table, RLS and policy present. | no |
| 20260816000000_widen_supplier_invoices_three_way_match_status_check.sql | APPLIED | three_way_match_status check includes no_po, invalid_po, ... | no |
| 20260817000000_add_field_payments_bill_number_and_payment_date.sql | APPLIED (data-only) | Columns present; 0 rows still match the Zoho backfill pattern with bill_number NULL. | no (only touches NULL rows) |
| 20260820000000_fix_account_balance_sign_convention.sql | SUPERSEDED | update_account_balance redefined by 20260932000000 (live body equals it). | YES - reverts the balance trigger function to the older logic |
| 20260820010000_add_supplier_invoice_source_type.sql | APPLIED | 'supplier_invoice' is in the gl_transactions and posting_rules source_type checks. | no |
| 20260820020000_add_balance_update_trigger_on_posting.sql | APPLIED | Trigger present. | no |
| 20260820030000_fix_circular_reference_trigger_syntax.sql | APPLIED | Trigger present. | no |
| 20260821000000_add_fund_transfer_source_type.sql | APPLIED | 'fund_transfer' is in both source_type checks. | no |
| 20260822000000_add_monthly_pnl_function.sql | APPLIED | get_monthly_pnl present, body identical. | no |
| 20260822010000_fix_project_finance_summary_security_invoker.sql | SUPERSEDED by 20260949000000 (was NOT APPLIED) | v_project_finance_summary still has NO security_invoker (reloptions empty), owner postgres. Confirmed live: a user of company VERON'S sees 24 rows through the view but only 2 of their own projects - a cross-company read of project financials. | no (it is the fix) - URGENT to apply |
| 20260822020000_allow_negative_equity_liability_balances.sql | APPLIED | chart_of_accounts_check / chart_of_accounts_check1 no longer exist. | no |
| 20260822030000_add_ar_ap_aging_function.sql | SUPERSEDED | get_ar_ap_aging redefined by 20260822040000 (live body equals it). | YES - reverts the aging function (no not-yet-due bucket) |
| 20260822040000_add_not_yet_due_aging_bucket.sql | APPLIED | get_ar_ap_aging body identical to live. | no |
| 20260822050000_skip_noop_bulk_rate_inserts.sql | SUPERSEDED | bulk_update_rates redefined by 20260929000000 (live body equals it). | YES - brings back the same-day conflict bug |
| 20260823000000_create_secretary_workspace.sql | APPLIED | Secretary workspace tables, RLS and policies present. | no |
| 20260823010000_add_secretary_documents_worker_id.sql | APPLIED | Column present. | no |
| 20260823020000_create_worker_certifications.sql | APPLIED | worker_certifications table, RLS and policies present. | no |
| 20260823030000_create_company_documents.sql | APPLIED | company_documents table, policies and the private company-documents bucket present. | no |
| 20260823040000_create_scheduled_events.sql | APPLIED | scheduled_events table, RLS and policies present. | no |
| 20260823050000_create_admin_tasks.sql | APPLIED | admin_tasks table, RLS and policies present. | no |
| 20260823060000_create_meeting_minutes.sql | APPLIED | meeting_minutes table, RLS and policies present. | no |
| 20260823070000_fix_company_invitations_role_check.sql | APPLIED | company_invitations_role_check present (NOT VALID, current vocabulary). | no |
| 20260823080000_backfill_gl_transactions_currency_jmd.sql | APPLIED (data-only) | gl_transactions.currency default is 'JMD'; the only 3 USD rows left are exactly the 3 excluded ids. | YES (conditional) - would flip any real USD transaction created since to JMD |
| 20260829000000_lock_down_client_comments_anon_rls.sql | SUPERSEDED | get_portal_comments / insert_portal_comment redefined by 20260936000000. | YES - reverts to the pre-contact-scoped bodies |
| 20260829010000_fix_validate_gl_entries_balance_trigger.sql | APPLIED | Trigger function identical to live. | no |
| 20260906000000_add_boq_assembly_grouping_fields.sql | APPLIED | All 9 columns / indexes present. | no |
| 20260912000000_add_assembly_component_optional_flag.sql | APPLIED | Column present. (File is untracked in git - not mine to commit.) | no |
| 20260914000000_add_boq_assembly_master_openings.sql | APPLIED | Column present. | no |
| 20260919000000_client_portal_activity.sql | SUPERSEDED | client_portal_activity table and staff policy identical; log_portal_event redefined by 20260936000000. | YES - reverts log_portal_event |
| 20260919000100_tighten_insert_portal_comment.sql | SUPERSEDED | insert_portal_comment redefined by 20260936000000. | YES - reverts insert_portal_comment |
| 20260919120000_share_with_client.sql | SUPERSEDED | Tables, columns and policies present; _portal_session_client, get_portal_invoices / contracts / estimates redefined by 20260936 / 20260922 / 20260921000100. | YES - reverts four portal functions |
| 20260919130000_lock_contract_after_send.sql | APPLIED | Lock-contract trigger present. | no |
| 20260920000000_portal_estimate_view_event.sql | APPLIED | Function identical to live. | no |
| 20260920100000_portal_server_functions.sql | SUPERSEDED | get_portal_data redefined by 20260936000000; other 5 functions identical. | YES - reverts get_portal_data |
| 20260920110000_portal_contract_schedule.sql | SUPERSEDED | get_portal_contract_schedule identical; get_portal_contracts redefined by 20260921000100. | YES - reverts get_portal_contracts |
| 20260921000000_portal_contract_document_data.sql | SUPERSEDED | get_portal_data (20260936) and get_portal_contracts (20260921000100) redefined later. | YES - reverts both |
| 20260921000100_portal_contract_project_address.sql | APPLIED | get_portal_contracts body identical to live. | no |
| 20260921100000_lock_down_portal_public_access.sql | APPLIED | All 8 effects present (policies / grants of the portal lock-down). | no |
| 20260921100100_restrict_storage_public_read.sql | SUPERSEDED | Storage policy 'public read' was dropped later. | YES - recreates a public/anon read on storage.objects |
| 20260922000000_portal_project_picker.sql | SUPERSEDED | get_portal_data(text, uuid) redefined by 20260936000000; also does DROP FUNCTION get_portal_data(text). | YES - reverts get_portal_data |
| 20260923000000_add_perimeter_to_takeoff_type_check.sql | APPLIED | takeoff_measurements_type_check includes 'perimeter'. | no |
| 20260924000000_fix_cost_item_rates_read_and_lock_down_cost_items_view.sql | APPLIED | Policies and view lock-down present. | no |
| 20260924000100_scope_cost_item_rates_write_policies.sql | APPLIED | All 6 policies present. | no |
| 20260924000200_remove_duplicate_open_assemblies_read_policy.sql | APPLIED | Duplicate policy absent. | no |
| 20260924000300_scope_assembly_components_policies.sql | APPLIED | All 9 policies present. | no |
| 20260924000400_remove_unrestricted_storage_upload_policy.sql | APPLIED | Unrestricted upload policy absent. | no |
| 20260924000500_create_private_files_bucket.sql | SUPERSEDED | private-files bucket present; its 4 company-wide 'private-files company *' policies were dropped later (role-based policies from 20260942-48). | YES - recreates company-wide access to every private file |
| 20260924000600_recreate_v_cost_items_current_with_grade_and_piece_weight.sql | APPLIED | v_cost_items_current has security_invoker = true; anon has no privilege on it. | no (DROP VIEW + CREATE; fails if something depends on the view) |
| 20260924000700_enable_rls_on_pricing_and_assembly_tables.sql | APPLIED | RLS enabled on the tables. | no |
| 20260924000800_remove_unscoped_receipts_bucket_policies.sql | APPLIED | Unscoped receipts policies absent. | no |
| 20260924000900_fix_project_files_access_policy.sql | APPLIED | The 3 project-files policies are identical to live. | no (drop and recreate of identical policies) |
| 20260925000000_create_photo_share_links.sql | APPLIED | photo_share_links table and 3 policies identical to live. | no |
| 20260926000000_auto_seed_rate_library_for_new_companies.sql | APPLIED | Seed function and trigger present. | no |
| 20260927000000_add_user_signature_path.sql | APPLIED | Column present. | no |
| 20260928000000_add_project_id_to_client_payments.sql | APPLIED | Column present. | no |
| 20260929000000_fix_bulk_update_rates_same_day_conflict.sql | APPLIED | bulk_update_rates identical to live. | no |
| 20260930000000_create_client_contacts.sql | APPLIED | client_contacts table, triggers and 4 policies identical to live; 0 clients with a contact name lack a contact row. | no |
| 20260930300000_add_line_name_to_boq_and_invoice_items.sql | APPLIED | Columns present. | no |
| 20260930500000_auto_seed_chart_of_accounts_for_new_companies.sql | APPLIED | Seed function and trigger present. | no |
| 20260931000000_drop_unused_chart_of_accounts_seed.sql | APPLIED | seed_default_chart_of_accounts no longer exists. | no (DROP IF EXISTS) |
| 20260931500000_link_expenses_to_chart_of_accounts.sql | APPLIED (data-only) | Columns and indexes present; 0 unlinked expense categories (of 29), 0 expenses missing their GL link. | no (only updates NULL rows) |
| 20260932000000_fix_gl_balance_reversal_on_unposted_delete.sql | APPLIED | Function bodies identical to live. | no |
| 20260933000000_unique_live_gl_transaction_per_source.sql | APPLIED | Unique index present. | no |
| 20260934000000_link_expenses_directly_to_chart_of_accounts.sql | APPLIED (data-only) | Column present; 0 expenses missing chart_account_id where the category has one. | no (only updates NULL rows) |
| 20260935000000_allow_user_deletion_across_newer_tables.sql | APPLIED | All 14 columns are ON DELETE SET NULL. | no |
