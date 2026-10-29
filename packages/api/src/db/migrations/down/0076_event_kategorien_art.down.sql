-- Aurora DSQL may not support DROP COLUMN; then this down step has to be done by hand.
ALTER TABLE event_kategorien DROP COLUMN IF EXISTS art
