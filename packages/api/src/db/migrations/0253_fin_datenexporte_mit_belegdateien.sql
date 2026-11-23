-- Finanzen: Datenexport can contain the Beleg files (built by an asynchronous job). Nullable: DSQL cannot add a column with NOT NULL/DEFAULT; the API always writes it and reads null as false.
ALTER TABLE fin_datenexporte ADD COLUMN IF NOT EXISTS mit_belegdateien boolean
