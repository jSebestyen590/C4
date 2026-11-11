-- Finanzen: counter rows. 'journal' holds the last seq and the hash of the last entry.
CREATE TABLE IF NOT EXISTS fin_zaehler (
  name text PRIMARY KEY,
  wert bigint NOT NULL,
  letzter_hash text NOT NULL
)
