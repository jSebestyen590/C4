-- Finanzen: deposit per Gebinde of a Ware item (cent).
ALTER TABLE fin_belegposten ADD COLUMN IF NOT EXISTS pfand_cent bigint
