-- Finanzen: the Safe is a group now (its Fächer are sub accounts), it holds no denominations itself.
UPDATE fin_konten SET stueckelung = false WHERE id = 'safe'