-- Removes only the starting entries written by 0100 (undated).
DELETE FROM mitglied_status_verlauf WHERE ab IS NULL;
