-- Finanzen: which booking took over a SumUp transaction (insert-only). A reversed booking makes the transaction open again.
CREATE TABLE IF NOT EXISTS fin_sumup_zuordnungen (
  id text PRIMARY KEY,
  transaktion_id text NOT NULL REFERENCES fin_sumup_transaktionen (id),
  buchung_id text NOT NULL REFERENCES fin_buchungen (id),
  erstellt_am timestamptz NOT NULL
)