-- Backfill: existing pages get their 'angelegt' row (and 'archiviert' when archived). Deterministic ids keep it repeatable.
INSERT INTO buch_seiten_verlauf (id, seite_id, art, nummer, erstellt_von, erstellt_am)
SELECT id || ':angelegt', id, 'angelegt', nummer, angelegt_von, angelegt_am FROM buch_seiten
UNION ALL
SELECT id || ':archiviert', id, 'archiviert', NULL, angelegt_von, archiviert_am FROM buch_seiten WHERE archiviert_am IS NOT NULL
ON CONFLICT (id) DO NOTHING