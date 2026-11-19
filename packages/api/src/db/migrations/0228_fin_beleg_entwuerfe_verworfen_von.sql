-- Finanzen: Cognito sub of the Finanzer:in who rejected the submission.
ALTER TABLE fin_beleg_entwuerfe ADD COLUMN IF NOT EXISTS verworfen_von text
