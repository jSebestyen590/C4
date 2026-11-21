-- Warengruppe -> Kategorie (Aufwand Konto) suggested for Ware items on a Beleg; no foreign key, checked in the API.
ALTER TABLE warengruppen ADD COLUMN IF NOT EXISTS kategorie_id text
