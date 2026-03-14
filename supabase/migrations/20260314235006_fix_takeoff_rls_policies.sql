/*
  # Fix Takeoff Engine RLS Policies

  1. Security Changes
    - Drop duplicate/old RLS policies on takeoff tables
    - Create clean, consistent RLS policies for all tables
    - Policies check company_id against user's company

  2. Tables Updated
    - takeoff_sessions
    - takeoff_drawings  
    - takeoff_groups
    - takeoff_measurements
    - takeoff_calibrations

  3. Policy Pattern
    - All policies use authenticated role
    - All check: company_id matches user's company_id from user_profiles
    - Covers SELECT, INSERT, UPDATE, DELETE operations
*/

-- ============================================
-- Drop old/duplicate policies
-- ============================================

-- takeoff_sessions
DROP POLICY IF EXISTS "Users can view takeoff sessions" ON public.takeoff_sessions;
DROP POLICY IF EXISTS "Users can create takeoff sessions" ON public.takeoff_sessions;
DROP POLICY IF EXISTS "Users can update takeoff sessions" ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_select ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_insert ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_update ON public.takeoff_sessions;
DROP POLICY IF EXISTS takeoff_sessions_delete ON public.takeoff_sessions;

-- takeoff_groups
DROP POLICY IF EXISTS takeoff_groups_select ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_groups_insert ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_groups_update ON public.takeoff_groups;
DROP POLICY IF EXISTS takeoff_groups_delete ON public.takeoff_groups;

-- takeoff_measurements
DROP POLICY IF EXISTS takeoff_measurements_select ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_measurements_insert ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_measurements_update ON public.takeoff_measurements;
DROP POLICY IF EXISTS takeoff_measurements_delete ON public.takeoff_measurements;

-- ============================================
-- Create clean RLS policies
-- ============================================

-- TAKEOFF_SESSIONS policies
CREATE POLICY "Takeoff sessions select policy"
  ON public.takeoff_sessions
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff sessions insert policy"
  ON public.takeoff_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff sessions update policy"
  ON public.takeoff_sessions
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff sessions delete policy"
  ON public.takeoff_sessions
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

-- TAKEOFF_DRAWINGS policies
CREATE POLICY "Takeoff drawings select policy"
  ON public.takeoff_drawings
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff drawings insert policy"
  ON public.takeoff_drawings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff drawings update policy"
  ON public.takeoff_drawings
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff drawings delete policy"
  ON public.takeoff_drawings
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

-- TAKEOFF_GROUPS policies
CREATE POLICY "Takeoff groups select policy"
  ON public.takeoff_groups
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff groups insert policy"
  ON public.takeoff_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff groups update policy"
  ON public.takeoff_groups
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff groups delete policy"
  ON public.takeoff_groups
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

-- TAKEOFF_MEASUREMENTS policies
CREATE POLICY "Takeoff measurements select policy"
  ON public.takeoff_measurements
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff measurements insert policy"
  ON public.takeoff_measurements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff measurements update policy"
  ON public.takeoff_measurements
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff measurements delete policy"
  ON public.takeoff_measurements
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

-- TAKEOFF_CALIBRATIONS policies
CREATE POLICY "Takeoff calibrations select policy"
  ON public.takeoff_calibrations
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff calibrations insert policy"
  ON public.takeoff_calibrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff calibrations update policy"
  ON public.takeoff_calibrations
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Takeoff calibrations delete policy"
  ON public.takeoff_calibrations
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );
