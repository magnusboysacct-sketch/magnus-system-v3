/*
  Fix: bulk_update_rates() logged a cost_item_rates row even when the
  computed rate didn't actually change

  Same character as the single-edit fix made earlier this session in
  RatesPage.tsx (the edit-modal save path now compares the form's rate
  against the item's current_rate/current_currency before inserting) —
  confirmed via real data that plain edits were logging redundant history
  rows for fields that had nothing to do with price. Here the equivalent
  gap is narrower but real: for 'set' mode specifically, any item already
  sitting at the target value gets a no-op row logged; for 'percent'/'add'
  modes this only happens when p_value = 0, a rarer edge case — but the
  fix is written generally (comparing the actually-computed new value,
  whatever mode produced it, against the item's current value) rather
  than mode-specific, since that's simpler and correct for all three
  modes at once.

  Real function confirmed live via pg_get_functiondef, not guessed —
  this table/function predates the tracked migration history the same
  way cost_item_rates and projects did earlier this session, so there
  was no tracked source to read directly.

  The new rate is computed once, in a subquery, rather than repeating the
  CASE expression separately in both the SELECT list and a WHERE clause —
  avoids any risk of the two copies silently drifting apart if this logic
  is ever edited again. IS DISTINCT FROM (not <> or !=) for both the rate
  and currency comparisons, since it treats NULL as a real, comparable
  value instead of making the whole comparison silently evaluate to
  neither-true-nor-false the way standard equality operators do against a
  NULL operand — matters here because current_currency can genuinely be
  NULL on some rows (coalesced to 'JMD' only at insert time).

  rate_update_batches is still ALWAYS inserted first, unconditionally —
  even a bulk update that ends up changing zero items' rates still leaves
  a real audit record that the batch was attempted, exactly as before.
  Only the per-item cost_item_rates insert is now conditional; a bulk
  update where every matched item is already at the target value
  correctly inserts zero rate rows (a completely ordinary, non-error
  outcome for an INSERT ... SELECT matching no rows) while still
  recording the batch itself.
*/

CREATE OR REPLACE FUNCTION public.bulk_update_rates(p_title text, p_reason text, p_type_filter text, p_category_filter text, p_mode text, p_value numeric, p_effective_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_batch_id uuid;
begin
  insert into public.rate_update_batches (title, reason)
  values (p_title, p_reason)
  returning id into v_batch_id;

  insert into public.cost_item_rates (
    cost_item_id, rate, currency, effective_date, source, batch_id, note
  )
  select
    computed.id,
    computed.new_rate,
    computed.new_currency,
    coalesce(p_effective_date, now()::date),
    'bulk',
    v_batch_id,
    p_reason
  from (
    select
      v.id,
      case
        when p_mode = 'percent' then v.current_rate * (1 + (p_value / 100.0))
        when p_mode = 'add' then v.current_rate + p_value
        when p_mode = 'set' then p_value
        else v.current_rate
      end as new_rate,
      coalesce(v.current_currency, 'JMD') as new_currency,
      v.current_rate as old_rate,
      v.current_currency as old_currency
    from public.v_cost_items_current v
    where
      (p_type_filter is null or v.item_type = p_type_filter)
      and (p_category_filter is null or v.category = p_category_filter)
      and v.current_rate is not null
  ) computed
  where
    computed.new_rate is distinct from computed.old_rate
    or computed.new_currency is distinct from computed.old_currency;

  return v_batch_id;
end;
$function$;
