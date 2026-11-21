-- Finanzen: Bestandsvorgang of the Einlagern done when booking the Beleg.
ALTER TABLE fin_belege ADD COLUMN IF NOT EXISTS bestandsvorgang_id text
