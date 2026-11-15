-- Edit lock of a protocol draft: Cognito sub of the editor (see docs/protokolle.md, Bearbeitungssperre).
ALTER TABLE protokolle ADD COLUMN IF NOT EXISTS sperre_sub text
