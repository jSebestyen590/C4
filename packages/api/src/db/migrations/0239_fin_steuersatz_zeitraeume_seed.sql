-- Seed: Germany since 2007 (19/7 %), the Covid reduction from 2020-07-01 (16/5 %), back to 19/7 % from 2021-01-01. Only into an empty table (idempotent).
INSERT INTO fin_steuersatz_zeitraeume (id, ab, regel, ermaessigt, erstellt_am, erstellt_von)
SELECT v.id, v.ab::date, v.regel, v.ermaessigt, now(), 'migration'
FROM (VALUES
  ('steuersatz-2007-01-01', '2007-01-01', 1900, 700),
  ('steuersatz-2020-07-01', '2020-07-01', 1600, 500),
  ('steuersatz-2021-01-01', '2021-01-01', 1900, 700)
) AS v (id, ab, regel, ermaessigt)
WHERE NOT EXISTS (SELECT 1 FROM fin_steuersatz_zeitraeume)