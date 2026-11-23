-- Finanzen: when the draft was submitted.
ALTER TABLE fin_beleg_entwuerfe ADD COLUMN IF NOT EXISTS eingereicht_am timestamptz
