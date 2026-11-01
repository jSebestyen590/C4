-- Scheduling polls: which event the chosen date turns into (see docs/umfragen.md), of the Kategorie
-- or, with vorlage_id, from a Vorlage. beginn/ende are Berlin wall times for all dates unless
-- je_termin; dienstform_id/minimum/wunsch form the Bedarf of the single Betrieb Schicht for Dienste
-- Kategorien. event_id/option_id are set once the event exists.
CREATE TABLE IF NOT EXISTS umfrage_termine (
  umfrage_id text PRIMARY KEY REFERENCES umfragen (id),
  kategorie_id text NOT NULL,
  vorlage_id text,
  je_termin boolean NOT NULL,
  beginn text,
  ende text,
  dienstform_id text,
  minimum integer,
  wunsch integer,
  event_id text,
  option_id text
)
