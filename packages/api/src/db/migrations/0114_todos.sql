-- Todos (see docs/todos.md): from a protocol (protokoll_id, baustein_id) or created by a member.
-- Mode 'gemeinsam' keeps the tick in erledigt_am / erledigt_von; mode 'einzeln' keeps it per person in todo_zustaendige.
-- protokoll_id, erstellt_von and erledigt_von are ids / Cognito subs without a foreign key.
CREATE TABLE IF NOT EXISTS todos (
  id text PRIMARY KEY,
  titel text NOT NULL,
  notizen text,
  faellig_am text NOT NULL,
  modus text NOT NULL CHECK (modus IN ('gemeinsam', 'einzeln')),
  protokoll_id text,
  baustein_id text,
  erledigt_am timestamptz,
  erledigt_von text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  geaendert_am timestamptz NOT NULL DEFAULT now()
)
