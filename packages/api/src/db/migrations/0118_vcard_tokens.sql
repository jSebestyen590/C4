-- Short-lived secret per member for the contact card (vCard) links; only the sha256 hash is stored.
CREATE TABLE IF NOT EXISTS vcard_tokens (
  mitglied_sub text PRIMARY KEY REFERENCES mitglieder (sub),
  token_hash text NOT NULL,
  ablauf timestamptz NOT NULL,
  erstellt timestamptz NOT NULL DEFAULT now()
)
