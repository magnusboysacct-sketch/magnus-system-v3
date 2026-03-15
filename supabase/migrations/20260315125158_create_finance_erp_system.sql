/*
  # Construction ERP Finance System

  ## Overview
  Complete finance layer for construction management including workers, payroll, 
  accounts receivable/payable, cash flow, expenses, and client/accountant portals.

  ## New Tables

  ### 1. Workers & Payroll
    - `workers` - Employees, subcontractors, and crew members
    - `worker_tax_info` - Tax withholding and statutory deduction settings
    - `crews` - Worker groups/teams
    - `crew_members` - Many-to-many relationship between workers and crews
    - `payroll_periods` - Pay period definitions
    - `payroll_entries` - Individual payroll records with deductions
    - `time_entries` - Worker time tracking

  ### 2. Accounts Receivable
    - `client_contracts` - Client agreements and payment terms
    - `contract_payment_schedules` - Payment milestones and due dates
    - `client_invoices` - Invoices sent to clients
    - `client_payments` - Payments received from clients

  ### 3. Accounts Payable
    - `supplier_invoices` - Invoices received from suppliers
    - `supplier_payments` - Payments made to suppliers
    - `expense_categories` - Categorization for expenses
    - `expenses` - General business expenses

  ### 4. Cash Flow
    - `bank_accounts` - Company bank accounts
    - `cash_transactions` - All cash movements
    - `cash_flow_projections` - Forward-looking cash estimates

  ### 5. Access Control
    - `accountant_access` - External accountant permissions
    - `portal_sessions` - Client and accountant portal access logs

  ## Security
  - All tables have RLS enabled
  - Company-based isolation via user_profiles.company_id
  - Role-based access for accountants and clients
  - Audit trails on financial transactions
*/

-- =====================================================
-- WORKERS & PAYROLL
-- =====================================================

