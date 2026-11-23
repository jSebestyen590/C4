-- Durchlauf account for Auslagen paid by members until they are reimbursed (idempotent).
INSERT INTO fin_konten (id, name, art, stueckelung) VALUES
  ('auslagen', 'Auslagen Mitglieder', 'durchlauf', false)
ON CONFLICT (id) DO NOTHING