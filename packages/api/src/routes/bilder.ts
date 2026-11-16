import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  bilderOrdnerAnlegenSchema,
  bilderSortieren,
  ordnerName,
  ordnerNameParsen,
  type BilderListeDto,
  type BilderOrdnerDto,
} from '@c4/shared';
import { NichtVerbunden, type OneDriveOrdner } from '../onedrive';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const bilderRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    adminOnly,
    bilderLesen,
    onedriveFehler,
    freigabeErstellen,
    freigabeVersuchen,
    ordnerCacheEinfuegen,
    akteurMitName,
  } = ctx;

  /** Redirect URI of the OneDrive login: the SPA page, on the app's own origin or the local dev server. */
  const redirectUriPruefen = (uri: string) => {
    const ende = '/app/bilder/einrichtung';
    // Compare by parsed origin: a plain prefix check would accept `https://app.example.evil.com`.
    const vonApp = (): boolean => {
      try {
        const u = new URL(uri);
        const app = new URL(deps.appUrl!);
        const pfad = app.pathname.replace(/\/+$/, '');
        return (
          u.origin === app.origin && (u.pathname === pfad || u.pathname.startsWith(`${pfad}/`))
        );
      } catch {
        return false;
      }
    };
    const ok =
      uri.endsWith(ende) && (!deps.appUrl || vonApp() || uri === `http://localhost:5173${ende}`);
    if (!ok) throw new HTTPException(400, { message: 'Ungültige Weiterleitungsadresse.' });
  };

  /** Builds the DTO list; event links and sharing links come fresh from the DB, not from the snapshot. */
  const bilderListe = async (ordner: readonly OneDriveOrdner[]): Promise<BilderOrdnerDto[]> => {
    const [zuordnung, links] = await Promise.all([
      deps.kalender.bilderOrdnerZuordnung(),
      deps.freigaben.alle().catch((err) => {
        console.error('Reading the sharing link cache failed', err);
        return new Map<string, string>();
      }),
    ]);
    const events = new Map(zuordnung.map((z) => [z.ordnerId, z.eventId]));
    return bilderSortieren(
      ordner.map((o) => {
        const geparst = ordnerNameParsen(o.name);
        return {
          id: o.id,
          name: o.name,
          webUrl: o.webUrl,
          von: geparst?.von ?? null,
          bis: geparst?.bis ?? null,
          eventName: geparst?.eventName ?? o.name,
          genauigkeit: geparst?.genauigkeit ?? 'tag',
          freigabeUrl: links.get(o.id) ?? null,
          eventId: events.get(o.id) ?? null,
        } satisfies BilderOrdnerDto;
      }),
    );
  };

  return (
    new Hono<AuthEnv>()
      .get(
        '/bilder/ordner',
        auth,
        bilderLesen,
        zValidator('query', z.object({ quelle: z.enum(['cache']).optional() })),
        async (c) => {
          if (c.req.valid('query').quelle === 'cache') {
            const [status, snapshot] = await Promise.all([
              deps.onedrive.status(),
              deps.ordnerCache.lesen(),
            ]);
            return c.json({
              verbunden: status.verbunden,
              ordner: snapshot && status.verbunden ? await bilderListe(snapshot.ordner) : [],
              stand: snapshot && status.verbunden ? snapshot.stand.toISOString() : null,
              ausCache: true,
            } satisfies BilderListeDto);
          }
          let ordner;
          try {
            ordner = await deps.onedrive.ordnerListen();
          } catch (err) {
            if (err instanceof NichtVerbunden) {
              return c.json({
                verbunden: false,
                ordner: [],
                stand: null,
                ausCache: false,
              } satisfies BilderListeDto);
            }
            return onedriveFehler(err);
          }
          const stand = new Date();
          await deps.ordnerCache.schreiben(ordner, stand).catch((err) => {
            console.error('Storing the folder list cache failed', err);
          });
          return c.json({
            verbunden: true,
            ordner: await bilderListe(ordner),
            stand: stand.toISOString(),
            ausCache: false,
          } satisfies BilderListeDto);
        },
      )
      .post(
        '/bilder/ordner',
        auth,
        bilderLesen,
        zValidator('json', bilderOrdnerAnlegenSchema),
        async (c) => {
          const { eventName, von, bis } = c.req.valid('json');
          const name = ordnerName(von, bis ?? von, eventName);
          const ordner = await deps.onedrive.ordnerAnlegen(name).catch(onedriveFehler);
          await ordnerCacheEinfuegen(ordner);
          const geparst = ordnerNameParsen(ordner.name);
          return c.json(
            {
              id: ordner.id,
              name: ordner.name,
              webUrl: ordner.webUrl,
              von: geparst?.von ?? von,
              bis: geparst?.bis ?? bis ?? von,
              eventName: geparst?.eventName ?? eventName,
              genauigkeit: geparst?.genauigkeit ?? 'tag',
              freigabeUrl: await freigabeVersuchen(ordner.id),
              eventId: null,
            } satisfies BilderOrdnerDto,
            201,
          );
        },
      )
      // Anonymous read-only sharing link of a folder (created and cached on first use).
      .post('/bilder/ordner/:id/freigabe', auth, bilderLesen, async (c) => {
        const id = c.req.param('id');
        // Only folders the app knows (folder list snapshot or cached sharing links): the id comes
        // from the URL and must not be any drive item.
        const [snapshot, links] = await Promise.all([
          deps.ordnerCache.lesen().catch(() => null),
          deps.freigaben.alle().catch(() => new Map<string, string>()),
        ]);
        if (!links.has(id) && !snapshot?.ordner.some((o) => o.id === id)) {
          throw new HTTPException(404, { message: 'Ordner nicht gefunden' });
        }
        const url = await freigabeErstellen(id).catch(onedriveFehler);
        return c.json({ url });
      })
      // ----- Bilder: OneDrive connection (admins)
      .get('/bilder/verbindung', auth, adminOnly, async (c) => c.json(await deps.onedrive.status()))
      .put(
        '/bilder/verbindung',
        auth,
        adminOnly,
        zValidator(
          'json',
          z.object({
            clientId: z.string().trim().min(1, 'Bitte gib die Client-ID an.').max(200),
            clientSecret: z
              .string()
              .trim()
              .max(500)
              .optional()
              .transform((v) => v || undefined),
            basisPfad: z.string().trim().max(300).default(''),
          }),
        ),
        async (c) => {
          const { clientSecret, ...rest } = c.req.valid('json');
          const akteur = await akteurMitName(c.get('user').sub);
          await deps.onedrive
            .konfigurieren({ ...rest, ...(clientSecret && { clientSecret }) }, akteur.name)
            .catch(onedriveFehler);
          return c.json(await deps.onedrive.status());
        },
      )
      .post(
        '/bilder/verbindung/login',
        auth,
        adminOnly,
        zValidator(
          'json',
          z.object({ redirectUri: z.string().max(500), state: z.string().min(8).max(200) }),
        ),
        async (c) => {
          const { redirectUri, state } = c.req.valid('json');
          redirectUriPruefen(redirectUri);
          const url = await deps.onedrive.loginUrl(redirectUri, state).catch(onedriveFehler);
          return c.json({ url });
        },
      )
      .post(
        '/bilder/verbindung/code',
        auth,
        adminOnly,
        zValidator(
          'json',
          z.object({ code: z.string().min(1).max(4000), redirectUri: z.string().max(500) }),
        ),
        async (c) => {
          const { code, redirectUri } = c.req.valid('json');
          redirectUriPruefen(redirectUri);
          const akteur = await akteurMitName(c.get('user').sub);
          return c.json(
            await deps.onedrive.codeEinloesen(code, redirectUri, akteur.name).catch(onedriveFehler),
          );
        },
      )
      .delete('/bilder/verbindung', auth, adminOnly, async (c) => {
        await deps.onedrive.trennen();
        return c.json(await deps.onedrive.status());
      })
  );
  // ----- Kalender: Dienste;
};
