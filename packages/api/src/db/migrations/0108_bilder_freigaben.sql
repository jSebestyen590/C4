-- Cached anonymous read-only sharing links of the OneDrive photo folders (key: OneDrive item id); see docs/bilder.md.
CREATE TABLE IF NOT EXISTS bilder_freigaben (
  ordner_id text PRIMARY KEY,
  url text NOT NULL,
  erstellt timestamptz NOT NULL DEFAULT now()
)
