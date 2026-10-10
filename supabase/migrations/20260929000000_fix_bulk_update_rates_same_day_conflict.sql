-- Fix bulk_update_rates failing on a same-day repeat (applied directly to the live database; this file version-controls it).
-- cost_item_rates is unique on (cost_item_id, effective_date, source), and the function inserted its 'bulk' rows blindly, so a second
-- bulk update for the same items on the same date failed on that key. It now updates the existing row instead (ON CONFLICT ... DO
-- UPDATE: new rate, currency, batch and note, with created_at refreshed because v_cost_items_current breaks same-date ties by it).
-- The default date, when none is passed, is now today in Jamaica (America/Jamaica) rather than the server's UTC date. Everything
-- else is unchanged from 20260822050000_skip_noop_bulk_rate_inserts.sql.
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
    coalesce(p_effective_date, (now() AT TIME ZONE 'America/Jamaica')::date),
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
    or computed.new_currency is distinct from computed.old_currency
  on conflict (cost_item_id, effective_date, source) do update
    set rate       = excluded.rate,
        currency   = excluded.currency,
        batch_id   = excluded.batch_id,
        note       = excluded.note,
        created_at = now();

  return v_batch_id;
end;
$function$;
