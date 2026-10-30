-- Also serves lookups by schicht_id. NULLs are distinct, so this only constrains member entries.
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS dienste_schicht_mitglied_idx ON dienste (schicht_id, mitglied_sub)
