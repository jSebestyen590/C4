import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  einstellungSchema,
  verlaufAlleGelesenSchema,
  verlaufSeiteQuerySchema,
  type VerlaufSeiteDto,
} from '@c4/shared';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';
import { cursorSchreiben, cursorLesen } from './kontext';

/** Notification history entries per page. */
const VERLAUF_SEITE = 30;

export const benachrichtigungenRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, profilBearbeiten, gefunden } = ctx;

  return new Hono<AuthEnv>()
    .get('/me/benachrichtigungen', auth, profilBearbeiten, async (c) =>
      c.json(
        gefunden(
          await deps.benachrichtigungen.einstellungen(c.get('user').sub),
          'Mitglied nicht gefunden',
        ),
      ),
    )
    .put(
      '/me/benachrichtigungen',
      auth,
      profilBearbeiten,
      zValidator('json', einstellungSchema),
      async (c) => {
        const { art, aktiv, minuten } = c.req.valid('json');
        gefunden(
          await deps.benachrichtigungen.einstellungSetzen(c.get('user').sub, art, aktiv, minuten),
          'Mitglied nicht gefunden',
        );
        return c.json({ ok: true });
      },
    )
    .get(
      '/me/benachrichtigungen/verlauf',
      auth,
      profilBearbeiten,
      zValidator('query', verlaufSeiteQuerySchema),
      async (c) => {
        const { art, bereich, ungelesen, vor: vorWert } = c.req.valid('query');
        const vor = cursorLesen(vorWert);
        const { eintraege, weiter } = await deps.benachrichtigungen.verlaufSeite(
          c.get('user').sub,
          {
            art,
            bereich,
            nurUngelesen: ungelesen === 'true',
            vor: vor && { erstellt: vor.erstelltAm, id: vor.id },
            limit: VERLAUF_SEITE,
          },
        );
        const dto: VerlaufSeiteDto = {
          eintraege: eintraege.map((e) => ({
            id: e.id,
            art: e.art,
            titel: e.titel,
            text: e.text,
            url: e.url,
            erstellt: e.erstellt.toISOString(),
            gelesen: e.gelesen !== null,
          })),
          weiter: weiter ? cursorSchreiben({ erstelltAm: weiter.erstellt, id: weiter.id }) : null,
        };
        return c.json(dto);
      },
    )
    .get('/me/benachrichtigungen/verlauf/ungelesen', auth, profilBearbeiten, async (c) =>
      c.json({ anzahl: await deps.benachrichtigungen.verlaufUngelesen(c.get('user').sub) }),
    )
    .post(
      '/me/benachrichtigungen/verlauf/gelesen',
      auth,
      profilBearbeiten,
      zValidator('json', verlaufAlleGelesenSchema),
      async (c) => {
        await deps.benachrichtigungen.verlaufAlleGelesen(c.get('user').sub, c.req.valid('json'));
        return c.body(null, 204);
      },
    )
    .post('/me/benachrichtigungen/verlauf/:id/gelesen', auth, profilBearbeiten, async (c) => {
      gefunden(
        await deps.benachrichtigungen.verlaufGelesen(c.get('user').sub, c.req.param('id')),
        'Benachrichtigung nicht gefunden',
      );
      return c.body(null, 204);
    });
};
