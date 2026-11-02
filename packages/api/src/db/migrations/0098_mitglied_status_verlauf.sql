-- History of the membership status; ab is the first day of the status, null = start unknown.
-- mitglieder.status mirrors the newest entry.
CREATE TABLE IF NOT EXISTS mitglied_status_verlauf (
  id text PRIMARY KEY,
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  status text NOT NULL,
  ab date,
  erstellt_am timestamptz NOT NULL DEFAULT now()
)
