-- Finanzen: amount the member stated when submitting (cent).
ALTER TABLE fin_belege ADD COLUMN IF NOT EXISTS eingereicht_betrag_cent bigint
