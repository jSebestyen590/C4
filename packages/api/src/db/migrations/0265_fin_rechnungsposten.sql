-- Finanzen: items of a Rechnung (insert-only snapshot). art: ware | frei. Amounts of a Stornorechnung are negative.
CREATE TABLE IF NOT EXISTS fin_rechnungsposten (
  rechnung_id text NOT NULL REFERENCES fin_rechnungen (id),
  pos integer NOT NULL,
  art text NOT NULL CHECK (art IN ('ware', 'frei')),
  ware_id text,
  gebinde_id text,
  einheit text,
  text text NOT NULL,
  anzahl_milli integer NOT NULL,
  einzelpreis_cent bigint NOT NULL,
  pfand_cent bigint,
  pfand_betrag_cent bigint,
  steuersatz integer NOT NULL,
  erloes_konto_id text NOT NULL REFERENCES fin_konten (id),
  gesamt_cent bigint NOT NULL,
  PRIMARY KEY (rechnung_id, pos)
)