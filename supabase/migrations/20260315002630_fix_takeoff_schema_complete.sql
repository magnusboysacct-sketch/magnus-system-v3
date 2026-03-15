/*
  # Complete Takeoff Schema Fix

  1. Purpose
    - Fix broken RLS policies that reference non-existent columns (company_id)
    - Ensure page_count exists on takeoff_sessions
    - Clean up references to non-existent tables (takeoff_drawings, takeoff_calibrations)
    - Create proper RLS policies based on project_members

  2. Schema Confirmation
    - takeoff_sessions: id, project_id, pdf_name, pdf_storage_path, page_count,
      calibration, name, pdf_bucket, pdf_path, pdf_url, created_at, updated_at
    - takeoff_groups: id, session_id, name, color, trade, is_hidden, sort_order, created_at
    - takeoff_measurements: id, session_id, page_number, group_id, type, points,
      unit, result, meta, sort_order, created_at

  3. Changes
    - Drop all broken RLS policies
    - Ensure page_count column exists
    - Create correct RLS policies based on project_members
*/

-- ============================================
-- Drop all broken RLS policies
-- ============================================

-- Drop policies that reference company_id (doesn't exist)
DROP POLICY IF EXISTS "Takeoff sessions select policy" ON public.takeoff_sessions;
DROP POLICY IF EXISTS "Takeoff sessions insert policy" ON public.takeoff_sessions;
DROP POLICY IF EXISTS "Takeoff sessions update policy" ON public.takeoff_sessions;
DROP POLICY IF EXISTS "Takeoff sessions delete policy" ON public.takeoff_sessions;

-- Drop policies for non-existent tables
DROP POLICY IF EXISTS "Takeoff drawings select policy" ON public.takeoff_drawings;
DROP POLICY IF EXISTS "Takeoff drawings insert policy" ON public.takeoff_drawings;
DROP POLICY IF EXISTS "Takeoff drawings update policy" ON public.takeoff_drawings;
DROP POLICY IF EXISTS "Takeoff drawings delete policy" ON public.takeoff_drawings;

DROP POLICY IF EXISTS "Takeoff calibrations select policy" ON public.takeoff_calibrations;
DROP POLICY IF EXISTS "Takeoff calibrations insert policy" ON public.takeoff_calibrations;
DROP POLICY IF EXISTS "Takeoff calibrations update policy" ON public.takeoff_calibrations;
DROP POLICY IF EXISTS "Takeoff calibrations delete policy" ON public.takeoff_calibrations;

-- Drop old group policies
DROP POLICY IF EXISTS "Takeoff groups select policy" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Takeoff groups insert policy" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Takeoff groups update policy" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Takeoff groups delete policy" ON public.takeoff_groups;

DROP POLICY IF EXISTS "Users can view takeoff groups" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Users can create takeoff groups" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Users can update takeoff groups" ON public.takeoff_groups;
DROP POLICY IF EXISTS "Users can delete takeoff groups" ON public.takeoff_groups;

-- Drop old measurement policies
DROP POLICY IF EXISTS "Takeoff measurements select policy" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Takeoff measurements insert policy" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Takeoff measurements update policy" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Takeoff measurements delete policy" ON public.takeoff_measurements;

DROP POLICY IF EXISTS "Users can view takeoff measurements" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Users can create takeoff measurements" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Users can update takeoff measurements" ON public.takeoff_measurements;
DROP POLICY IF EXISTS "Users can delete takeoff measurements" ON public.takeoff_measurements;

-- ============================================
-- Ensure page_count column exists
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'page_count'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN page_count integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ============================================
-- Create correct RLS policies
-- ============================================

-- TAKEOFF_SESSIONS policies (based on project_members)
CREATE POLICY "Users can view takeoff sessions for their projects"
  ON public.takeoff_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = takeoff_sessions.project_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create takeoff sessions for their projects"
  ON public.takeoff_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = takeoff_sessions.project_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update takeoff sessions for their projects"
  ON public.takeoff_sessions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = takeoff_sessions.project_id
      AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = takeoff_sessions.project_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete takeoff sessions for their projects"
  ON public.takeoff_sessions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = takeoff_sessions.project_id
      AND pm.user_id = auth.uid()
    )
  );

-- TAKEOFF_GROUPS policies (based on session -> project -> project_members)
CREATE POLICY "Users can view takeoff groups for their projects"
  ON public.takeoff_groups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_groups.session_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create takeoff groups for their projects"
  ON public.takeoff_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_groups.session_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update takeoff groups for their projects"
  ON public.takeoff_groups
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_groups.session_id
      AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_groups.session_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete takeoff groups for their projects"
  ON public.takeoff_groups
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_groups.session_id
      AND pm.user_id = auth.uid()
    )
  );

-- TAKEOFF_MEASUREMENTS policies (based on session -> project -> project_members)
CREATE POLICY "Users can view takeoff measurements for their projects"
  ON public.takeoff_measurements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_measurements.session_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create takeoff measurements for their projects"
  ON public.takeoff_measurements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_measurements.session_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update takeoff measurements for their projects"
  ON public.takeoff_measurements
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_measurements.session_id
      AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_measurements.session_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete takeoff measurements for their projects"
  ON public.takeoff_measurements
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM takeoff_sessions ts
      JOIN project_members pm ON pm.project_id = ts.project_id
      WHERE ts.id = takeoff_measurements.session_id
      AND pm.user_id = auth.uid()
    )
  );
