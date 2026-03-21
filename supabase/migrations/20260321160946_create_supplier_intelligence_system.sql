/*
  # Create Supplier Intelligence System

  1. New Tables
    - `supplier_items`
      - `id` (uuid, primary key)
      - `supplier_id` (uuid, foreign key) - References suppliers table
      - `item_name` (text) - Item name from supplier catalog
      - `supplier_sku` (text) - Supplier's SKU/part number
      - `description` (text) - Item description
      - `unit` (text) - Unit of measure
      - `current_price` (decimal) - Current price
      - `currency` (text) - Currency code (USD, EUR, etc)
      - `last_price_update` (timestamptz) - When price was last updated
      - `availability_status` (text) - in_stock, out_of_stock, discontinued, unknown
      - `lead_time_days` (integer) - Typical lead time in days
      - `minimum_order_quantity` (decimal) - Minimum order quantity
      - `package_size` (text) - Package size description
      - `manufacturer` (text) - Manufacturer name
      - `manufacturer_sku` (text) - Manufacturer SKU
      - `category` (text) - Item category
      - `supplier_url` (text) - URL to item on supplier website
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `item_supplier_links`
      - `id` (uuid, primary key)
      - `project_item_id` (uuid) - References project items (BOQ, procurement)
      - `supplier_item_id` (uuid, foreign key) - References supplier_items
      - `is_preferred` (boolean) - Is this the preferred supplier for this item
      - `notes` (text) - Link-specific notes
      - `created_at` (timestamptz)

    - `supplier_item_price_history`
      - `id` (uuid, primary key)
      - `supplier_item_id` (uuid, foreign key) - References supplier_items
      - `price` (decimal) - Historical price
      - `currency` (text) - Currency code
      - `recorded_at` (timestamptz) - When price was recorded

    - `ai_suggestion_history`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key) - References auth.users
      - `suggestion_id` (text) - ID of the suggestion
      - `action` (text) - viewed, dismissed, accepted
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage supplier intelligence

  3. Indexes
    - Index on supplier_id for fast lookups
    - Index on supplier_sku for SKU searches
    - Index on item_name for text searches
    - Index on project_item_id for link lookups
*/

CREATE TABLE IF NOT EXISTS supplier_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  supplier_sku text NOT NULL,
  description text DEFAULT '',
  unit text DEFAULT 'EA',
  current_price decimal(12, 2) NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  last_price_update timestamptz DEFAULT now(),
  availability_status text DEFAULT 'unknown' CHECK (availability_status IN ('in_stock', 'out_of_stock', 'discontinued', 'unknown')),
  lead_time_days integer,
  minimum_order_quantity decimal(12, 3),
  package_size text,
  manufacturer text,
  manufacturer_sku text,
  category text,
  supplier_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(supplier_id, supplier_sku)
);

CREATE TABLE IF NOT EXISTS item_supplier_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_item_id uuid NOT NULL,
  supplier_item_id uuid NOT NULL REFERENCES supplier_items(id) ON DELETE CASCADE,
  is_preferred boolean DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_item_id, supplier_item_id)
);

CREATE TABLE IF NOT EXISTS supplier_item_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_item_id uuid NOT NULL REFERENCES supplier_items(id) ON DELETE CASCADE,
  price decimal(12, 2) NOT NULL,
  currency text DEFAULT 'USD',
  recorded_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_suggestion_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('viewed', 'dismissed', 'accepted')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE supplier_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_supplier_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_item_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestion_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier_id ON supplier_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_sku ON supplier_items(supplier_sku);
CREATE INDEX IF NOT EXISTS idx_supplier_items_name ON supplier_items(item_name);
CREATE INDEX IF NOT EXISTS idx_item_supplier_links_project_item ON item_supplier_links(project_item_id);
CREATE INDEX IF NOT EXISTS idx_item_supplier_links_supplier_item ON item_supplier_links(supplier_item_id);
CREATE INDEX IF NOT EXISTS idx_price_history_supplier_item ON supplier_item_price_history(supplier_item_id);
CREATE INDEX IF NOT EXISTS idx_ai_history_user ON ai_suggestion_history(user_id);

CREATE POLICY "Users can view supplier items for their company suppliers"
  ON supplier_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM suppliers
      WHERE suppliers.id = supplier_items.supplier_id
      AND suppliers.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create supplier items for their company suppliers"
  ON supplier_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM suppliers
      WHERE suppliers.id = supplier_items.supplier_id
      AND suppliers.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update supplier items for their company suppliers"
  ON supplier_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM suppliers
      WHERE suppliers.id = supplier_items.supplier_id
      AND suppliers.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM suppliers
      WHERE suppliers.id = supplier_items.supplier_id
      AND suppliers.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete supplier items for their company suppliers"
  ON supplier_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM suppliers
      WHERE suppliers.id = supplier_items.supplier_id
      AND suppliers.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can view item supplier links"
  ON item_supplier_links
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create item supplier links"
  ON item_supplier_links
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update item supplier links"
  ON item_supplier_links
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete item supplier links"
  ON item_supplier_links
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Users can view price history"
  ON supplier_item_price_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create price history"
  ON supplier_item_price_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view own AI suggestion history"
  ON ai_suggestion_history
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own AI suggestion history"
  ON ai_suggestion_history
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
