-- Finanzen: when the submission was rejected.
ALTER TABLE fin_beleg_entwuerfe ADD COLUMN IF NOT EXISTS verworfen_am timestamptz
