-- art: null = normal Lagerort, 'regal' / 'regalboden' for explicitly created Regale and their Böden.
-- ifco_hoehe_cm / ifco_stellflaechen: set together on an IFCO-Lagerplatz (height, footprint in 0.5 steps).
CREATE TABLE IF NOT EXISTS lagerorte (
  id text PRIMARY KEY,
  parent_id text REFERENCES lagerorte (id),
  name text NOT NULL,
  beschreibung text,
  position integer NOT NULL DEFAULT 0,
  archiviert boolean NOT NULL DEFAULT false,
  art text,
  ifco_hoehe_cm numeric(5,1),
  ifco_stellflaechen numeric(4,1)
)
