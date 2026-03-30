/*
  Phase 7: Automation Engine - Classification and Matching Rules
  
  Creates the automation engine system that provides pattern-based classification
  and rule-based matching for bank and credit card transactions.
  
  Tables Created:
  - classification_rules: Pattern-based classification rules for transactions
  - matching_rules: Rule-based matching for transactions to business entities
  
  This integrates with:
  - Phase 5 bank_transactions for bank transaction processing
  - Phase 6 credit_card_transactions for credit card transaction processing
  - Phase 2 posting engine for GL transaction creation
  - Existing company-based security model
*/

-- =====================================================
-- CLASSIFICATION RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  -- Rule identification
  name text NOT NULL,
  description text,
  
  -- Classification pattern (regex or simple text)
  pattern text NOT NULL,
  pattern_type text DEFAULT 'text' CHECK (pattern_type IN ('text', 'regex', 'exact')),
  
  -- Classification result
  category text NOT NULL,
  subcategory text,
  confidence_score numeric(3,2) DEFAULT 0.50 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Rule conditions
  transaction_type text CHECK (transaction_type IN ('all', 'debit', 'credit', 'charge', 'payment', 'fee', 'interest', 'transfer')),
  amount_min numeric(15,2),
  amount_max numeric(15,2),
  description_contains text,
  description_not_contains text,
  
  -- Rule priority and status
  priority integer DEFAULT 100 CHECK (priority >= 1 AND priority <= 999),
  is_active boolean DEFAULT true,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CHECK(amount_min IS NULL OR amount_max IS NULL OR amount_min <= amount_max),
  CHECK(confidence_score >= 0 AND confidence_score <= 1)
);

-- =====================================================
-- MATCHING RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS matching_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  -- Rule identification
  name text NOT NULL,
  description text,
  
  -- Rule type
  rule_type text NOT NULL CHECK (rule_type IN (
    'exact_match',      // Exact field match
    'pattern_match',    // Pattern-based matching
    'amount_range',     // Amount range matching
    'date_range',       // Date range matching
    'reference_match',  // Reference number matching
    'combined',         // Multiple conditions combined
    'custom'            // Custom SQL logic
  )),
  
  -- Matching conditions (JSON for flexibility)
  conditions_json jsonb DEFAULT '{}',
  
  -- Target entity to match
  target_entity_type text CHECK (target_entity_type IN (
    'expense',
    'supplier_invoice',
    'client_invoice',
    'client_payment',
    'supplier_payment',
    'gl_transaction',
    'bank_transfer',
    'credit_card_payment',
    'payroll_entry',
    'procurement'
  )),
  
  -- Matching criteria
  target_field text, -- Field to match on target entity
  target_value text, -- Value to match (can be pattern)
  match_operator text DEFAULT 'equals' CHECK (match_operator IN (
    'equals',
    'contains',
    'starts_with',
    'ends_with',
    'regex',
    'greater_than',
    'less_than',
    'between'
  )),
  
  -- Confidence and priority
  confidence_score numeric(3,2) DEFAULT 0.50 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  priority integer DEFAULT 100 CHECK (priority >= 1 AND priority <= 999),
  
  -- Rule status
  is_active boolean DEFAULT true,
  auto_apply boolean DEFAULT false, -- Automatically apply when confidence >= threshold
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CHECK(confidence_score >= 0 AND confidence_score <= 1)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Classification rules indexes
CREATE INDEX IF NOT EXISTS idx_classification_rules_company ON classification_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_classification_rules_category ON classification_rules(category);
CREATE INDEX IF NOT EXISTS idx_classification_rules_active ON classification_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_classification_rules_priority ON classification_rules(priority);
CREATE INDEX IF NOT EXISTS idx_classification_rules_pattern ON classification_rules(pattern);

