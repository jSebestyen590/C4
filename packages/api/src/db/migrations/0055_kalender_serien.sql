-- Configurable event series (weekly on weekdays / monthly on the n-th weekday). The id is a slug of the name.
CREATE TABLE IF NOT EXISTS kalender_serien (
  id text PRIMARY KEY,
  name text NOT NULL,
  vorlage_id text NOT NULL REFERENCES event_vorlagen (id),
  regel text NOT NULL,
  wochentage text NOT NULL,
  wochen text NOT NULL DEFAULT '',
  start_datum date NOT NULL,
  end_datum date,
  aktiv boolean NOT NULL DEFAULT true,
  erstellt timestamptz NOT NULL DEFAULT now()
)
