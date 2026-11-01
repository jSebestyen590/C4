-- The date of an answer in a scheduling poll: bis is the last day of a multi-day date, beginn/ende
-- only when the times are set per date, name is shown with the date.
CREATE TABLE IF NOT EXISTS umfrage_option_termine (
  option_id text PRIMARY KEY REFERENCES umfrage_optionen (id),
  datum date NOT NULL,
  bis date,
  beginn text,
  ende text,
  name text
)
