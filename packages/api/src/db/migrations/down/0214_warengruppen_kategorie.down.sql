-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE warengruppen SET kategorie_id = NULL
