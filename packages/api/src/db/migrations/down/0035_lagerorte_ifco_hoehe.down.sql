-- Aurora DSQL does not support ALTER TABLE ... DROP COLUMN, so the column stays; this only resets
-- the values (every place is a normal Lagerort again). Re-running 0035 is safe (ADD COLUMN IF NOT EXISTS).
UPDATE lagerorte SET ifco_hoehe_cm = NULL
