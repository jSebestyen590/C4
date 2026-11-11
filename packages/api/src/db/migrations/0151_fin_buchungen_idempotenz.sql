-- Idempotency key per booking (added after 0140 was already applied).
ALTER TABLE fin_buchungen ADD COLUMN IF NOT EXISTS idempotenz_schluessel text
