-- Which version of the Sitzung's protocol this is: 'normal' or 'offiziell' (official copy; see docs/protokolle.md).
ALTER TABLE protokolle ADD COLUMN IF NOT EXISTS fassung text