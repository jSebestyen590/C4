-- Finanzen: when the member submitted the Beleg.
ALTER TABLE fin_belege ADD COLUMN IF NOT EXISTS eingereicht_am timestamptz
