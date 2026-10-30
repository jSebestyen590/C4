-- History of key handovers; the API keeps only the newest ones per key (SCHLUESSEL_VERLAUF_MAX).
-- eingetragen_von is the Cognito sub of the member who recorded it, without a foreign key.
CREATE TABLE IF NOT EXISTS schluessel_uebergaben (
  id text PRIMARY KEY,
  schluessel_id text NOT NULL REFERENCES schluessel (id),
  von_sub text REFERENCES mitglieder (sub),
  von_name text,
  an_sub text REFERENCES mitglieder (sub),
  an_name text,
  eingetragen_von text NOT NULL,
  zeitpunkt timestamptz NOT NULL DEFAULT now(),
  CHECK (von_sub IS NULL OR von_name IS NULL),
  CHECK (an_sub IS NULL OR an_name IS NULL)
)
