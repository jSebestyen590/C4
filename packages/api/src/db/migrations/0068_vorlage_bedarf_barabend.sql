INSERT INTO vorlage_bedarfe (vorlage_schicht_id, dienstform_id, minimum, wunsch)
VALUES ('barabend-betrieb', 'bar', 1, 2)
ON CONFLICT (vorlage_schicht_id, dienstform_id) DO NOTHING
