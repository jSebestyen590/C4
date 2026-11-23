-- Finanzen: Kassenabrechnung by the Finanzer:in (insert-only). buchung_id: the booking, null when nothing changed. fehler_cent = einnahme_cent - sum of the event incomes.
CREATE TABLE IF NOT EXISTS fin_kassenabrechnungen (
  id text PRIMARY KEY,
  konto_id text NOT NULL REFERENCES fin_kassen (konto_id),
  datum date NOT NULL,
  buchung_id text REFERENCES fin_buchungen (id),
  erloes_konto_id text NOT NULL REFERENCES fin_konten (id),
  ziel_fach_id text NOT NULL REFERENCES fin_konten (id),
  soll_cent bigint NOT NULL,
  ist_cent bigint NOT NULL,
  einnahme_cent bigint NOT NULL,
  transfer_cent bigint NOT NULL,
  fehler_cent bigint NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL,
  idempotenz_schluessel text NOT NULL
)