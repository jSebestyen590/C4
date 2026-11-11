-- Unique: an entry can be reversed only once.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS fin_buchungen_storno_idx ON fin_buchungen (storno_von)
