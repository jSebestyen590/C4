-- Finanzen: protocol of a cash count of a Fach (insert-only). buchung_id: the difference booking, if any.
-- gezaehlt_von is a Cognito sub without FK (like fin_buchungen.erstellt_von).
CREATE TABLE IF NOT EXISTS fin_zaehlungen (
  id text PRIMARY KEY,
  konto_id text NOT NULL REFERENCES fin_konten (id),
  datum date NOT NULL,
  text text,
  gezaehlt_von text NOT NULL,
  gezaehlt_am timestamptz NOT NULL,
  soll_cent bigint NOT NULL,
  ist_cent bigint NOT NULL,
  differenz_cent bigint NOT NULL,
  buchung_id text REFERENCES fin_buchungen (id),
  event_id text REFERENCES events (id),
  idempotenz_schluessel text NOT NULL
)