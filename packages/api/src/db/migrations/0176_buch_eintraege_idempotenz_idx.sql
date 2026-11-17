-- Unique: the same idempotency key (of a reversal) counts only once.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS buch_eintraege_idempotenz_idx ON buch_eintraege (idempotenz_schluessel)