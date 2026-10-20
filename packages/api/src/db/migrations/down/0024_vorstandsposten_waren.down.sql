-- Revokes only what 0024 granted: waren:verwalten on the three Vorstandsposten.
DELETE FROM posten_rechte
WHERE recht = 'waren:verwalten'
  AND posten_id IN ('vorstandsvorsitz', 'stellvertretender-vorstandsvorsitz', 'buchhaltung');
