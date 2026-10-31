-- The date of an answer in a scheduling poll; beginn/ende only when the times are set per date.
CREATE TABLE IF NOT EXISTS umfrage_option_termine (
  option_id text PRIMARY KEY REFERENCES umfrage_optionen (id),
  datum date NOT NULL,
  beginn text,
  ende text
)
