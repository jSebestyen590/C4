-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE event_vorlagen SET bilder_ordner = NULL
