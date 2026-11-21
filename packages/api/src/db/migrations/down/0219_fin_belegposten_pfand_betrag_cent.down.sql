-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE fin_belegposten SET pfand_betrag_cent = NULL
