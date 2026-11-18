-- Finanzen: master data of a Kasse. A Kasse is a Fach of the Safe (konto_id), the default accounts are preselected in the Abrechnung. Editable.
CREATE TABLE IF NOT EXISTS fin_kassen (
  konto_id text PRIMARY KEY REFERENCES fin_konten (id),
  standard_erloes_konto_id text NOT NULL REFERENCES fin_konten (id),
  standard_ziel_fach_id text NOT NULL REFERENCES fin_konten (id),
  geaendert_am timestamptz NOT NULL
)