-- Standard Dienstform "Bar" with a fixed id, so the Barabend Vorlage can rely on it. Idempotent.
INSERT INTO dienstformen (id, name, reihenfolge, archiviert) VALUES ('bar', 'Bar', 0, false)
ON CONFLICT (id) DO NOTHING
