-- Unique: the same idempotency key books only once.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS fin_buchungen_idempotenz_idx ON fin_buchungen (idempotenz_schluessel)
