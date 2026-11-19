-- Finanzen: daily export of the journal to the archive bucket (insert-only).
CREATE TABLE IF NOT EXISTS fin_exporte (
  id text PRIMARY KEY,
  datum date NOT NULL,
  von_seq bigint NOT NULL,
  bis_seq bigint NOT NULL,
  kopf_hash text NOT NULL,
  schluessel text NOT NULL,
  erstellt_am timestamptz NOT NULL
)