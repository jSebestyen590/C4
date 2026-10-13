-- Vorstandsposten with the same permissions as the admin group (see ROLE_PERMISSIONS.admin).
-- Fixed ids and ON CONFLICT DO NOTHING keep the migration idempotent and leave later edits alone.
INSERT INTO posten (id, name, bezeichnung_maennlich, bezeichnung_weiblich, bezeichnung_neutral) VALUES
  ('vorstandsvorsitz', 'Vorstandsvorsitz', 'Chef', 'Chefin', 'Chef:in'),
  ('stellvertretender-vorstandsvorsitz', 'Stellvertretender Vorstandsvorsitz', 'Vize', 'Vize', 'Vize'),
  ('buchhaltung', 'Buchhaltung', 'Finanzer', 'Finanzerin', 'Finanzer:in')
ON CONFLICT (id) DO NOTHING;

INSERT INTO posten_rechte (posten_id, recht)
SELECT p.id, r.recht
FROM (VALUES ('vorstandsvorsitz'), ('stellvertretender-vorstandsvorsitz'), ('buchhaltung')) AS p (id)
CROSS JOIN (VALUES ('users:manage'), ('posten:bearbeiten')) AS r (recht)
ON CONFLICT (posten_id, recht) DO NOTHING;
