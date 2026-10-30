-- Null means the birthday is shown (default).
ALTER TABLE mitglieder ADD COLUMN IF NOT EXISTS geburtstag_im_kalender boolean
