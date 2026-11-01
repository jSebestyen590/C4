-- Vorstandsposten may manage all polls (see ROLE_PERMISSIONS.admin); idempotent like 0076.
INSERT INTO posten_rechte (posten_id, recht)
SELECT p.id, 'umfragen:verwalten'
FROM (VALUES ('vorstandsvorsitz'), ('stellvertretender-vorstandsvorsitz'), ('buchhaltung')) AS p (id)
WHERE EXISTS (SELECT 1 FROM posten WHERE posten.id = p.id)
ON CONFLICT (posten_id, recht) DO NOTHING;
