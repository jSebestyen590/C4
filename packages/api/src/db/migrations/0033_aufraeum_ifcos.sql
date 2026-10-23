-- An IFCO marked as done (sorted and stored correctly) in an Aufräumaktion; unmarking deletes the row.
CREATE TABLE IF NOT EXISTS aufraeum_ifcos (
  id text PRIMARY KEY,
  aktion_id text NOT NULL REFERENCES aufraeumaktionen (id),
  ifco_id text NOT NULL REFERENCES ifcos (id),
  fertig_am timestamptz NOT NULL DEFAULT now(),
  fertig_von text NOT NULL
)
