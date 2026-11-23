-- Finanzen: Ware of a Ware item (no foreign key, checked in the API).
ALTER TABLE fin_belegposten ADD COLUMN IF NOT EXISTS ware_id text
