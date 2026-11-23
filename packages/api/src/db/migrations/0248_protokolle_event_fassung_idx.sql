-- One normal and at most one official protocol per Sitzung (replaces protokolle_event_idx).
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS protokolle_event_fassung_idx ON protokolle (event_id, fassung)