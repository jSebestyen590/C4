-- Idempotency key per booking (added after 0144 was already applied).
ALTER TABLE fin_buchungen ADD COLUMN IF NOT EXISTS idempotenz_schluessel text
