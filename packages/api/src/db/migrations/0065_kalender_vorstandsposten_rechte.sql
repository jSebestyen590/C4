-- Vorstandsposten may manage events and set up the calendar (see ROLE_PERMISSIONS.admin); idempotent like 0024.
INSERT INTO posten_rechte (posten_id, recht)
SELECT p.id, r.recht
FROM (VALUES ('vorstandsvorsitz'), ('stellvertretender-vorstandsvorsitz'), ('buchhaltung')) AS p (id)
CROSS JOIN (VALUES ('events:verwalten'), ('kalender:einrichten')) AS r (recht)
WHERE EXISTS (SELECT 1 FROM posten WHERE posten.id = p.id)
ON CONFLICT (posten_id, recht) DO NOTHING;
