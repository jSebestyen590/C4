-- Finanzen: account for the differences of a Zählung (fixed id, idempotent, later edits stay).
INSERT INTO fin_konten (id, name, art, stueckelung) VALUES
  ('kassendifferenz', 'Kassendifferenz', 'neutral', false)
ON CONFLICT (id) DO NOTHING