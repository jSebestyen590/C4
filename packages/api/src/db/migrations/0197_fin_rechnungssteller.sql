-- Finanzen: Rechnungssteller of Belege (editable master data, archived instead of deleted).
CREATE TABLE IF NOT EXISTS fin_rechnungssteller (
  id text PRIMARY KEY,
  name text NOT NULL,
  archiviert boolean NOT NULL DEFAULT false
)