-- Aurora DSQL does not support ALTER TABLE ... DROP COLUMN, so the column stays; this only resets
-- the values (no Ifco has a type any more). Re-running 0034 is safe (ADD COLUMN IF NOT EXISTS).
UPDATE ifcos SET typ_id = NULL
