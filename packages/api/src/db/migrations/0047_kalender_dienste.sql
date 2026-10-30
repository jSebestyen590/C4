-- dienstform_id is null for Dienste in Aufbau/Putzen Schichten (the API enforces this by art).
-- Exactly one of mitglied_sub / extern_id is set (CHECK). One Dienst per person and Schicht is
-- guaranteed by the unique indexes of the following migrations (and checked by the API first).
CREATE TABLE IF NOT EXISTS dienste (
  id text PRIMARY KEY,
  schicht_id text NOT NULL REFERENCES schichten (id),
  dienstform_id text REFERENCES dienstformen (id),
  mitglied_sub text REFERENCES mitglieder (sub),
  extern_id text REFERENCES externe (id),
  kommentar text,
  eingetragen_von text NOT NULL REFERENCES mitglieder (sub),
  eingetragen_am timestamptz NOT NULL DEFAULT now(),
  CHECK ((mitglied_sub IS NOT NULL AND extern_id IS NULL) OR (mitglied_sub IS NULL AND extern_id IS NOT NULL))
)
