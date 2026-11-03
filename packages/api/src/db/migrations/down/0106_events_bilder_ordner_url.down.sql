-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE events SET bilder_ordner_url = NULL
