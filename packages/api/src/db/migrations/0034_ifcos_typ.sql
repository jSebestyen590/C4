-- Plain text without a foreign key: the reference to ifco_typen is enforced in the API.
ALTER TABLE ifcos ADD COLUMN IF NOT EXISTS typ_id text
