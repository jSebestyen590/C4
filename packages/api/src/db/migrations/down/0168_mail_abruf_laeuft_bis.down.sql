-- DSQL cannot drop columns; the column stays, its values are cleared.
UPDATE mail_abruf SET laeuft_bis = NULL
