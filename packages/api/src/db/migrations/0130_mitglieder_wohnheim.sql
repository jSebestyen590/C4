-- Lives in the Wohnheim and is asked when someone wants to hand over a key. Null means no.
ALTER TABLE mitglieder ADD COLUMN IF NOT EXISTS wohnheim boolean
