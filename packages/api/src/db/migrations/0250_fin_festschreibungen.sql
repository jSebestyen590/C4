-- Finanzen: closed months (Festschreibung, GoBD); insert-only, never revoked.
CREATE TABLE IF NOT EXISTS fin_festschreibungen (
  id text PRIMARY KEY,
  monat date NOT NULL,
  bis_seq bigint NOT NULL,
  kopf_hash text NOT NULL,
  anzahl integer NOT NULL,
  export_schluessel text NOT NULL,
  festgeschrieben_von text NOT NULL,
  festgeschrieben_am timestamptz NOT NULL
)