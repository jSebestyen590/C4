-- Finanzen: lines of a journal entry (betrag_cent signed, sum per entry is 0).
CREATE TABLE IF NOT EXISTS fin_buchungszeilen (
  id text PRIMARY KEY,
  buchung_id text NOT NULL REFERENCES fin_buchungen (id),
  pos integer NOT NULL,
  konto_id text NOT NULL REFERENCES fin_konten (id),
  betrag_cent bigint NOT NULL,
  netto_cent bigint,
  steuer_cent bigint,
  steuersatz integer,
  steuer_art text NOT NULL DEFAULT 'keine' CHECK (steuer_art IN ('ust', 'vorsteuer', 'keine'))
)
