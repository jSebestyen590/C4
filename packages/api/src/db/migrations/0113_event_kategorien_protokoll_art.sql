-- Kind of Sitzung of a Kategorie with minutes ('sitzung' or 'mitgliederversammlung'); null = 'sitzung'.
ALTER TABLE event_kategorien ADD COLUMN IF NOT EXISTS protokoll_art text
