INSERT INTO vorlage_schichten (id, vorlage_id, art, tag_versatz, beginn_zeit, ende_zeit, reihenfolge, minimum, wunsch)
VALUES ('barabend-betrieb', 'barabend', 'betrieb', 0, '20:00', '01:00', 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING
