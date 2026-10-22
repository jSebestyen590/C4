-- Aurora DSQL does not support ALTER TABLE ... DROP COLUMN, so the column stays; this only resets
-- the values. Re-running 0036 is safe (ADD COLUMN IF NOT EXISTS).
UPDATE lagerorte SET ifco_stellflaechen = NULL
