-- Scope cost_item_rates write policies to the caller's company (previously any director/admin/estimator could write
-- rates for any company's item). Applied directly to the live database; this file version-controls it.
BEGIN;

DROP POLICY IF EXISTS director_insert_rates ON public.cost_item_rates;
DROP POLICY IF EXISTS director_update_rates ON public.cost_item_rates;
DROP POLICY IF EXISTS director_delete_rates ON public.cost_item_rates;

CREATE POLICY cost_item_rates_insert ON public.cost_item_rates FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.cost_items ci WHERE ci.id = cost_item_rates.cost_item_id
    AND ci.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))
  AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director','admin','estimator'))
);

CREATE POLICY cost_item_rates_update ON public.cost_item_rates FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.cost_items ci WHERE ci.id = cost_item_rates.cost_item_id
    AND ci.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))
  AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director','admin','estimator'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.cost_items ci WHERE ci.id = cost_item_rates.cost_item_id
    AND ci.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))
);

CREATE POLICY cost_item_rates_delete ON public.cost_item_rates FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.cost_items ci WHERE ci.id = cost_item_rates.cost_item_id
    AND ci.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))
  AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director','admin','estimator'))
);

COMMIT;
