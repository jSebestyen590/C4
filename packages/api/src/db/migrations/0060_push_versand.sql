-- Dedupe keys of sent notifications, so a job run never sends the same notification twice.
CREATE TABLE IF NOT EXISTS push_versand (
  schluessel text PRIMARY KEY,
  gesendet timestamptz NOT NULL DEFAULT now()
)
