-- Buch: one Abrechnung of all pages (insert-only).
CREATE TABLE IF NOT EXISTS buch_abrechnungen (
  id text PRIMARY KEY,
  idempotenz_schluessel text NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)