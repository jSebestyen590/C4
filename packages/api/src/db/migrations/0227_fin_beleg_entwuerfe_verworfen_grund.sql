-- Finanzen: reason a submission was rejected.
ALTER TABLE fin_beleg_entwuerfe ADD COLUMN IF NOT EXISTS verworfen_grund text
