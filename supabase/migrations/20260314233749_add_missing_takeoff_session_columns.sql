/*
  # Add Missing Takeoff Session Columns

  1. Schema Changes
    - Add `name` column to takeoff_sessions (text, nullable)
    - Add `pdf_bucket` column to takeoff_sessions (text, nullable)
    - Add `pdf_path` column to takeoff_sessions (text, nullable)
    - Add `pdf_url` column to takeoff_sessions (text, nullable)

  2. Notes
    - These columns are used by TakeoffPage.tsx autosave functionality
    - The migration uses IF NOT EXISTS to be idempotent
    - Existing `pdf_storage_path` remains for backward compatibility
*/

-- Add name column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'name'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN name text NULL;
  END IF;
END $$;

-- Add pdf_bucket column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'pdf_bucket'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN pdf_bucket text NULL;
  END IF;
END $$;

-- Add pdf_path column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'pdf_path'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN pdf_path text NULL;
  END IF;
END $$;

-- Add pdf_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'takeoff_sessions'
    AND column_name = 'pdf_url'
  ) THEN
    ALTER TABLE public.takeoff_sessions
    ADD COLUMN pdf_url text NULL;
  END IF;
END $$;
