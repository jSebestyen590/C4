-- Lock rows: check-then-insert transactions touch a key first so concurrent ones conflict (DSQL has no row locks).
CREATE TABLE IF NOT EXISTS sperren (
  schluessel text PRIMARY KEY,
  beruehrt_am timestamptz NOT NULL
)