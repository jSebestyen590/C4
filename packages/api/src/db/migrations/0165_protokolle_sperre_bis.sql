-- Edit lock: expiry time (heartbeats push it forward).
ALTER TABLE protokolle ADD COLUMN IF NOT EXISTS sperre_bis timestamptz
