-- Finanzen: card transactions fetched from SumUp (insert-only). betrag_cent is negative for REFUND/CHARGE_BACK; roh holds the SumUp JSON as text.
CREATE TABLE IF NOT EXISTS fin_sumup_transaktionen (
  id text PRIMARY KEY,
  transaction_code text NOT NULL,
  zeitpunkt timestamptz NOT NULL,
  betrag_cent bigint NOT NULL,
  typ text NOT NULL,
  status text NOT NULL,
  trinkgeld_cent bigint NOT NULL DEFAULT 0,
  sumup_benutzer text,
  roh text NOT NULL,
  abgerufen_am timestamptz NOT NULL DEFAULT now()
)