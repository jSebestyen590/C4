-- Revokes only what 0031 granted: inventar:verwalten on the three Vorstandsposten.
DELETE FROM posten_rechte
WHERE recht = 'inventar:verwalten'
  AND posten_id IN ('vorstandsvorsitz', 'stellvertretender-vorstandsvorsitz', 'buchhaltung');
