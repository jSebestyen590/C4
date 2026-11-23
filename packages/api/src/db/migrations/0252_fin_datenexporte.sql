-- Finanzen: data exports for the tax office (ZIP in the archive bucket); insert-only.
CREATE TABLE IF NOT EXISTS fin_datenexporte (
  id text PRIMARY KEY,
  von date NOT NULL,
  bis date NOT NULL,
  schluessel text NOT NULL,
  sha256 text NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)