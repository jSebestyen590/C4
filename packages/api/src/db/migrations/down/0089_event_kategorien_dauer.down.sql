-- DSQL cannot drop columns; the column stays, its values are cleared (null = eintägig).
UPDATE event_kategorien SET dauer = NULL
