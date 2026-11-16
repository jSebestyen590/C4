-- Lease of a running mail job (until this time); NULL when none runs.
ALTER TABLE mail_abruf ADD COLUMN IF NOT EXISTS laeuft_bis timestamptz
