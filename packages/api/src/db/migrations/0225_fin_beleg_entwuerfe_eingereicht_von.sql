-- Finanzen: Cognito sub of the member who submitted the draft.
ALTER TABLE fin_beleg_entwuerfe ADD COLUMN IF NOT EXISTS eingereicht_von text
