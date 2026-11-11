-- Genesis row of the journal: seq 0, prev_hash of the first entry is 64 zeros.
INSERT INTO fin_zaehler (name, wert, letzter_hash)
VALUES ('journal', 0, '0000000000000000000000000000000000000000000000000000000000000000')
ON CONFLICT (name) DO NOTHING
