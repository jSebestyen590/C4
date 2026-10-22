-- True for the positions of an Ausleihe that lends a whole Ifco; null/false = single item.
ALTER TABLE ausleihe_positionen ADD COLUMN IF NOT EXISTS ganze_ifco boolean
