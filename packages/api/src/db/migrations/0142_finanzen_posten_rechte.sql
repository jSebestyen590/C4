-- Finanzen rights of the Posten: Buchhaltung reads, books and manages; the Vorstand reads;
-- the Kassenprüfung reads and checks the hash chain. Idempotent like 0076.
INSERT INTO posten_rechte (posten_id, recht)
SELECT v.posten_id, v.recht
FROM (VALUES
  ('buchhaltung', 'finanzen:lesen'),
  ('buchhaltung', 'finanzen:buchen'),
  ('buchhaltung', 'finanzen:verwalten'),
  ('vorstandsvorsitz', 'finanzen:lesen'),
  ('stellvertretender-vorstandsvorsitz', 'finanzen:lesen'),
  ('kassenpruefung', 'finanzen:lesen'),
  ('kassenpruefung', 'finanzen:pruefen')
) AS v (posten_id, recht)
WHERE EXISTS (SELECT 1 FROM posten WHERE posten.id = v.posten_id)
ON CONFLICT (posten_id, recht) DO NOTHING
