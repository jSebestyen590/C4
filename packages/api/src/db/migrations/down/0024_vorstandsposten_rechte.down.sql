-- Revokes only what 0024 granted: waren:verwalten and inventar:verwalten on the three Vorstandsposten.
DELETE FROM posten_rechte
WHERE recht IN ('waren:verwalten', 'inventar:verwalten')
  AND posten_id IN ('vorstandsvorsitz', 'stellvertretender-vorstandsvorsitz', 'buchhaltung');
