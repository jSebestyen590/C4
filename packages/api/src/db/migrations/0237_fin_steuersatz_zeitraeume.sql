-- Finanzen: tax rate periods. A period is valid from `ab` until the next period's `ab`; `regel` and `ermaessigt` in basis points (1900 = 19 %). Unique index on `ab` in the next migration.
CREATE TABLE IF NOT EXISTS fin_steuersatz_zeitraeume (
  id text PRIMARY KEY,
  ab date NOT NULL,
  regel integer NOT NULL,
  ermaessigt integer NOT NULL,
  erstellt_am timestamptz NOT NULL,
  erstellt_von text NOT NULL
)