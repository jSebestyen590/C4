-- Revokes only what 0054 granted: events:verwalten and kalender:einrichten on the three Vorstandsposten.
DELETE FROM posten_rechte
WHERE recht IN ('events:verwalten', 'kalender:einrichten')
  AND posten_id IN ('vorstandsvorsitz', 'stellvertretender-vorstandsvorsitz', 'buchhaltung');
