/*
  # Create project_documents table

  1. New Tables
    - `project_documents`
      - `id` (uuid, primary key) - Unique document identifier
      - `project_id` (uuid, foreign key) - References projects table
      - `file_name` (text) - Original name of uploaded file
      - `file_type` (text) - MIME type or file extension
      - `file_url` (text) - Storage path/URL for the file
      - `uploaded_by` (uuid, foreign key) - References auth.users
      - `created_at` (timestamptz) - Upload timestamp

  2. Security
    - Enable RLS on `project_documents` table
    - Add policy for authenticated users to view documents for their projects
    - Add policy for authenticated users to upload documents to their projects
    - Add policy for authenticated users to delete their own uploaded documents

  3. Indexes
    - Index on project_id for fast document retrieval by project
    - Index on uploaded_by for user document queries
*/

CREATE TABLE IF NOT EXISTS project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_uploaded_by ON project_documents(uploaded_by);

CREATE POLICY "Users can view documents for projects they are members of"
  ON project_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_documents.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload documents to projects they are members of"
  ON project_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_documents.project_id
      AND project_members.user_id = auth.uid()
    )
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Users can delete their own uploaded documents"
  ON project_documents
  FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());