-- Matching rules indexes
CREATE INDEX IF NOT EXISTS idx_matching_rules_company ON matching_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_matching_rules_entity_type ON matching_rules(target_entity_type);
CREATE INDEX IF NOT EXISTS idx_matching_rules_active ON matching_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_matching_rules_priority ON matching_rules(priority);
CREATE INDEX IF NOT EXISTS idx_matching_rules_auto_apply ON matching_rules(auto_apply);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE classification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_rules ENABLE ROW LEVEL SECURITY;

-- Classification rules RLS
CREATE POLICY "Users can view their company classification rules"
  ON classification_rules FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company classification rules"
  ON classification_rules FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- Matching rules RLS
CREATE POLICY "Users can view their company matching rules"
  ON matching_rules FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company matching rules"
  ON matching_rules FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_automation_engine_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_classification_rules_updated_at
  BEFORE UPDATE ON classification_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_engine_updated_at();

CREATE TRIGGER set_matching_rules_updated_at
  BEFORE UPDATE ON matching_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_engine_updated_at();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Active classification rules view
CREATE OR REPLACE VIEW v_active_classification_rules AS
SELECT 
  id,
  company_id,
  name,
  description,
  pattern,
  pattern_type,
  category,
  subcategory,
  confidence_score,
  transaction_type,
  amount_min,
  amount_max,
  description_contains,
  description_not_contains,
  priority,
  created_at,
  updated_at
FROM classification_rules 
WHERE is_active = true
ORDER BY priority DESC, confidence_score DESC;

-- Active matching rules view
CREATE OR REPLACE VIEW v_active_matching_rules AS
SELECT 
  id,
  company_id,
  name,
  description,
  rule_type,
  conditions_json,
  target_entity_type,
  target_field,
  target_value,
  match_operator,
  confidence_score,
  priority,
  auto_apply,
  created_at,
  updated_at
FROM matching_rules 
WHERE is_active = true
ORDER BY priority DESC, confidence_score DESC;

-- =====================================================
-- FUNCTIONS FOR AUTOMATION
-- =====================================================

-- Function to classify a transaction based on rules
CREATE OR REPLACE FUNCTION classify_transaction(
  p_company_id uuid,
  p_description text,
  p_amount numeric,
  p_transaction_type text DEFAULT 'all',
  p_transaction_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  rule_id uuid,
  category text,
  subcategory text,
  confidence_score numeric,
  match_type text,
  rule_name text
) AS $$
DECLARE
  v_matched boolean := false;
BEGIN
  -- Try to match classification rules in priority order
  RETURN QUERY
  SELECT 
    cr.id,
    cr.category,
    cr.subcategory,
    cr.confidence_score,
    cr.pattern_type as match_type,
    cr.name as rule_name
  FROM classification_rules cr
  WHERE cr.company_id = p_company_id
    AND cr.is_active = true
    AND (
      -- Text pattern matching
      (cr.pattern_type = 'text' AND (
        (p_description ILIKE '%' || cr.pattern || '%') OR
        (p_description ILIKE cr.pattern || '%') OR
        (p_description = cr.pattern)
      ))
      OR
      -- Regex pattern matching
      (cr.pattern_type = 'regex' AND p_description ~ cr.pattern)
      OR
      -- Exact match
      (cr.pattern_type = 'exact' AND p_description = cr.pattern)
    )
    AND (
      cr.transaction_type = 'all' OR cr.transaction_type = p_transaction_type
    )
    AND (
      cr.amount_min IS NULL OR p_amount >= cr.amount_min
    )
    AND (
      cr.amount_max IS NULL OR p_amount <= cr.amount_max
    )
    AND (
      cr.description_contains IS NULL OR p_description ILIKE '%' || cr.description_contains || '%'
    )
    AND (
      cr.description_not_contains IS NULL OR p_description NOT ILIKE '%' || cr.description_not_contains || '%'
    )
  ORDER BY cr.priority DESC, cr.confidence_score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find matching entities for a transaction
