-- Finanzen: Neutral account for Umsatzsteuer payments to / refunds from the Finanzamt (idempotent). The G+V is net, so this is no expense; only the EÜR counts its movements.
INSERT INTO fin_konten (id, name, art, stueckelung) VALUES
  ('ust-finanzamt', 'Umsatzsteuer Finanzamt', 'neutral', false)
ON CONFLICT (id) DO NOTHING