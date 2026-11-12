-- Posten Kassenprüfung (holds finanzen:lesen and finanzen:pruefen, see 0142); fixed id keeps it idempotent.
INSERT INTO posten (id, name, bezeichnung_maennlich, bezeichnung_weiblich, bezeichnung_neutral) VALUES
  ('kassenpruefung', 'Kassenprüfung', 'Kassenprüfer', 'Kassenprüferin', 'Kassenprüfer:in')
ON CONFLICT (id) DO NOTHING
