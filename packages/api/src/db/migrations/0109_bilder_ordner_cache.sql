-- Last snapshot of the OneDrive photo folder list (one row 'liste', daten = JSON text) so the Bilder page can show it at once; see docs/bilder.md.
CREATE TABLE IF NOT EXISTS bilder_ordner_cache (
  id text PRIMARY KEY,
  daten text NOT NULL,
  stand timestamptz NOT NULL
)
