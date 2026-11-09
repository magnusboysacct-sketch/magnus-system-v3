-- =====================================================================
-- Expense items - Magnus Boy's System
--
-- expenses.line_items: the items on the receipt (what was bought), as a list:
--   [{ "description": "Cement 42.5", "quantity": 10, "unit_price": 1850, "amount": 18500 }, ...]
-- Filled in by the AI receipt scan (or typed), shown when the expense is opened, and editable. Only a record of what was bought:
-- the expense amount (what goes in the books) stays the expense's own amount field. Safe to run twice.
-- =====================================================================

begin;

alter table public.expenses add column if not exists line_items jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_line_items_is_list') then
    alter table public.expenses add constraint expenses_line_items_is_list
      check (line_items is null or (jsonb_typeof(line_items) = 'array' and jsonb_array_length(line_items) <= 200));
  end if;
end $$;

commit;
