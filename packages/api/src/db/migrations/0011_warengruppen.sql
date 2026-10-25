CREATE TABLE IF NOT EXISTS warengruppen (
  id text PRIMARY KEY,
  parent_id text REFERENCES warengruppen (id),
  name text NOT NULL,
  archiviert boolean NOT NULL DEFAULT false
)
