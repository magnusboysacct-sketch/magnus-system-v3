/*
  # Add Missing Takeoff Columns for Frontend Compatibility

  1. Purpose
    - Add missing columns that TakeoffPage.tsx expects but don't exist in DB
    - Make drawing_id nullable (frontend doesn't use it)
    - Ensure frontend types match actual database schema

  2. Changes to takeoff_sessions
    - Make drawing_id nullable (currently NOT NULL but frontend doesn't provide it)
    - Add pdf_name, pdf_storage_path, calibration if missing

  3. Changes to takeoff_groups
    - Add trade, is_hidden if missing
    - Ensure color exists

  4. Changes to takeoff_measurements
    - Add type, unit, result, meta columns if missing
    - These map from tool_type, display_unit, raw_*, etc.
*/

-- ============================================
-- Step 1: Fix takeoff_sessions
-- ============================================

-- Make drawing_id nullable
ALTER TABLE public.takeoff_sessions
ALTER COLUMN drawing_id DROP NOT NULL;

-- Add pdf_name if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'pdf_name'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN pdf_name text NULL;
  END IF;
END $$;

-- Add pdf_storage_path if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'pdf_storage_path'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN pdf_storage_path text NULL;
  END IF;
END $$;

-- Add calibration if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'calibration'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN calibration jsonb NULL;
  END IF;
END $$;

-- ============================================
-- Step 2: Fix takeoff_groups
-- ============================================

-- Add trade if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_groups'
    AND column_name = 'trade'
  ) THEN
    ALTER TABLE public.takeoff_groups
    ADD COLUMN trade text NULL;
  END IF;
END $$;

-- Add is_hidden if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_groups'
    AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE public.takeoff_groups
    ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================
-- Step 3: Fix takeoff_measurements
-- ============================================

-- Make drawing_id nullable
ALTER TABLE public.takeoff_measurements
ALTER COLUMN drawing_id DROP NOT NULL;

-- Add type column (maps from tool_type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_measurements'
    AND column_name = 'type'
  ) THEN
    ALTER TABLE public.takeoff_measurements
    ADD COLUMN type text NULL CHECK (type IN ('line', 'area', 'volume', 'count'));
  END IF;
END $$;

-- Populate type from tool_type
UPDATE public.takeoff_measurements
SET type = CASE
  WHEN tool_type IN ('line', 'polyline', 'length') THEN 'line'
  WHEN tool_type IN ('area', 'polygon', 'rectangle') THEN 'area'
  WHEN tool_type = 'volume' THEN 'volume'
  WHEN tool_type IN ('count', 'point') THEN 'count'
  ELSE 'count'
END
WHERE type IS NULL;

-- Add unit column (maps from display_unit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_measurements'
    AND column_name = 'unit'
  ) THEN
    ALTER TABLE public.takeoff_measurements
    ADD COLUMN unit text NULL;
  END IF;
END $$;

-- Populate unit from display_unit
UPDATE public.takeoff_measurements
SET unit = COALESCE(display_unit, 'ft')
WHERE unit IS NULL;

-- Add result column (maps from raw_length/raw_area/raw_volume/raw_count)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_measurements'
    AND column_name = 'result'
  ) THEN
    ALTER TABLE public.takeoff_measurements
    ADD COLUMN result numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Populate result from appropriate raw_* field
UPDATE public.takeoff_measurements
SET result = COALESCE(
  CASE type
    WHEN 'line' THEN raw_length
    WHEN 'area' THEN raw_area
    WHEN 'volume' THEN raw_volume
    WHEN 'count' THEN raw_count
    ELSE 0
  END,
  0
)
WHERE result = 0;

-- Add meta column (jsonb for additional data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_measurements'
    AND column_name = 'meta'
  ) THEN
    ALTER TABLE public.takeoff_measurements
    ADD COLUMN meta jsonb NULL;
  END IF;
END $$;

-- ============================================
-- Step 4: Make project_id nullable in groups/measurements
-- (frontend doesn't always provide it - uses session_id instead)
-- ============================================

ALTER TABLE public.takeoff_groups
ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.takeoff_measurements
ALTER COLUMN project_id DROP NOT NULL;
