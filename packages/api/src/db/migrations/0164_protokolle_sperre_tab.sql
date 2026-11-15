-- Edit lock: random id of the browser tab that holds it.
ALTER TABLE protokolle ADD COLUMN IF NOT EXISTS sperre_tab text
