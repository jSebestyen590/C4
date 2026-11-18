-- Finanzen: collective reimbursement of Auslagen to a member (insert-only). mitglied_id: Cognito sub.
CREATE TABLE IF NOT EXISTS fin_erstattungen (
  id text PRIMARY KEY,
  mitglied_id text NOT NULL,
  datum date NOT NULL,
  zahlweg text NOT NULL CHECK (zahlweg IN ('bar', 'bank')),
  summe_cent bigint NOT NULL,
  buchung_id text NOT NULL REFERENCES fin_buchungen (id),
  idempotenz_schluessel text NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)