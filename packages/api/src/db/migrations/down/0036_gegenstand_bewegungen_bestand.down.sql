-- Removes only the starting entries written by 0036.
DELETE FROM gegenstand_bewegungen WHERE grund = 'bestand' AND erstellt_von = 'migration';
