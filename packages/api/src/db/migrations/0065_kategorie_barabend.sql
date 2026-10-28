INSERT INTO event_kategorien (id, name, farbe, archiviert) VALUES ('barabend', 'Barabend', 'blue', false)
ON CONFLICT (id) DO NOTHING
