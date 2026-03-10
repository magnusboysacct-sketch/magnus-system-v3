/*
  # Upgrade Procurement System to Document Workflow

  ## Overview
  Transform procurement from loose items into a structured document workflow with saved lists,
  print support, and preparation for future purchase orders.

  ## Changes

  ### 1. New Tables
    - `procurement_headers`
      - `id` (uuid, primary key) - Unique document identifier
      - `project_id` (uuid, not null, FK to projects) - Project this procurement belongs to
      - `boq_id` (uuid, nullable, FK to boq_headers) - Source BOQ if generated from BOQ
      - `title` (text, not null) - Document title
      - `status` (text, default 'draft') - Document status: draft, approved, sent, completed
      - `notes` (text, nullable) - Document-level notes
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  ### 2. Updated Tables
    - `procurement_items`
      - ADD `procurement_id` (uuid, FK to procurement_headers) - Links item to parent document
      - ADD `supplier` (text, nullable) - Supplier name for future use
      - ADD `description` (text, nullable) - Item description separate from notes
      - Existing columns preserved

  ### 3. Data Migration
    - Create default procurement header for existing items per project
    - Link existing items to their project's default procurement document
    - Preserve all existing data

  ### 4. Security
    - Enable RLS on procurement_headers
    - Add policies for project members to manage procurement documents
    - Update procurement_items policies to work with new structure
*/

-- Step 1: Create procurement_headers table
CREATE TABLE IF NOT EXISTS procurement_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  boq_id uuid REFERENCES boq_headers(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Procurement List',
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_procurement_headers_project_id ON procurement_headers(project_id);
CREATE INDEX IF NOT EXISTS idx_procurement_headers_boq_id ON procurement_headers(boq_id);

-- Step 2: Add new columns to procurement_items
ALTER TABLE procurement_items 
  ADD COLUMN IF NOT EXISTS procurement_id uuid REFERENCES procurement_headers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS description text;

-- Add index for procurement_id lookups
CREATE INDEX IF NOT EXISTS idx_procurement_items_procurement_id ON procurement_items(procurement_id);

-- Step 3: Migrate existing procurement_items to have procurement_headers
-- For each project with procurement items, create a default procurement header
DO $$
DECLARE
  project_rec RECORD;
  header_id uuid;
  boq_rec RECORD;
BEGIN
  -- Loop through each project that has procurement items
  FOR project_rec IN 
    SELECT DISTINCT project_id 
    FROM procurement_items 
    WHERE procurement_id IS NULL
  LOOP
    -- Try to find the most recent BOQ for this project
    SELECT id INTO boq_rec
    FROM boq_headers
    WHERE project_id = project_rec.project_id
    ORDER BY updated_at DESC
    LIMIT 1;

    -- Create a procurement header for this project
    INSERT INTO procurement_headers (
      project_id,
      boq_id,
      title,
      status,
      notes,
      created_at
    )
    VALUES (
      project_rec.project_id,
      boq_rec.id,
      'BOQ Materials List',
      'draft',
      'Automatically migrated from previous procurement items',
      now()
    )
    RETURNING id INTO header_id;

    -- Link all existing items for this project to the new header
    UPDATE procurement_items
    SET procurement_id = header_id
    WHERE project_id = project_rec.project_id
      AND procurement_id IS NULL;

    RAISE NOTICE 'Migrated procurement items for project % to header %', project_rec.project_id, header_id;
  END LOOP;
END $$;

-- Step 4: Make procurement_id NOT NULL after migration
-- Wait, we should keep it nullable in case manual items are added later
-- Actually, let's make it NOT NULL since every item should belong to a document
ALTER TABLE procurement_items 
  ALTER COLUMN procurement_id SET NOT NULL;

-- Step 5: Enable RLS on procurement_headers
ALTER TABLE procurement_headers ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for procurement_headers

-- Policy: Project members can view procurement documents for their projects
CREATE POLICY "Project members can view procurement documents"
  ON procurement_headers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_headers.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can create procurement documents for their projects
CREATE POLICY "Project members can create procurement documents"
  ON procurement_headers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_headers.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can update procurement documents for their projects
CREATE POLICY "Project members can update procurement documents"
  ON procurement_headers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_headers.project_id
        AND project_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_headers.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Project members can delete procurement documents for their projects
CREATE POLICY "Project members can delete procurement documents"
  ON procurement_headers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = procurement_headers.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Step 7: Update procurement_items RLS policies to work with new structure
-- Drop old policies if they exist
DROP POLICY IF EXISTS "Project members can view procurement items" ON procurement_items;
DROP POLICY IF EXISTS "Project members can create procurement items" ON procurement_items;
DROP POLICY IF EXISTS "Project members can update procurement items" ON procurement_items;
DROP POLICY IF EXISTS "Project members can delete procurement items" ON procurement_items;

-- New policies using procurement_headers relationship
CREATE POLICY "Project members can view procurement items"
  ON procurement_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurement_headers
      JOIN project_members ON project_members.project_id = procurement_headers.project_id
      WHERE procurement_headers.id = procurement_items.procurement_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can create procurement items"
  ON procurement_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurement_headers
      JOIN project_members ON project_members.project_id = procurement_headers.project_id
      WHERE procurement_headers.id = procurement_items.procurement_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can update procurement items"
  ON procurement_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurement_headers
      JOIN project_members ON project_members.project_id = procurement_headers.project_id
      WHERE procurement_headers.id = procurement_items.procurement_id
        AND project_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurement_headers
      JOIN project_members ON project_members.project_id = procurement_headers.project_id
      WHERE procurement_headers.id = procurement_items.procurement_id
        AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can delete procurement items"
  ON procurement_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurement_headers
      JOIN project_members ON project_members.project_id = procurement_headers.project_id
      WHERE procurement_headers.id = procurement_items.procurement_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Step 8: Add helpful comment
COMMENT ON TABLE procurement_headers IS 'Procurement document headers - each represents a saved procurement list/order';
COMMENT ON TABLE procurement_items IS 'Individual items within procurement documents - always linked to a procurement_headers record';
