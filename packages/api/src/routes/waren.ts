import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  einlagerungenSchema,
  einlagerungSchema,
  entnahmenSchema,
  entnahmeSchema,
  umlagerungenSchema,
  gebindeSchema,
  inventurAbschlussSchema,
  inventurStartenSchema,
  inventurZaehlungSchema,
  boedenHinzufuegenSchema,
  lagerortAnlegenSchema,
  lagerortReihenfolgeSchema,
  lagerortSchema,
  lagerortWarenSchema,
  wareSchema,
  warengruppeSchema,
  postenArchivierenSchema,
} from '@c4/shared';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const warenRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    warenLesen,
    bestandBuchen,
    warenVerwalten,
    mitErstellerUsernames,
    warenFehler,
    gefunden,
  } = ctx;

  return (
    new Hono<AuthEnv>()
      .get('/lagerorte', auth, warenLesen, async (c) =>
        c.json(await deps.waren.lagerorte(c.req.query('archiv') === '1')),
      )
      .get('/lagerorte/bestand', auth, warenLesen, async (c) =>
        c.json(await deps.waren.lagerortBestand()),
      )
      .get('/lagerorte/warenlisten', auth, warenLesen, async (c) =>
        c.json(await deps.waren.lagerortWarenlisten()),
      )
      .post(
        '/lagerorte',
        auth,
        warenVerwalten,
        zValidator('json', lagerortAnlegenSchema),
        async (c) => {
          const { boeden, boedenIfcoPlatz, ...daten } = c.req.valid('json');
          const angelegt = await deps.waren
            .lagerortAnlegen(daten, boeden, boedenIfcoPlatz)
            .catch(warenFehler);
          return c.json(angelegt, 201);
        },
      )
      .post(
        '/lagerorte/:id/boeden',
        auth,
        warenVerwalten,
        zValidator('json', boedenHinzufuegenSchema),
        async (c) => {
          const boedenIds = gefunden(
            await deps.waren
              .boedenHinzufuegen(
                c.req.param('id'),
                c.req.valid('json').namen,
                c.req.valid('json').ifcoPlatz,
              )
              .catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ boedenIds }, 201);
        },
      )
      .put(
        '/lagerorte/:id',
        auth,
        warenVerwalten,
        zValidator('json', lagerortSchema),
        async (c) => {
          gefunden(
            await deps.waren
              .lagerortAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/lagerorte/:id', auth, warenVerwalten, async (c) => {
        gefunden(
          await deps.waren.lagerortLoeschen(c.req.param('id')).catch(warenFehler),
          'Lagerort nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/lagerorte/:id/archiv',
        auth,
        warenVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.waren.lagerortArchivieren(c.req.param('id'), archiviert).catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // `:id` = `root` orders the top level.
      .put(
        '/lagerorte/:id/reihenfolge',
        auth,
        warenVerwalten,
        zValidator('json', lagerortReihenfolgeSchema),
        async (c) => {
          const id = c.req.param('id');
          const { ids } = c.req.valid('json');
          gefunden(
            await deps.waren.lagerortReihenfolge(id === 'root' ? null : id, ids).catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ ids });
        },
      )
      .get('/lagerorte/:id/waren', auth, warenLesen, async (c) => {
        const wareIds = gefunden(
          await deps.waren.lagerortWaren(c.req.param('id')),
          'Lagerort nicht gefunden',
        );
        return c.json({ wareIds });
      })
      .put(
        '/lagerorte/:id/waren',
        auth,
        warenVerwalten,
        zValidator('json', lagerortWarenSchema),
        async (c) => {
          const { wareIds } = c.req.valid('json');
          gefunden(
            await deps.waren.lagerortWarenSetzen(c.req.param('id'), wareIds).catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ wareIds });
        },
      )
      // ----- Waren: Warengruppen
      .get('/warengruppen', auth, warenLesen, async (c) =>
        c.json(await deps.waren.warengruppen(c.req.query('archiv') === '1')),
      )
      .post(
        '/warengruppen',
        auth,
        warenVerwalten,
        zValidator('json', warengruppeSchema),
        async (c) => {
          const id = await deps.waren.warengruppeAnlegen(c.req.valid('json')).catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/warengruppen/:id',
        auth,
        warenVerwalten,
        zValidator('json', warengruppeSchema),
        async (c) => {
          gefunden(
            await deps.waren
              .warengruppeAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Warengruppe nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/warengruppen/:id', auth, warenVerwalten, async (c) => {
        gefunden(
          await deps.waren.warengruppeLoeschen(c.req.param('id')).catch(warenFehler),
          'Warengruppe nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/warengruppen/:id/archiv',
        auth,
        warenVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.waren
              .warengruppeArchivieren(c.req.param('id'), archiviert)
              .catch(warenFehler),
            'Warengruppe nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // ----- Waren: Gebinde
      .get('/gebinde', auth, warenLesen, async (c) =>
        c.json(await deps.waren.gebinde(c.req.query('archiv') === '1')),
      )
      .post('/gebinde', auth, warenVerwalten, zValidator('json', gebindeSchema), async (c) => {
        const id = await deps.waren.gebindeAnlegen(c.req.valid('json')).catch(warenFehler);
        return c.json({ id }, 201);
      })
      .put('/gebinde/:id', auth, warenVerwalten, zValidator('json', gebindeSchema), async (c) => {
        gefunden(
          await deps.waren
            .gebindeAktualisieren(c.req.param('id'), c.req.valid('json'))
            .catch(warenFehler),
          'Gebinde nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .delete('/gebinde/:id', auth, warenVerwalten, async (c) => {
        gefunden(
          await deps.waren.gebindeLoeschen(c.req.param('id')).catch(warenFehler),
          'Gebinde nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/gebinde/:id/archiv',
        auth,
        warenVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.waren.gebindeArchivieren(c.req.param('id'), archiviert),
            'Gebinde nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // ----- Waren
      .get('/waren', auth, warenLesen, async (c) =>
        c.json(await deps.waren.waren(c.req.query('archiv') === '1')),
      )
      .post('/waren', auth, warenVerwalten, zValidator('json', wareSchema), async (c) => {
        const id = await deps.waren.wareAnlegen(c.req.valid('json')).catch(warenFehler);
        return c.json({ id }, 201);
      })
      .get('/waren/:id', auth, warenLesen, async (c) =>
        c.json(gefunden(await deps.waren.wareHolen(c.req.param('id')), 'Ware nicht gefunden')),
      )
      .put('/waren/:id', auth, warenVerwalten, zValidator('json', wareSchema), async (c) => {
        gefunden(
          await deps.waren
            .wareAktualisieren(c.req.param('id'), c.req.valid('json'))
            .catch(warenFehler),
          'Ware nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .delete('/waren/:id', auth, warenVerwalten, async (c) => {
        gefunden(
          await deps.waren.wareLoeschen(c.req.param('id')).catch(warenFehler),
          'Ware nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/waren/:id/archiv',
        auth,
        warenVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.waren.wareArchivieren(c.req.param('id'), archiviert),
            'Ware nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      .get('/waren/:id/bestand', auth, warenLesen, async (c) =>
        c.json(gefunden(await deps.waren.wareBestand(c.req.param('id')), 'Ware nicht gefunden')),
      )
      .get('/waren/:id/verlauf', auth, warenLesen, async (c) =>
        c.json(gefunden(await deps.waren.wareVerlauf(c.req.param('id')), 'Ware nicht gefunden')),
      )
      .get('/waren/:id/vorgaenge', auth, warenLesen, async (c) =>
        c.json(
          await mitErstellerUsernames(
            gefunden(await deps.waren.wareVorgaenge(c.req.param('id')), 'Ware nicht gefunden'),
          ),
        ),
      )
      // ----- Bestand
      .post(
        '/bestand/einlagerung',
        auth,
        bestandBuchen,
        zValidator('json', einlagerungSchema),
        async (c) => {
          const id = await deps.waren
            .einlagern(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .post(
        '/bestand/entnahme',
        auth,
        bestandBuchen,
        zValidator('json', entnahmeSchema),
        async (c) => {
          const id = await deps.waren
            .entnehmen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .post(
        '/bestand/einlagerungen',
        auth,
        bestandBuchen,
        zValidator('json', einlagerungenSchema),
        async (c) => {
          const id = await deps.waren
            .einlagerungen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .post(
        '/bestand/entnahmen',
        auth,
        bestandBuchen,
        zValidator('json', entnahmenSchema),
        async (c) => {
          const ids = await deps.waren
            .entnahmen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json(ids, 201);
        },
      )
      .post(
        '/bestand/umlagerungen',
        auth,
        bestandBuchen,
        zValidator('json', umlagerungenSchema),
        async (c) => {
          const id = await deps.waren
            .umlagerungen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .delete('/bestand/vorgaenge/:id', auth, bestandBuchen, async (c) => {
        gefunden(await deps.waren.vorgangLoeschen(c.req.param('id')), 'Vorgang nicht gefunden');
        return c.json({ ok: true });
      })
      // ----- Inventur
      .get('/inventuren', auth, warenLesen, async (c) => {
        const status = c.req.query('status');
        if (status !== undefined && status !== 'offen' && status !== 'abgeschlossen') {
          throw new HTTPException(400, { message: 'Ungültiger Status' });
        }
        return c.json(await mitErstellerUsernames(await deps.waren.inventuren(status)));
      })
      .post(
        '/inventuren',
        auth,
        bestandBuchen,
        zValidator('json', inventurStartenSchema),
        async (c) => {
          const id = await deps.waren
            .inventurStarten(c.req.valid('json').lagerortId, c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .get('/inventuren/:id', auth, warenLesen, async (c) => {
        const inventur = gefunden(
          await deps.waren.inventurHolen(c.req.param('id')),
          'Inventur nicht gefunden',
        );
        return c.json((await mitErstellerUsernames([inventur]))[0]!);
      })
      .put(
        '/inventuren/:id/knoten/:lid',
        auth,
        bestandBuchen,
        zValidator('json', inventurZaehlungSchema),
        async (c) => {
          const { zaehlungen, inListeAufnehmen } = c.req.valid('json');
          gefunden(
            await deps.waren
              .inventurKnotenSpeichern(
                c.req.param('id'),
                c.req.param('lid'),
                zaehlungen,
                inListeAufnehmen,
              )
              .catch(warenFehler),
            'Inventur nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get(
        '/inventuren/:id/zusammenfassung',
        auth,
        warenLesen,
        zValidator('query', inventurAbschlussSchema.partial()),
        async (c) =>
          c.json(
            gefunden(
              await deps.waren
                .inventurZusammenfassung(c.req.param('id'), c.req.valid('query').zeitpunkt)
                .catch(warenFehler),
              'Inventur nicht gefunden',
            ),
          ),
      )
      .post(
        '/inventuren/:id/abschluss',
        auth,
        bestandBuchen,
        zValidator('json', inventurAbschlussSchema),
        async (c) => {
          const vorgangId = gefunden(
            await deps.waren
              .inventurAbschliessen(
                c.req.param('id'),
                c.req.valid('json').zeitpunkt,
                c.get('user').sub,
              )
              .catch(warenFehler),
            'Inventur nicht gefunden',
          );
          return c.json({ vorgangId });
        },
      )
      .delete('/inventuren/:id', auth, bestandBuchen, async (c) => {
        gefunden(
          await deps.waren.inventurVerwerfen(c.req.param('id')).catch(warenFehler),
          'Inventur nicht gefunden',
        );
        return c.json({ ok: true });
      })
  );
  // ----- Inventar: Kategorien;
};
