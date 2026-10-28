-- Every day a series (see kalenderSerien.ts) has already created an event for. The row stays when the
-- event is deleted, moved or renamed, so the day is never generated again. No foreign key on purpose.
CREATE TABLE IF NOT EXISTS serien_termine (
  serie text NOT NULL,
  datum date NOT NULL,
  event_id text,
  erzeugt timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (serie, datum)
)
