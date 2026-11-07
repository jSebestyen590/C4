-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE event_kategorien SET protokoll = NULL
