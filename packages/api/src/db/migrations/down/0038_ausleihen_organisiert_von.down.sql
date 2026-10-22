-- Aurora DSQL does not support ALTER TABLE ... DROP COLUMN, so the column stays; this only resets
-- the values. Re-running 0038 is safe (ADD COLUMN IF NOT EXISTS).
UPDATE ausleihen SET organisiert_von = NULL
