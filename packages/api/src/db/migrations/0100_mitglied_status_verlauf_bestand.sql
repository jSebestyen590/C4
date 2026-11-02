-- Starts the history of existing members with their current status (start date unknown).
INSERT INTO mitglied_status_verlauf (id, mitglied_sub, status, ab)
SELECT gen_random_uuid()::text, m.sub, m.status, NULL
FROM mitglieder m
WHERE NOT EXISTS (SELECT 1 FROM mitglied_status_verlauf v WHERE v.mitglied_sub = m.sub);
