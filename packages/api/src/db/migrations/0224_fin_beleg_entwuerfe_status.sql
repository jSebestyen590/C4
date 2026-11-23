-- Finanzen: draft status entwurf | eingereicht | verworfen (written by the API; null = entwurf).
ALTER TABLE fin_beleg_entwuerfe ADD COLUMN IF NOT EXISTS status text
