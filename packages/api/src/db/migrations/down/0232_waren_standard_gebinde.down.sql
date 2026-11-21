-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE waren SET standard_gebinde_id = NULL
