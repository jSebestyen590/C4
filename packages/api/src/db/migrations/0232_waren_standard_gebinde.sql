-- Standard-Gebinde of a Ware (preselected on Belege); no foreign key, the API checks it belongs to the Ware's Gebinde.
ALTER TABLE waren ADD COLUMN IF NOT EXISTS standard_gebinde_id text
