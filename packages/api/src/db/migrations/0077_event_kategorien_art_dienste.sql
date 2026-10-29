-- Every existing category (incl. barabend) is a Dienste category. Idempotent.
UPDATE event_kategorien SET art = 'dienste' WHERE art IS NULL
