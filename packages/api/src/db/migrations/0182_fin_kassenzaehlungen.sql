-- Finanzen: Dienst-Zählung of a Kasse at an event (insert-only, not binding, no booking). The newest per (event, Kasse) counts.
CREATE TABLE IF NOT EXISTS fin_kassenzaehlungen (
  id text PRIMARY KEY,
  konto_id text NOT NULL REFERENCES fin_kassen (konto_id),
  event_id text NOT NULL REFERENCES events (id),
  summe_cent bigint NOT NULL,
  gezaehlt_von text NOT NULL,
  gezaehlt_am timestamptz NOT NULL,
  idempotenz_schluessel text NOT NULL
)