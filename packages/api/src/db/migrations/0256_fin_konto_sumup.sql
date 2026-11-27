-- Durchlauf account for card payments via SumUp until the payout is matched (idempotent).
INSERT INTO fin_konten (id, name, art, stueckelung) VALUES
  ('sumup', 'SumUp-Guthaben', 'durchlauf', false)
ON CONFLICT (id) DO NOTHING