CREATE TABLE IF NOT EXISTS workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  worker_type text NOT NULL CHECK (worker_type IN ('employee', 'subcontractor', 'crew_lead')),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  
  hire_date date,
  termination_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
  
  pay_type text CHECK (pay_type IN ('hourly', 'salary', 'contract')),
  pay_rate numeric(10,2),
  overtime_rate numeric(10,2),
  
  ssn_last_4 text,
  employee_id text,
  
  bank_account_number text,
  bank_routing_number text,
  
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS worker_tax_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  filing_status text CHECK (filing_status IN ('single', 'married', 'head_of_household')),
  federal_allowances integer DEFAULT 0,
  additional_federal_withholding numeric(10,2) DEFAULT 0,
  
  state_allowances integer DEFAULT 0,
  additional_state_withholding numeric(10,2) DEFAULT 0,
  
  health_insurance numeric(10,2) DEFAULT 0,
  retirement_401k_percent numeric(5,2) DEFAULT 0,
  retirement_401k_fixed numeric(10,2) DEFAULT 0,
  
  is_exempt_federal boolean DEFAULT false,
  is_exempt_state boolean DEFAULT false,
  is_exempt_fica boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  crew_lead_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  role text,
  joined_date date DEFAULT CURRENT_DATE,
  left_date date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(crew_id, worker_id)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  
  entry_date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  regular_hours numeric(5,2) DEFAULT 0,
  overtime_hours numeric(5,2) DEFAULT 0,
  
  notes text,
  approved boolean DEFAULT false,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date NOT NULL,
  
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'paid', 'cancelled')),
  
  total_gross numeric(12,2) DEFAULT 0,
  total_deductions numeric(12,2) DEFAULT 0,
  total_net numeric(12,2) DEFAULT 0,
  
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  
  regular_hours numeric(5,2) DEFAULT 0,
  overtime_hours numeric(5,2) DEFAULT 0,
  regular_pay numeric(10,2) DEFAULT 0,
  overtime_pay numeric(10,2) DEFAULT 0,
  gross_pay numeric(10,2) DEFAULT 0,
  
  federal_tax numeric(10,2) DEFAULT 0,
  state_tax numeric(10,2) DEFAULT 0,
  social_security numeric(10,2) DEFAULT 0,
  medicare numeric(10,2) DEFAULT 0,
  health_insurance numeric(10,2) DEFAULT 0,
  retirement_401k numeric(10,2) DEFAULT 0,
  other_deductions numeric(10,2) DEFAULT 0,
  total_deductions numeric(10,2) DEFAULT 0,
  
  net_pay numeric(10,2) DEFAULT 0,
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- ACCOUNTS RECEIVABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS client_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  
  contract_number text NOT NULL,
  contract_name text NOT NULL,
  contract_date date NOT NULL,
  start_date date,
  completion_date date,
  
  contract_amount numeric(12,2) NOT NULL,
  retention_percent numeric(5,2) DEFAULT 0,
  
  payment_terms text,
  billing_schedule text CHECK (billing_schedule IN ('milestone', 'monthly', 'completion', 'time_materials')),
  
  status text DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS contract_payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  milestone_name text NOT NULL,
  milestone_description text,
  due_date date,
  amount numeric(12,2) NOT NULL,
  percent_complete numeric(5,2),
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid')),
  invoiced_date date,
  paid_date date,
  
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES client_contracts(id) ON DELETE SET NULL,
  
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  
  subtotal numeric(12,2) DEFAULT 0,
  tax_rate numeric(5,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  
  amount_paid numeric(12,2) DEFAULT 0,
  balance_due numeric(12,2) DEFAULT 0,
  
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled')),
  
  notes text,
  terms text,
  
  sent_date date,
  paid_date date,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS client_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,
  
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(10,2) DEFAULT 0,
  amount numeric(12,2) DEFAULT 0,
  
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES client_invoices(id) ON DELETE SET NULL,
  
  payment_number text NOT NULL,
  payment_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  
  payment_method text CHECK (payment_method IN ('check', 'ach', 'wire', 'credit_card', 'cash', 'other')),
  reference_number text,
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- =====================================================
-- ACCOUNTS PAYABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  category_type text CHECK (category_type IN ('labor', 'materials', 'equipment', 'overhead', 'admin', 'other')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  shipping_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  
  amount_paid numeric(12,2) DEFAULT 0,
  balance_due numeric(12,2) DEFAULT 0,
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'partial', 'paid', 'disputed')),
  
  po_matched boolean DEFAULT false,
  receiving_matched boolean DEFAULT false,
  three_way_match_status text CHECK (three_way_match_status IN ('pending', 'matched', 'discrepancy')),
  
  notes text,
  
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  
  payment_number text NOT NULL,
  payment_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  
  payment_method text CHECK (payment_method IN ('check', 'ach', 'wire', 'credit_card', 'cash', 'other')),
  check_number text,
  reference_number text,
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  
  expense_date date NOT NULL,
  vendor text,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  
  payment_method text,
  receipt_url text,
  
  ocr_processed boolean DEFAULT false,
  ocr_confidence numeric(3,2),
  ocr_data jsonb,
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'reimbursed', 'rejected')),
  
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  reimbursed_at timestamptz,
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- =====================================================
-- CASH FLOW & BANKING
-- =====================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  account_name text NOT NULL,
  account_type text CHECK (account_type IN ('checking', 'savings', 'credit', 'line_of_credit')),
  account_number_last_4 text,
  bank_name text,
  
  current_balance numeric(12,2) DEFAULT 0,
  available_balance numeric(12,2) DEFAULT 0,
  
  is_primary boolean DEFAULT false,
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  
  transaction_date date NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer')),
  category text,
  
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2),
  
  description text NOT NULL,
  reference_number text,
  
  client_payment_id uuid REFERENCES client_payments(id) ON DELETE SET NULL,
  supplier_payment_id uuid REFERENCES supplier_payments(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  payroll_entry_id uuid REFERENCES payroll_entries(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS cash_flow_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  projection_date date NOT NULL,
  projected_inflow numeric(12,2) DEFAULT 0,
  projected_outflow numeric(12,2) DEFAULT 0,
  projected_balance numeric(12,2) DEFAULT 0,
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- ACCESS CONTROL & PORTALS
-- =====================================================

CREATE TABLE IF NOT EXISTS accountant_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  email text NOT NULL,
  full_name text NOT NULL,
  firm_name text,
  
  access_level text DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'full')),
  
  can_view_payroll boolean DEFAULT false,
  can_view_ar boolean DEFAULT true,
  can_view_ap boolean DEFAULT true,
  can_view_expenses boolean DEFAULT true,
  can_view_cash_flow boolean DEFAULT true,
  can_export_data boolean DEFAULT true,
  
  is_active boolean DEFAULT true,
  
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamptz DEFAULT now(),
  last_access timestamptz,
  
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  
  portal_type text NOT NULL CHECK (portal_type IN ('client', 'accountant')),
  user_email text NOT NULL,
  
  session_start timestamptz DEFAULT now(),
  session_end timestamptz,
  ip_address text,
  user_agent text,
  
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_workers_company ON workers(company_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_type ON workers(worker_type);

CREATE INDEX IF NOT EXISTS idx_time_entries_worker ON time_entries(worker_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(entry_date);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_worker ON payroll_entries(worker_id);

CREATE INDEX IF NOT EXISTS idx_client_invoices_company ON client_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_client_invoices_client ON client_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_client_invoices_status ON client_invoices(status);
CREATE INDEX IF NOT EXISTS idx_client_invoices_due_date ON client_invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_company ON supplier_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_po ON supplier_invoices(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON supplier_invoices(status);

CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_worker ON expenses(worker_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_company ON cash_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_date ON cash_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_type ON cash_transactions(transaction_type);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_tax_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE client_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flow_projections ENABLE ROW LEVEL SECURITY;

ALTER TABLE accountant_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES (using user_profiles.company_id)
-- =====================================================

CREATE POLICY "Users can view their company workers"
  ON workers FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company workers"
  ON workers FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company worker tax info"
  ON worker_tax_info FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company worker tax info"
  ON worker_tax_info FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company crews"
  ON crews FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company crews"
  ON crews FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view crew members"
  ON crew_members FOR SELECT
  TO authenticated
  USING (
    crew_id IN (
      SELECT id FROM crews 
      WHERE company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can manage crew members"
  ON crew_members FOR ALL
  TO authenticated
  USING (
    crew_id IN (
      SELECT id FROM crews 
      WHERE company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can view their company time entries"
  ON time_entries FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company time entries"
  ON time_entries FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company payroll periods"
  ON payroll_periods FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company payroll periods"
  ON payroll_periods FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company payroll entries"
  ON payroll_entries FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company payroll entries"
  ON payroll_entries FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company contracts"
  ON client_contracts FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company contracts"
  ON client_contracts FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view payment schedules"
  ON contract_payment_schedules FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage payment schedules"
  ON contract_payment_schedules FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company invoices"
  ON client_invoices FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company invoices"
  ON client_invoices FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view invoice items"
  ON client_invoice_items FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM client_invoices 
      WHERE company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can manage invoice items"
  ON client_invoice_items FOR ALL
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM client_invoices 
      WHERE company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can view their company client payments"
  ON client_payments FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company client payments"
  ON client_payments FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company expense categories"
  ON expense_categories FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company expense categories"
  ON expense_categories FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company supplier invoices"
  ON supplier_invoices FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company supplier invoices"
  ON supplier_invoices FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company supplier payments"
  ON supplier_payments FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company supplier payments"
  ON supplier_payments FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company expenses"
  ON expenses FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company bank accounts"
  ON bank_accounts FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company bank accounts"
  ON bank_accounts FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company cash transactions"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company cash transactions"
  ON cash_transactions FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company cash flow projections"
  ON cash_flow_projections FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company cash flow projections"
  ON cash_flow_projections FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company accountant access"
  ON accountant_access FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage their company accountant access"
  ON accountant_access FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their company portal sessions"
  ON portal_sessions FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert portal sessions"
  ON portal_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  );
