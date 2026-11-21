-- Backfill: every Artikel name on a booked, not cancelled Kategorie item; tax rate and date of its earliest item.
INSERT INTO fin_artikel (id, name, name_norm, steuersatz, erstellt_am, erstellt_von)
SELECT gen_random_uuid()::text, x.name, x.name_norm, x.steuersatz, x.erstellt_am, 'migration'
FROM (
  SELECT DISTINCT ON (lower(trim(p.text)))
    trim(p.text) AS name, lower(trim(p.text)) AS name_norm, p.steuersatz, b.erstellt_am
  FROM fin_belegposten p
  JOIN fin_belege b ON b.id = p.beleg_id
  WHERE (p.art = 'kategorie' OR p.art IS NULL)
    AND trim(p.text) <> ''
    AND NOT EXISTS (SELECT 1 FROM fin_buchungen s WHERE s.storno_von = b.buchung_id)
  ORDER BY lower(trim(p.text)), b.erstellt_am, p.pos
) x
