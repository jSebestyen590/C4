-- Starts the history of existing Gegenstände with their current amount ("Bestand übernommen").
INSERT INTO gegenstand_bewegungen (id, gegenstand_id, art, grund, anzahl, datum, erstellt_von)
SELECT gen_random_uuid()::text, g.id, 'zugang', 'bestand', g.anzahl, current_date, 'migration'
FROM gegenstaende g
WHERE g.anzahl > 0
  AND NOT EXISTS (SELECT 1 FROM gegenstand_bewegungen b WHERE b.gegenstand_id = g.id);
