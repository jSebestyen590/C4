-- Finanzen: chart of accounts. steuersatz_standard is in basis points (1900 = 19 %).
-- No art 'buch': the Buch is a sub-ledger without journal postings.
CREATE TABLE IF NOT EXISTS fin_konten (
  id text PRIMARY KEY,
  name text NOT NULL,
  art text NOT NULL CHECK (art IN ('bargeld', 'bank', 'durchlauf', 'erloes', 'aufwand', 'neutral')),
  parent_id text REFERENCES fin_konten (id),
  stueckelung boolean NOT NULL DEFAULT false,
  steuersatz_standard integer,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now()
)
