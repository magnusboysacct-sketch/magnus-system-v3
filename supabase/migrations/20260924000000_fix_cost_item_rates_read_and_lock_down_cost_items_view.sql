-- Fix the cost_item_rates read policy and lock down v_cost_items_current (one file: they must apply together).
-- Applied directly to the live database; this file version-controls it. The view must run with the caller's rights
-- (security_invoker) so each company only sees global items plus its own, and that only works once cost_item_rates
-- can be read the same way. Applying the view change without the read policy makes every price show as unpriced.
BEGIN;

DROP POLICY IF EXISTS "read cost_item_rates" ON public.cost_item_rates;
CREATE POLICY cost_item_rates_select ON public.cost_item_rates FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.cost_items ci WHERE ci.id = cost_item_rates.cost_item_id
  AND (ci.company_id IS NULL OR ci.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))
));

ALTER VIEW public.v_cost_items_current SET (security_invoker = true);
REVOKE ALL ON public.v_cost_items_current FROM anon;

COMMIT;
