-- Base accounts with fixed ids (idempotent, later edits stay).
INSERT INTO fin_konten (id, name, art, stueckelung) VALUES
  ('safe', 'Safe', 'bargeld', true),
  ('bank', 'Bank (Fyrst)', 'bank', false),
  ('geldtransit', 'Geldtransit', 'durchlauf', false),
  ('eroeffnung', 'Eröffnung / Saldovortrag', 'neutral', false)
ON CONFLICT (id) DO NOTHING
