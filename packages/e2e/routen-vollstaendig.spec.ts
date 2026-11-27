import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { routen } from './routen';

// Braucht keinen Browser und keinen Login: vergleicht `routen.ts` mit den `path="…"` der Web-App.
test('routen.ts enthält alle Routen der App', () => {
  const quelle = new URL('../web/src/', import.meta.url);
  const dateien = [
    new URL('App.tsx', quelle),
    ...readdirSync(new URL('routes/', quelle))
      .filter((name) => name.endsWith('Routen.tsx'))
      .map((name) => new URL(`routes/${name}`, quelle)),
  ];
  const ignoriert = new Set(['*', '/auth/callback']);
  const app = new Set<string>();
  for (const datei of dateien) {
    for (const treffer of readFileSync(datei, 'utf8').matchAll(/path="([^"]*)"/g)) {
      if (treffer[1] !== undefined && !ignoriert.has(treffer[1])) app.add(treffer[1]);
    }
  }
  const bekannt = new Set(routen.map((r) => r.pfad));
  const fehlen = [...app].filter((p) => !bekannt.has(p)).sort();
  const veraltet = [...bekannt].filter((p) => !app.has(p)).sort();
  expect(fehlen, `Neue Routen ohne Eintrag in routen.ts:\n${fehlen.join('\n')}`).toEqual([]);
  expect(veraltet, `Einträge in routen.ts ohne Route in der App:\n${veraltet.join('\n')}`).toEqual(
    [],
  );
});
