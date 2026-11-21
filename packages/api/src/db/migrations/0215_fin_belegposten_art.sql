-- Finanzen: item kind of a Beleg item (kategorie | ware | leergut), written by the API; DSQL cannot add NOT NULL/DEFAULT columns, so null means kategorie.
ALTER TABLE fin_belegposten ADD COLUMN IF NOT EXISTS art text
