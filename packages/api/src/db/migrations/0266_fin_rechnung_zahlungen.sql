-- Finanzen: payments of Rechnungen (insert-only). A reversed booking frees the Rechnung again.
CREATE TABLE IF NOT EXISTS fin_rechnung_zahlungen (
  id text PRIMARY KEY,
  rechnung_id text NOT NULL REFERENCES fin_rechnungen (id),
  zahlweg text NOT NULL CHECK (zahlweg IN ('bank', 'bar', 'sumup')),
  datum date NOT NULL,
  konto_id text NOT NULL REFERENCES fin_konten (id),
  buchung_id text NOT NULL REFERENCES fin_buchungen (id),
  idempotenz_schluessel text NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)