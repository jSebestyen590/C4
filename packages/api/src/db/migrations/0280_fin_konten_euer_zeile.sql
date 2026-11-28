-- Finanzen: EÜR line of a Konto (value of EUER_ZEILEN in @c4/shared; null = none). No check constraint (DSQL); validated in the API.
ALTER TABLE fin_konten ADD COLUMN IF NOT EXISTS euer_zeile text