-- Durchlauf account for open claims from Rechnungen (Ist-Versteuerung: no revenue until paid; idempotent).
INSERT INTO fin_konten (id, name, art, stueckelung) VALUES
  ('forderungen', 'Forderungen aus Rechnungen', 'durchlauf', false)
ON CONFLICT (id) DO NOTHING