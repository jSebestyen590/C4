-- Finanzen: Cognito sub of the member who submitted the Beleg.
ALTER TABLE fin_belege ADD COLUMN IF NOT EXISTS eingereicht_von text