CREATE OR REPLACE FUNCTION match_transaction(
  p_company_id uuid,
  p_description text,
  p_amount numeric,
  p_transaction_date date DEFAULT CURRENT_DATE,
  p_reference_number text DEFAULT NULL,
  p_entity_type text DEFAULT NULL
)
RETURNS TABLE (
  rule_id uuid,
  target_entity_type text,
  target_entity_id uuid,
  target_field text,
  target_value text,
  confidence_score numeric,
  match_details jsonb
) AS $$
BEGIN
  -- Try to match entities based on matching rules
  IF p_entity_type IS NOT NULL THEN
    -- Search for specific entity type
    RETURN QUERY
    SELECT 
      mr.id,
      mr.target_entity_type,
      CASE
        -- Expense matching
        WHEN mr.target_entity_type = 'expense' THEN (
          SELECT id FROM expenses 
          WHERE company_id = p_company_id 
            AND mr.match_operator = 'contains' AND description ILIKE '%' || mr.target_value || '%'
            AND (mr.target_field = 'description' OR mr.target_field IS NULL)
            LIMIT 1
        )
        -- Supplier invoice matching
        WHEN mr.target_entity_type = 'supplier_invoice' THEN (
          SELECT id FROM supplier_invoices 
          WHERE company_id = p_company_id 
            AND mr.match_operator = 'contains' AND invoice_number ILIKE '%' || mr.target_value || '%'
            AND (mr.target_field = 'invoice_number' OR mr.target_field IS NULL)
            LIMIT 1
        )
        -- Client invoice matching
        WHEN mr.target_entity_type = 'client_invoice' THEN (
          SELECT id FROM client_invoices 
          WHERE company_id = p_company_id 
            AND mr.match_operator = 'contains' AND invoice_number ILIKE '%' || mr.target_value || '%'
            AND (mr.target_field = 'invoice_number' OR mr.target_field IS NULL)
            LIMIT 1
        )
        -- Add more entity types as needed
        ELSE NULL
      END,
      mr.target_field,
      mr.target_value,
      mr.confidence_score,
      jsonb_build_object(
        'match_operator', mr.match_operator,
        'matched_field', COALESCE(mr.target_field, 'description'),
        'conditions', mr.conditions_json
      ) as match_details
    FROM matching_rules mr
    WHERE mr.company_id = p_company_id
      AND mr.is_active = true
      AND mr.target_entity_type = p_entity_type
      AND (
        -- Description matching
        (mr.target_field = 'description' AND p_description ILIKE '%' || mr.target_value || '%')
        OR
        -- Reference number matching
        (mr.target_field = 'reference_number' AND p_reference_number ILIKE '%' || mr.target_value || '%')
        OR
        -- Amount matching
        (mr.target_field = 'amount' AND p_amount = CAST(mr.target_value AS numeric))
      )
    ORDER BY mr.priority DESC, mr.confidence_score DESC
    LIMIT 5;
  ELSE
    -- Search all entity types
    RETURN QUERY
    SELECT 
      mr.id,
      mr.target_entity_type,
      CASE
        WHEN mr.target_entity_type = 'expense' THEN (
          SELECT id FROM expenses 
          WHERE company_id = p_company_id 
            AND mr.match_operator = 'contains' AND description ILIKE '%' || mr.target_value || '%'
            AND (mr.target_field = 'description' OR mr.target_field IS NULL)
            LIMIT 1
        )
        WHEN mr.target_entity_type = 'supplier_invoice' THEN (
          SELECT id FROM supplier_invoices 
          WHERE company_id = p_company_id 
            AND mr.match_operator = 'contains' AND invoice_number ILIKE '%' || mr.target_value || '%'
            AND (mr.target_field = 'invoice_number' OR mr.target_field IS NULL)
            LIMIT 1
        )
        -- Add more entity types as needed
        ELSE NULL
      END,
      mr.target_field,
      mr.target_value,
      mr.confidence_score,
      jsonb_build_object(
        'match_operator', mr.match_operator,
        'matched_field', COALESCE(mr.target_field, 'description'),
        'conditions', mr.conditions_json
      ) as match_details
    FROM matching_rules mr
    WHERE mr.company_id = p_company_id
      AND mr.is_active = true
      AND (
        -- Description matching
        (mr.target_field = 'description' AND p_description ILIKE '%' || mr.target_value || '%')
        OR
        -- Reference number matching
        (mr.target_field = 'reference_number' AND p_reference_number ILIKE '%' || mr.target_value || '%')
        OR
        -- Amount matching
        (mr.target_field = 'amount' AND p_amount = CAST(mr.target_value AS numeric))
      )
    ORDER BY mr.priority DESC, mr.confidence_score DESC
    LIMIT 10;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate confidence score for a transaction
