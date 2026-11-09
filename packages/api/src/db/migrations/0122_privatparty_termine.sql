-- Wish dates of a private party; beginn/ende are Berlin wall times HH:MM (ende < beginn = next day). no foreign key, checked in the API
CREATE TABLE IF NOT EXISTS privatparty_termine (
  id text PRIMARY KEY,
  privatparty_id text NOT NULL,
  datum date NOT NULL,
  beginn text NOT NULL,
  ende text NOT NULL,
  stufe text NOT NULL CHECK (stufe IN ('bevorzugt', 'moeglich', 'notfalls')),
  position integer NOT NULL DEFAULT 0
)
