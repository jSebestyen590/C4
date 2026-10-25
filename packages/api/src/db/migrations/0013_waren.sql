CREATE TABLE IF NOT EXISTS waren (
  id text PRIMARY KEY,
  name text NOT NULL,
  warengruppe_id text NOT NULL REFERENCES warengruppen (id),
  mhd_art text NOT NULL,
  archiviert boolean NOT NULL DEFAULT false
)
