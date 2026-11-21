-- Lager-Beleg-Abgleich: corrections of the difference per Ware (insert-only). `menge` is signed, in base units.
-- ware_id and erstellt_von (Cognito sub) are soft references without FK; the API checks them.
CREATE TABLE IF NOT EXISTS waren_abgleich_korrekturen (
  id text PRIMARY KEY,
  ware_id text NOT NULL,
  menge integer NOT NULL,
  grund text NOT NULL,
  text text,
  datum date NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL
)
