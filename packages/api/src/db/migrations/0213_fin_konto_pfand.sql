-- Durchlauf account for deposit (Pfand) and returned empties (Leergut); the balance is the open Leergut (idempotent).
INSERT INTO fin_konten (id, name, art, stueckelung) VALUES
  ('pfand', 'Pfand/Leergut', 'durchlauf', false)
ON CONFLICT (id) DO NOTHING
