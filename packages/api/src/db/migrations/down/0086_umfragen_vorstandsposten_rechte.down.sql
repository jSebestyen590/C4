-- Revokes only what 0086 granted: umfragen:verwalten on the three Vorstandsposten.
DELETE FROM posten_rechte
WHERE recht = 'umfragen:verwalten'
  AND posten_id IN ('vorstandsvorsitz', 'stellvertretender-vorstandsvorsitz', 'buchhaltung');
