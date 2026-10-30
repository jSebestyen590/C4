-- Secret per member for the ICS subscription feed; only the sha256 hash of the token is stored.
CREATE TABLE IF NOT EXISTS kalender_tokens (
  mitglied_sub text PRIMARY KEY REFERENCES mitglieder (sub),
  token_hash text NOT NULL,
  erstellt timestamptz NOT NULL DEFAULT now()
)
