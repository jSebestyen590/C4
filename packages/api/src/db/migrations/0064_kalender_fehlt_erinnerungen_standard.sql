-- Default reminders: 1 week, 2 days and 1 day before. Idempotent: the ids are fixed.
INSERT INTO kalender_fehlt_erinnerungen (id, minuten_vorher) VALUES
  ('erinnerung-10080', 10080),
  ('erinnerung-2880', 2880),
  ('erinnerung-1440', 1440)
ON CONFLICT (id) DO NOTHING
