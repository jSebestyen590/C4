-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE fin_belege SET bestandsvorgang_id = NULL
