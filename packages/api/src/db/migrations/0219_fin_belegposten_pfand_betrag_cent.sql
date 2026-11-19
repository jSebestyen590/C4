-- Finanzen: deposit amount of a Ware item (cent).
ALTER TABLE fin_belegposten ADD COLUMN IF NOT EXISTS pfand_betrag_cent bigint
