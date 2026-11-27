-- Finanzen: payout lines fetched from SumUp (insert-only). A payout is the sum of all lines of one datum; roh holds the SumUp JSON as text.
CREATE TABLE IF NOT EXISTS fin_sumup_auszahlungen (
  id text PRIMARY KEY,
  datum date NOT NULL,
  typ text NOT NULL,
  betrag_cent bigint NOT NULL,
  gebuehr_cent bigint NOT NULL DEFAULT 0,
  transaction_code text,
  referenz text,
  status text NOT NULL,
  roh text NOT NULL,
  abgerufen_am timestamptz NOT NULL DEFAULT now()
)