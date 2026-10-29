-- Aurora DSQL may not support DROP COLUMN; then this down step has to be done by hand.
ALTER TABLE events DROP COLUMN IF EXISTS serie_angepasst
