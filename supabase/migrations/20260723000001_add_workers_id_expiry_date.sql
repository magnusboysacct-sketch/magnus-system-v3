-- ID card expiry date — controls access duration (permanent staff get long
-- expiries, subcontractors/daily-paid/visitors get shorter ones). Falls back
-- to hire_date + 2 years in the UI when unset, for workers added before this
-- field existed.
ALTER TABLE workers ADD COLUMN IF NOT EXISTS id_expiry_date date;
