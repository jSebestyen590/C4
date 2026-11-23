-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE fin_beleg_entwuerfe SET verworfen_grund = NULL
