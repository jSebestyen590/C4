-- Master data of the Ifco kinds: footprint (gross = 60x40, klein = 40x30) and height in cm.
CREATE TABLE IF NOT EXISTS ifco_typen (
  id text PRIMARY KEY,
  name text NOT NULL,
  grundflaeche text NOT NULL,
  hoehe_cm numeric(5,1) NOT NULL,
  archiviert boolean NOT NULL DEFAULT false
)
