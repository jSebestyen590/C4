-- Aurora DSQL does not support ALTER TABLE ... DROP COLUMN, so the column stays; this only resets
-- the values (every node is a normal Lagerort again). Re-running 0032 is safe (ADD COLUMN IF NOT EXISTS).
UPDATE lagerorte SET art = NULL;
