-- State of the mail job: a single row with id 'partymail' (IMAP uidvalidity, last fetched UID, last run, last error).
CREATE TABLE IF NOT EXISTS mail_abruf (
  id text PRIMARY KEY,
  uid_validity text,
  letzte_uid bigint NOT NULL DEFAULT 0,
  letzter_abruf timestamptz,
  fehler text
)
