-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE protokolle SET sperre_bis = NULL
