-- Revokes only what 0142 granted.
DELETE FROM posten_rechte
WHERE recht IN ('finanzen:lesen', 'finanzen:buchen', 'finanzen:verwalten', 'finanzen:pruefen')
  AND posten_id IN ('buchhaltung', 'vorstandsvorsitz', 'stellvertretender-vorstandsvorsitz', 'kassenpruefung')
