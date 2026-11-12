-- DSQL cannot DROP COLUMN; clear the values instead.
UPDATE fin_buchungen SET idempotenz_schluessel = NULL
