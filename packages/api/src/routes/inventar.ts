import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ausleiheAendernSchema,
  ausleiheSchema,
  gegenstandPlaetzeSchema,
  aufraeumFertigSchema,
  bewegungSchema,
  gegenstandAnlegenSchema,
  gegenstandSchema,
  ifcoAnlegenSchema,
  ifcoInhaltSchema,
  ifcoPlatzSchema,
  ifcoSchema,
  kategorieSchema,
  rueckgabeSchema,
  ifcoTypSchema,
  postenArchivierenSchema,
} from '@c4/shared';
import { type AufraeumDetails } from '../inventar';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const inventarRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    inventarLesen,
    inventarUmraeumen,
    inventarVerwalten,
    mitErstellerUsernames,
    warenFehler,
    gefunden,
  } = ctx;

  /** Adds the Cognito username to the organiser of each Ausleihe (the store only knows the profile row). */
  const mitUsernames = async <
    T extends { organisator: { sub: string; username: string | null } | null },
  >(
    liste: T[],
  ): Promise<T[]> => {
    if (!liste.some((a) => a.organisator)) return liste;
    const konten = await deps.userAdmin.konten();
    return liste.map((a) =>
      a.organisator
        ? {
            ...a,
            organisator: {
              ...a.organisator,
              username: konten.get(a.organisator.sub)?.username ?? null,
            },
          }
        : a,
    );
  };

  /** Adds the Cognito usernames to the members of the running Aufräumaktion. */
  const aufraeumenMitUsernames = async (a: AufraeumDetails | null) => {
    if (!a) return null;
    const konten = await deps.userAdmin.konten();
    const mit = <T extends { sub: string } | null>(o: T): T =>
      o && { ...o, username: konten.get(o.sub)?.username ?? null };
    return {
      ...a,
      gestartetVon: mit(a.gestartetVon),
      fertig: a.fertig.map((f) => ({ ...f, von: mit(f.von) })),
    };
  };

  return (
    new Hono<AuthEnv>()
      .get('/inventar/kategorien', auth, inventarLesen, async (c) =>
        c.json(await deps.inventar.kategorien(c.req.query('archiv') === '1')),
      )
      .post(
        '/inventar/kategorien',
        auth,
        inventarVerwalten,
        zValidator('json', kategorieSchema),
        async (c) => {
          const id = await deps.inventar.kategorieAnlegen(c.req.valid('json')).catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/inventar/kategorien/:id',
        auth,
        inventarVerwalten,
        zValidator('json', kategorieSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .kategorieAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Kategorie nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/kategorien/:id', auth, inventarVerwalten, async (c) => {
        gefunden(
          await deps.inventar.kategorieLoeschen(c.req.param('id')).catch(warenFehler),
          'Kategorie nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/kategorien/:id/archiv',
        auth,
        inventarVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .kategorieArchivieren(c.req.param('id'), archiviert)
              .catch(warenFehler),
            'Kategorie nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // ----- Inventar: Gegenstände
      .get('/inventar/gegenstaende', auth, inventarLesen, async (c) =>
        c.json(await deps.inventar.gegenstaende(c.req.query('archiv') === '1')),
      )
      .get('/inventar/gegenstaende/:id', auth, inventarLesen, async (c) =>
        c.json(
          gefunden(
            await deps.inventar.gegenstandHolen(c.req.param('id')),
            'Gegenstand nicht gefunden',
          ),
        ),
      )
      .post(
        '/inventar/gegenstaende',
        auth,
        inventarVerwalten,
        zValidator('json', gegenstandAnlegenSchema),
        async (c) => {
          const id = await deps.inventar
            .gegenstandAnlegen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/inventar/gegenstaende/:id',
        auth,
        inventarVerwalten,
        zValidator('json', gegenstandSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .gegenstandAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Gegenstand nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/gegenstaende/:id', auth, inventarVerwalten, async (c) => {
        gefunden(
          await deps.inventar.gegenstandLoeschen(c.req.param('id')).catch(warenFehler),
          'Gegenstand nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/gegenstaende/:id/archiv',
        auth,
        inventarVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .gegenstandArchivieren(c.req.param('id'), archiviert)
              .catch(warenFehler),
            'Gegenstand nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      .put(
        '/inventar/gegenstaende/:id/plaetze',
        auth,
        inventarUmraeumen,
        zValidator('json', gegenstandPlaetzeSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .gegenstandPlaetzeSetzen(
                c.req.param('id'),
                c.req.valid('json').plaetze,
                c.req.valid('json').verbaut,
              )
              .catch(warenFehler),
            'Gegenstand nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Inventar: Zugänge und Abgänge
      .get('/inventar/gegenstaende/:id/bewegungen', auth, inventarLesen, async (c) =>
        c.json(
          await mitErstellerUsernames(
            gefunden(
              await deps.inventar.bewegungen(c.req.param('id')),
              'Gegenstand nicht gefunden',
            ),
          ),
        ),
      )
      .post(
        '/inventar/gegenstaende/:id/bewegungen',
        auth,
        inventarVerwalten,
        zValidator('json', bewegungSchema),
        async (c) => {
          const id = gefunden(
            await deps.inventar
              .bewegungBuchen(c.req.param('id'), c.req.valid('json'), c.get('user').sub)
              .catch(warenFehler),
            'Gegenstand nicht gefunden',
          );
          return c.json({ id }, 201);
        },
      )
      .delete(
        '/inventar/gegenstaende/:id/bewegungen/:bewegungId',
        auth,
        inventarVerwalten,
        async (c) => {
          gefunden(
            await deps.inventar
              .bewegungLoeschen(c.req.param('id'), c.req.param('bewegungId'))
              .catch(warenFehler),
            'Buchung nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Inventar: IFCO-Typen
      .get('/inventar/ifco-typen', auth, inventarLesen, async (c) =>
        c.json(await deps.inventar.ifcoTypen(c.req.query('archiv') === '1')),
      )
      .post(
        '/inventar/ifco-typen',
        auth,
        inventarVerwalten,
        zValidator('json', ifcoTypSchema),
        async (c) => {
          const id = await deps.inventar.ifcoTypAnlegen(c.req.valid('json')).catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/inventar/ifco-typen/:id',
        auth,
        inventarVerwalten,
        zValidator('json', ifcoTypSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ifcoTypAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'IFCO-Typ nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/ifco-typen/:id', auth, inventarVerwalten, async (c) => {
        gefunden(
          await deps.inventar.ifcoTypLoeschen(c.req.param('id')).catch(warenFehler),
          'IFCO-Typ nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/ifco-typen/:id/archiv',
        auth,
        inventarVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .ifcoTypArchivieren(c.req.param('id'), archiviert)
              .catch(warenFehler),
            'IFCO-Typ nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // ----- Inventar: IFCOs
      .get('/inventar/ifcos', auth, inventarLesen, async (c) =>
        c.json(await deps.inventar.ifcos(c.req.query('archiv') === '1')),
      )
      .get('/inventar/ifcos/:id', auth, inventarLesen, async (c) =>
        c.json(gefunden(await deps.inventar.ifcoHolen(c.req.param('id')), 'IFCO nicht gefunden')),
      )
      .post(
        '/inventar/ifcos',
        auth,
        inventarVerwalten,
        zValidator('json', ifcoAnlegenSchema),
        async (c) => {
          const id = await deps.inventar.ifcoAnlegen(c.req.valid('json')).catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/inventar/ifcos/:id',
        auth,
        inventarVerwalten,
        zValidator('json', ifcoSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ifcoAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/ifcos/:id', auth, inventarVerwalten, async (c) => {
        gefunden(
          await deps.inventar.ifcoLoeschen(c.req.param('id')).catch(warenFehler),
          'IFCO nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/ifcos/:id/archiv',
        auth,
        inventarVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.inventar.ifcoArchivieren(c.req.param('id'), archiviert).catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      .put(
        '/inventar/ifcos/:id/platz',
        auth,
        inventarUmraeumen,
        zValidator('json', ifcoPlatzSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ifcoPlatzSetzen(c.req.param('id'), c.req.valid('json').lagerortId)
              .catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .put(
        '/inventar/ifcos/:id/inhalt',
        auth,
        inventarUmraeumen,
        zValidator('json', ifcoInhaltSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ifcoInhaltSetzen(c.req.param('id'), c.req.valid('json').positionen)
              .catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Inventar: Aufräumen
      .get('/inventar/aufraeumen', auth, inventarLesen, async (c) =>
        c.json({ aktion: await aufraeumenMitUsernames(await deps.inventar.aufraeumen()) }),
      )
      .post('/inventar/aufraeumen', auth, inventarUmraeumen, async (c) => {
        const id = await deps.inventar.aufraeumenStarten(c.get('user').sub).catch(warenFehler);
        return c.json({ id }, 201);
      })
      .post('/inventar/aufraeumen/beenden', auth, inventarUmraeumen, async (c) => {
        gefunden(
          await deps.inventar.aufraeumenBeenden(c.get('user').sub),
          'Es läuft keine Aufräumaktion',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/aufraeumen/ifcos/:id',
        auth,
        inventarUmraeumen,
        zValidator('json', aufraeumFertigSchema),
        async (c) => {
          const { fertig } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .aufraeumIfcoSetzen(c.req.param('id'), fertig, c.get('user').sub)
              .catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ fertig });
        },
      )
      // ----- Inventar: Ausleihen
      .get('/inventar/ausleihen', auth, inventarLesen, async (c) =>
        c.json(
          await mitUsernames(await deps.inventar.ausleihen(c.req.query('status') === 'offen')),
        ),
      )
      .get('/inventar/ausleihen/:id', auth, inventarLesen, async (c) => {
        const ausleihe = gefunden(
          await deps.inventar.ausleiheHolen(c.req.param('id')),
          'Ausleihe nicht gefunden',
        );
        return c.json((await mitUsernames([ausleihe]))[0]!);
      })
      .post(
        '/inventar/ausleihen',
        auth,
        inventarUmraeumen,
        zValidator('json', ausleiheSchema),
        async (c) => {
          const id = await deps.inventar
            .ausleiheAnlegen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .post(
        '/inventar/ausleihen/:id/rueckgabe',
        auth,
        inventarUmraeumen,
        zValidator('json', rueckgabeSchema),
        async (c) => {
          const { positionIds, zurueckAm } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .ausleiheRueckgabe(c.req.param('id'), positionIds, zurueckAm)
              .catch(warenFehler),
            'Ausleihe nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .put(
        '/inventar/ausleihen/:id',
        auth,
        inventarUmraeumen,
        zValidator('json', ausleiheAendernSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ausleiheAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Ausleihe nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/ausleihen/:id', auth, inventarUmraeumen, async (c) => {
        gefunden(
          await deps.inventar.ausleiheLoeschen(c.req.param('id')).catch(warenFehler),
          'Ausleihe nicht gefunden',
        );
        return c.json({ ok: true });
      })
  );
  // ----- Kalender: Events;
};
