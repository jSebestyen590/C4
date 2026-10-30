-- Events a member added to their own calendar subscription feed.
CREATE TABLE IF NOT EXISTS kalender_event_abos (
  mitglied_sub text NOT NULL REFERENCES mitglieder (sub),
  event_id text NOT NULL REFERENCES events (id),
  PRIMARY KEY (mitglied_sub, event_id)
)
