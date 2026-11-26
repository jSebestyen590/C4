-- Finanzen: club data printed on Rechnungen (insert-only, the newest row applies).
CREATE TABLE IF NOT EXISTS fin_rechnung_einstellungen (
  id text PRIMARY KEY,
  vereinsname text NOT NULL,
  anschrift text NOT NULL,
  steuernummer text NOT NULL,
  ust_id text,
  bank_name text NOT NULL,
  iban text NOT NULL,
  bic text NOT NULL,
  vorstand text NOT NULL,
  register text,
  kontakt text,
  zahlungsziel_tage integer NOT NULL,
  fusstext text,
  erloes_konto_waren text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)