-- Add 'perimeter' as an allowed measurement type (Perimeter tool stored it disguised as 'wall' until now)
BEGIN;

ALTER TABLE public.takeoff_measurements
  DROP CONSTRAINT IF EXISTS takeoff_measurements_type_check;

ALTER TABLE public.takeoff_measurements
  ADD CONSTRAINT takeoff_measurements_type_check
  CHECK (type IN ('line','area','volume','count','wall','perimeter'));

COMMIT;
