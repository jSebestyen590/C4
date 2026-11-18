-- Finanzen: allocation of the income of a Kassenabrechnung to events (insert-only), zaehlung_id: the Dienst-Zählung it is based on, if any.
CREATE TABLE IF NOT EXISTS fin_kassenabrechnung_events (
  abrechnung_id text NOT NULL REFERENCES fin_kassenabrechnungen (id),
  event_id text NOT NULL REFERENCES events (id),
  zaehlung_id text REFERENCES fin_kassenzaehlungen (id),
  betrag_cent bigint NOT NULL,
  PRIMARY KEY (abrechnung_id, event_id)
)