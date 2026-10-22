-- Aurora DSQL does not support ALTER TABLE ... DROP COLUMN, so the column stays; this only resets
-- the values (no position is a whole Ifco any more). Re-running 0037 is safe (ADD COLUMN IF NOT EXISTS).
UPDATE ausleihe_positionen SET ganze_ifco = NULL
