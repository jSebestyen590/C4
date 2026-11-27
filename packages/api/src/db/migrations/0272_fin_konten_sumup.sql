-- Finanzen: Konten for SumUp card revenue (19 % Regelsatz) and SumUp fees (idempotent). The SumUp-Guthaben account is 'sumup' (0256).
INSERT INTO fin_konten (id, name, art, stueckelung, steuersatz_art) VALUES
  ('kartenerloese', 'Kartenerlöse', 'erloes', false, 'regel'),
  ('sumup-gebuehren', 'SumUp-Gebühren', 'aufwand', false, NULL)
ON CONFLICT (id) DO NOTHING