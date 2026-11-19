-- Finanzen: booked Beleg (insert-only). nummer B-YYYY-NNNN, gapless per year. mitglied_id: Cognito sub of the member who paid (Auslage only).
CREATE TABLE IF NOT EXISTS fin_belege (
  id text PRIMARY KEY,
  nummer text NOT NULL,
  rechnungssteller_id text NOT NULL REFERENCES fin_rechnungssteller (id),
  belegdatum date NOT NULL,
  modus text NOT NULL CHECK (modus IN ('brutto', 'netto')),
  zahlweg text NOT NULL CHECK (zahlweg IN ('bar', 'bank', 'auslage')),
  bezahldatum date,
  mitglied_id text,
  eigenbeleg_begruendung text,
  datei_sha256 text,
  datei_schluessel text,
  datei_typ text,
  datei_name text,
  summe_cent bigint NOT NULL,
  buchung_id text NOT NULL REFERENCES fin_buchungen (id),
  idempotenz_schluessel text NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)