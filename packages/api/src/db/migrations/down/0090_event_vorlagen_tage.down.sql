-- DSQL cannot drop columns; the column stays, its values are cleared (null = 1 Tag).
UPDATE event_vorlagen SET tage = NULL
