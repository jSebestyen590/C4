-- Finanzen: Datenexport can contain the Beleg files (built by an asynchronous job).
ALTER TABLE fin_datenexporte ADD COLUMN IF NOT EXISTS mit_belegdateien boolean NOT NULL DEFAULT false
