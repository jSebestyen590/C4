-- Durchlauf account for the revenue of open Rechnungen, moved to the Erlöskonten on payment (idempotent).
INSERT INTO fin_konten (id, name, art, stueckelung) VALUES
  ('erloese_offen', 'Erlöse aus offenen Rechnungen', 'durchlauf', false)
ON CONFLICT (id) DO NOTHING