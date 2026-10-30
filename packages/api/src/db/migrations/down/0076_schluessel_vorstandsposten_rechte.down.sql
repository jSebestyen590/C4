-- Revokes only what 0076 granted: schluessel:verwalten on the three Vorstandsposten.
DELETE FROM posten_rechte
WHERE recht = 'schluessel:verwalten'
  AND posten_id IN ('vorstandsvorsitz', 'stellvertretender-vorstandsvorsitz', 'buchhaltung');
