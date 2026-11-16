import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { pushAboLoeschenSchema, pushAboSchema } from '@c4/shared';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const pushRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, profilBearbeiten, eigenesProfilMussExistieren } = ctx;

  return new Hono<AuthEnv>()
    .get('/push/schluessel', auth, profilBearbeiten, async (c) =>
      c.json({ publicKey: await deps.benachrichtigungen.publicKey() }),
    )
    .post('/push/abos', auth, profilBearbeiten, zValidator('json', pushAboSchema), async (c) => {
      const sub = c.get('user').sub;
      await eigenesProfilMussExistieren(sub);
      await deps.benachrichtigungen.aboSpeichern(sub, c.req.valid('json'));
      return c.json({ ok: true }, 201);
    })
    .get(
      '/push/abos/status',
      auth,
      profilBearbeiten,
      zValidator('query', pushAboLoeschenSchema),
      async (c) =>
        c.json({
          registriert: await deps.benachrichtigungen.aboRegistriert(
            c.get('user').sub,
            c.req.valid('query').endpoint,
          ),
        }),
    )
    .delete(
      '/push/abos',
      auth,
      profilBearbeiten,
      zValidator('json', pushAboLoeschenSchema),
      async (c) => {
        await deps.benachrichtigungen.aboLoeschen(c.get('user').sub, c.req.valid('json').endpoint);
        return c.json({ ok: true });
      },
    )
    .post('/push/test', auth, profilBearbeiten, async (c) =>
      c.json(await deps.benachrichtigungen.testSenden(c.get('user').sub)),
    );
};
