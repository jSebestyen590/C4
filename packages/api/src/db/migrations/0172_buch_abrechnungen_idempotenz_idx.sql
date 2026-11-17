-- Unique: the same idempotency key counts only once.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS buch_abrechnungen_idempotenz_idx ON buch_abrechnungen (idempotenz_schluessel)