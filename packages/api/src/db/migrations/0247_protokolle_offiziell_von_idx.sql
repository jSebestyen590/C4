-- At most one official copy per protocol.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS protokolle_offiziell_von_idx ON protokolle (offiziell_von)