-- Buch: entries of a page (insert-only). betrag_cent = abzahlung - striche * strichwert - bar (effect on the balance); a Storno negates striche, bar, abzahlung and betrag.
CREATE TABLE IF NOT EXISTS buch_eintraege (
  id text PRIMARY KEY,
  seite_id text NOT NULL REFERENCES buch_seiten (id),
  abrechnung_id text REFERENCES buch_abrechnungen (id),
  storno_von text,
  striche integer NOT NULL,
  strichwert_cent integer NOT NULL,
  bar_cent bigint NOT NULL,
  abzahlung_cent bigint NOT NULL,
  betrag_cent bigint NOT NULL,
  text text,
  idempotenz_schluessel text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)