-- Finanzen: Artikel of Kategorie items (e.g. "Deko") with their default tax rate in basis points; created when a Beleg is booked. name_norm = lower(trim(name)), unique (index in the next migration).
CREATE TABLE IF NOT EXISTS fin_artikel (
  id text PRIMARY KEY,
  name text NOT NULL,
  name_norm text NOT NULL,
  steuersatz integer NOT NULL,
  erstellt_am timestamptz NOT NULL,
  erstellt_von text NOT NULL
)
