/*
  # Create procurement_items table

  1. New Tables
    - `procurement_items`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `source_boq_item_id` (uuid, references boq_items)
      - `material_name` (text, name of the material)
      - `quantity` (numeric, quantity needed)
      - `unit` (text, unit of measurement)
      - `category` (text, optional category/trade)
      - `notes` (text, optional notes)
      - `status` (text, procurement status: 'pending', 'ordered', 'received')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `procurement_items` table
    - Add policy for authenticated users to read procurement items for their projects
    - Add policy for authenticated users to insert procurement items
    - Add policy for authenticated users to update procurement items
    - Add policy for authenticated users to delete procurement items

  3. Indexes
    - Index on project_id for fast filtering
    - Index on source_boq_item_id for tracing back to BOQ
*/

CREATE TABLE IF NOT EXISTS procurement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_boq_item_id uuid REFERENCES boq_items(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  category text,
  notes text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'received')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_items_project_id ON procurement_items(project_id);
CREATE INDEX IF NOT EXISTS idx_procurement_items_source_boq_item_id ON procurement_items(source_boq_item_id);
CREATE INDEX IF NOT EXISTS idx_procurement_items_status ON procurement_items(status);

ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view procurement items for their projects"
  ON procurement_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_items.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert procurement items for their projects"
  ON procurement_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_items.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update procurement items for their projects"
  ON procurement_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_items.project_id
      AND project_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_items.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete procurement items for their projects"
  ON procurement_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_items.project_id
      AND project_members.user_id = auth.uid()
    )
  );
