INSERT INTO event_vorlagen (id, titel, beschreibung, kategorie_id, beginn_zeit, ende_zeit, archiviert)
VALUES ('barabend', 'Barabend', NULL, 'barabend', '20:00', '01:00', false)
ON CONFLICT (id) DO NOTHING
