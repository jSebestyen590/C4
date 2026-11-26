-- Finanzen: the PDF of a Rechnung in the archive bucket (insert-only, one file per Rechnung).
CREATE TABLE IF NOT EXISTS fin_rechnung_dateien (
  rechnung_id text PRIMARY KEY REFERENCES fin_rechnungen (id),
  sha256 text NOT NULL,
  groesse bigint NOT NULL,
  erstellt_am timestamptz NOT NULL
)