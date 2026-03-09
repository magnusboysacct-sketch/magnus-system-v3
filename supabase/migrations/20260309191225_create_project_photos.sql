/*
  # Create project_photos table and storage

  1. New Tables
    - `project_photos`
      - `id` (uuid, primary key) - Unique photo identifier
      - `project_id` (uuid, foreign key) - References projects table
      - `photo_url` (text) - URL/path to photo in storage
      - `caption` (text) - Photo description or caption
      - `uploaded_by` (uuid, foreign key) - References auth.users
      - `created_at` (timestamptz) - Photo upload timestamp

  2. Storage
    - Create `project-photos` storage bucket
    - Enable public access for photos
    - Set storage policies for project members

  3. Security
    - Enable RLS on `project_photos` table
    - Add policy for authenticated users to view photos for their projects
    - Add policy for authenticated users to upload photos for their projects
    - Add policy for authenticated users to delete photos they uploaded

  4. Indexes
    - Index on project_id for fast photo retrieval by project
    - Index on created_at for chronological ordering
*/

CREATE TABLE IF NOT EXISTS project_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text DEFAULT '',
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_photos_project_id ON project_photos(project_id);
CREATE INDEX IF NOT EXISTS idx_project_photos_created_at ON project_photos(created_at);

CREATE POLICY "Users can view photos for projects they are members of"
  ON project_photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_photos.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload photos for projects they are members of"
  ON project_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_photos.project_id
      AND project_members.user_id = auth.uid()
    )
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Users can delete photos they uploaded"
  ON project_photos
  FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Create storage bucket for project photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-photos', 'project-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for project-photos bucket
CREATE POLICY "Project members can view photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.user_id = auth.uid()
      AND (storage.foldername(name))[1] = project_members.project_id::text
    )
  );

CREATE POLICY "Project members can upload photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-photos'
    AND EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.user_id = auth.uid()
      AND (storage.foldername(name))[1] = project_members.project_id::text
    )
  );

CREATE POLICY "Users can delete their own photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND owner = auth.uid()
  );