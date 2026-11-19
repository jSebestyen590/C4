-- Finanzen: the Belege of an Erstattung (insert-only). A Beleg may appear again after the Erstattung was reversed; the API checks that.
CREATE TABLE IF NOT EXISTS fin_erstattung_belege (
  erstattung_id text NOT NULL REFERENCES fin_erstattungen (id),
  beleg_id text NOT NULL REFERENCES fin_belege (id),
  PRIMARY KEY (erstattung_id, beleg_id)
)