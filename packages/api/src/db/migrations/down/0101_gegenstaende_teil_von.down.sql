-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE gegenstaende SET teil_von = NULL
