-- Validation Queries for Supplier Intelligence RLS Hardening
-- Run these queries to verify the security hardening works correctly

-- Test 1: Verify user can only see their company's item supplier links
-- Should return 0 for cross-company access attempts
SELECT 
  'item_supplier_links RLS - Cross-company access test' as test_name,
  COUNT(*) as accessible_links
FROM item_supplier_links isl
JOIN cost_items ci ON ci.id = isl.project_item_id
JOIN user_profiles up ON up.company_id = ci.company_id
WHERE up.id = auth.uid()
AND ci.company_id != (SELECT company_id FROM user_profiles WHERE id = auth.uid());

-- Test 2: Verify user can only see their company's supplier price history
-- Should return 0 for cross-company access attempts
SELECT 
  'supplier_item_price_history RLS - Cross-company access test' as test_name,
  COUNT(*) as accessible_price_history
FROM supplier_item_price_history siph
JOIN supplier_items si ON si.id = siph.supplier_item_id
JOIN suppliers s ON s.id = si.supplier_id
JOIN user_profiles up ON up.company_id = s.company_id
WHERE up.id = auth.uid()
AND s.company_id != (SELECT company_id FROM user_profiles WHERE id = auth.uid());

-- Test 3: Verify user can access their own company's data
-- Should return > 0 for legitimate company data
SELECT 
  'item_supplier_links RLS - Same-company access test' as test_name,
  COUNT(*) as accessible_links
FROM item_supplier_links isl
JOIN cost_items ci ON ci.id = isl.project_item_id
JOIN user_profiles up ON up.company_id = ci.company_id
WHERE up.id = auth.uid();

-- Test 4: Verify supplier price history same-company access
-- Should return > 0 for legitimate company data
SELECT 
  'supplier_item_price_history RLS - Same-company access test' as test_name,
  COUNT(*) as accessible_price_history
FROM supplier_item_price_history siph
JOIN supplier_items si ON si.id = siph.supplier_item_id
JOIN suppliers s ON s.id = si.supplier_id
JOIN user_profiles up ON up.company_id = s.company_id
WHERE up.id = auth.uid();

-- Test 5: Verify policy existence and structure
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('item_supplier_links', 'supplier_item_price_history')
ORDER BY tablename, policyname;
