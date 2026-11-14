import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = path.join(import.meta.dirname, 'migrations');
/** Older migrations (already on main) predate the one-statement rule and down files; this guards the calendar set. */
const ERSTE_GEPRUEFTE = 37;
const RESERVIERT = [157, 158, 159, 160, 161, 162];
const ups = readdirSync(dir)
  .filter((f) => f.endsWith('.sql') && Number(f.slice(0, 4)) >= ERSTE_GEPRUEFTE)
  .sort();
const downs = new Set(readdirSync(path.join(dir, 'down')));

/** SQL without `--` comments and string literals, split at semicolons into non-empty statements. */
const statements = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, '')
    .replace(/'(?:[^']|'')*'/g, "''")
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

describe('migration files', () => {
  it('contain exactly one statement each (Aurora DSQL)', () => {
    for (const f of ups) {
      expect(statements(readFileSync(path.join(dir, f), 'utf8')), f).toHaveLength(1);
    }
  });

  it('have a down file each', () => {
    for (const f of ups) {
      const name = f.replace(/\.sql$/, '');
      const hat = downs.has(`${name}.down.sql`) || downs.has(`${name}.down.1.sql`);
      expect(hat, `missing down file for ${f}`).toBe(true);
    }
  });

  it('are numbered without gaps or duplicates', () => {
    const nummern = ups.map((f) => Number(f.slice(0, 4)));
    // 0157-0162 belong to the open Finanzen PR; allowed to be missing until it is merged (then drop this).
    const erwartet: number[] = [];
    for (let n = ERSTE_GEPRUEFTE; erwartet.length < nummern.length; n++) {
      if (!RESERVIERT.includes(n) || nummern.includes(n)) erwartet.push(n);
    }
    expect(nummern).toEqual(erwartet);
  });
});
