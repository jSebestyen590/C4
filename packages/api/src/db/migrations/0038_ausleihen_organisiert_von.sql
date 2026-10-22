-- Cognito sub of the Mitglied who organised the Ausleihe, without a foreign key (checked in the API).
ALTER TABLE ausleihen ADD COLUMN IF NOT EXISTS organisiert_von text
