-- Add measurements storage to BOQ line items so the L/W/H measurement modal
-- can persist its rows (description, qty, ft+in dimensions, deduction flag)
-- across page reloads instead of only living in client state.
ALTER TABLE boq_section_items
ADD COLUMN IF NOT EXISTS measurements jsonb DEFAULT '[]'::jsonb;
