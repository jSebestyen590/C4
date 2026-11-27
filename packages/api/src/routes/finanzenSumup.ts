import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { sumupBuchenSchema } from '@c4/shared';
import { type AuthEnv } from '../auth';
import { BuchungUngueltig, FestschreibungKonflikt } from '../finanzen';
import { SumupKonflikt, SumupUnbekannt } from '../finanzenSumup';
import type { RoutenKontext } from './kontext';

// SumUp card revenue (docs/finanzen.md („SumUp“)): overview, manual fetch and booking per group.
export const finanzenSumupRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, finanzenLesen, finanzenBuchen } = ctx;

  const sumupFehler = (err: unknown): never => {
    if (err instanceof BuchungUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof SumupUnbekannt) throw new HTTPException(404, { message: err.message });
    if (err instanceof SumupKonflikt) throw new HTTPException(409, { message: err.message });
    if (err instanceof FestschreibungKonflikt)
      throw new HTTPException(409, { message: err.message });
    throw err;
  };

  return new Hono<AuthEnv>()
    .get('/finanzen/sumup', auth, finanzenLesen, async (c) =>
      c.json(await deps.finanzen.sumupUebersicht()),
    )
    .post('/finanzen/sumup/abruf', auth, finanzenBuchen, async (c) => {
      let ergebnis;
      try {
        ergebnis = await deps.sumupAbrufen(new Date());
      } catch (err) {
        console.error('SumUp fetch failed', err instanceof Error ? err.message : err);
        throw new HTTPException(502, {
          message: 'SumUp antwortet nicht. Versuche es später noch einmal.',
        });
      }
      if (ergebnis.uebersprungen)
        throw new HTTPException(409, { message: 'SumUp ist noch nicht eingerichtet.' });
      return c.json(ergebnis);
    })
    .post(
      '/finanzen/sumup/buchen',
      auth,
      finanzenBuchen,
      zValidator('json', sumupBuchenSchema),
      async (c) => {
        const eingabe = c.req.valid('json');
        try {
          const ergebnis = await deps.finanzen.sumupBuchen({
            ...eingabe,
            erstelltVon: c.get('user').sub,
          });
          return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
        } catch (err) {
          return sumupFehler(err);
        }
      },
    );
};
