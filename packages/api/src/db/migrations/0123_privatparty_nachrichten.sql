-- Mails of a private party (filled by the mail job, see docs/privatpartys.md); no foreign key, checked in the API.
-- anhaenge = file names as JSON text, mitglied_sub = sender of outgoing mails (Cognito sub).
CREATE TABLE IF NOT EXISTS privatparty_nachrichten (
  id text PRIMARY KEY,
  privatparty_id text NOT NULL,
  richtung text NOT NULL CHECK (richtung IN ('ein', 'aus')),
  message_id text NOT NULL,
  in_reply_to text,
  referenzen text,
  von_adresse text,
  von_name text,
  an_adresse text,
  betreff text,
  text text NOT NULL DEFAULT '',
  anhaenge text,
  zeitpunkt timestamptz NOT NULL DEFAULT now(),
  mitglied_sub text
)
