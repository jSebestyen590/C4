-- Unique: the same idempotency key counts only once.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS fin_zaehlungen_idempotenz_idx ON fin_zaehlungen (idempotenz_schluessel)