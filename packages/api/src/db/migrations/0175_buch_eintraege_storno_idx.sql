-- Unique: an entry is reversed at most once.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS buch_eintraege_storno_idx ON buch_eintraege (storno_von)