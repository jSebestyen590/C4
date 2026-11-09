-- Key requests: art 'bedarf' (someone needs a key) or 'abgabe' (a holder wants to hand one over).
-- status: offen, vergeben or zurueckgezogen. ab/bis are 'HH:MM' (Berlin), both null = all day.
-- erinnert: when the last push (or repeat) went out.
CREATE TABLE IF NOT EXISTS schluessel_anfragen (
  id text PRIMARY KEY,
  art text NOT NULL,
  ersteller_sub text NOT NULL REFERENCES mitglieder (sub),
  schluessel_id text REFERENCES schluessel (id),
  datum date NOT NULL,
  ab text,
  bis text,
  notiz text,
  status text NOT NULL DEFAULT 'offen',
  erstellt timestamptz NOT NULL DEFAULT now(),
  erinnert timestamptz NOT NULL DEFAULT now()
)
