-- Add a Grade/Type field to Rate Library items (e.g. "Standard",
-- "Moisture-Resistant", "Hollow"), distinct from the existing size/spec
-- ("variant") field, so descriptions can be auto-composed from
-- name + grade + size.
ALTER TABLE cost_items
ADD COLUMN IF NOT EXISTS grade text;
