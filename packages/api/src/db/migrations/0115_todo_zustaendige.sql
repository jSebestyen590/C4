-- The people a Todo is for (groups are resolved when the Todo is created); the tick of mode 'einzeln'.
CREATE TABLE IF NOT EXISTS todo_zustaendige (
  todo_id text NOT NULL REFERENCES todos (id),
  sub text NOT NULL,
  erledigt_am timestamptz,
  erledigt_von text,
  PRIMARY KEY (todo_id, sub)
)