CREATE OR REPLACE FUNCTION get_confidence_score(
  p_company_id uuid,
  p_description text,
  p_amount numeric,
  p_transaction_type text DEFAULT 'all',
  p_reference_number text DEFAULT NULL,
  p_existing_matches jsonb DEFAULT '[]'::jsonb
)
RETURNS numeric AS $$
DECLARE
  v_base_score numeric := 0.50;
  v_pattern_score numeric := 0;
  v_amount_score numeric := 0;
  v_reference_score numeric := 0;
  v_existing_score numeric := 0;
  v_final_score numeric;
BEGIN
  -- Base score for having any data
  IF p_description IS NOT NULL THEN
    v_base_score := v_base_score + 0.10;
  END IF;
  
  -- Pattern matching score (check against classification rules)
  SELECT COALESCE(AVG(confidence_score), 0) INTO v_pattern_score
  FROM classification_rules
  WHERE company_id = p_company_id
    AND is_active = true
    AND (
      (pattern_type = 'text' AND p_description ILIKE '%' || pattern || '%')
      OR (pattern_type = 'regex' AND p_description ~ pattern)
      OR (pattern_type = 'exact' AND p_description = pattern)
    );
  
  -- Amount score (round numbers are more reliable)
  IF p_amount IS NOT NULL AND p_amount > 0 THEN
    IF p_amount = ROUND(p_amount, 2) THEN
      v_amount_score := 0.20;
    ELSE
      v_amount_score := 0.10;
    END IF;
  END IF;
  
  -- Reference number score (if present)
  IF p_reference_number IS NOT NULL AND LENGTH(p_reference_number) > 3 THEN
    v_reference_score := 0.15;
  END IF;
  
  -- Existing matches score (if previously matched)
  IF jsonb_array_length(p_existing_matches) > 0 THEN
    v_existing_score := LEAST(jsonb_array_length(p_existing_matches) * 0.05, 0.25);
  END IF;
  
  -- Calculate final score
  v_final_score := LEAST(v_base_score + v_pattern_score + v_amount_score + v_reference_score + v_existing_score, 1.00);
  
  RETURN v_final_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENT: USAGE NOTES
-- =====================================================

/*
  Automation Engine System:
  
  1. Classification Rules:
     - Pattern-based classification for transaction categories
     - Support for text, regex, and exact matching patterns
     - Confidence scoring for classification quality
     - Priority-based rule ordering
     - Conditions for amount ranges and text matching
  
  2. Matching Rules:
     - Rule-based matching to business entities
     - Support for multiple entity types (expenses, invoices, payments)
     - Flexible conditions using JSONB storage
     - Multiple match operators (contains, equals, regex, etc.)
     - Confidence scoring for match quality
  
  3. Integration Points:
     - Works with bank_transactions (Phase 5)
     - Works with credit_card_transactions (Phase 6)
     - Integrates with posting engine (Phase 2)
     - Maintains company-based security model
  
  4. Automation Functions:
     - classify_transaction(): Returns classification results
     - match_transaction(): Returns matching candidates
     - get_confidence_score(): Calculates confidence score
     - All functions are database functions for performance
  
  5. Simple Pattern System:
     - No AI/ML implementation (as required)
     - Pure SQL-based pattern matching
     - Regex support for advanced patterns
     - Text matching for simple cases
     - Amount and date range matching
  
  6. Future Extensibility:
     - JSONB conditions allow for complex rule logic
     - Custom rule type for advanced automation
     - Auto-apply flag for automatic processing
     - Priority system for rule ordering
*/
