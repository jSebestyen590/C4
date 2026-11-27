import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  heuteBerlin,
  besetzungAnlegenSchema,
  besetzungEingabeSchema,
  postenAktualisierenSchema,
  postenArchivierenSchema,
  postenRechteSetzenSchema,
  type Posten,
} from '@c4/shared';
import { type Konto } from '../admin';
import { type MitgliedRow } from '../db/schema';
import {
  AblosungUngueltig,
  BesetzungUeberschneidung,
  istAktuell,
  type PostenDetails,
} from '../posten';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const postenRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, adminOnly, postenLesen, postenBearbeiten, mitgliedMussExistieren } = ctx;

  /** Maps a Posten to its DTO; Besetzungen carry the display data of the member. */
  const alsPosten = (
    p: PostenDetails,
    zeilen: Map<string, MitgliedRow>,
    konten: Map<string, Konto>,
    heute: string,
  ): Posten => ({
    id: p.id,
    name: p.name,
    beschreibung: p.beschreibung,
    bezeichnungMaennlich: p.bezeichnungMaennlich,
    bezeichnungWeiblich: p.bezeichnungWeiblich,
    bezeichnungNeutral: p.bezeichnungNeutral,
    vorstand: p.vorstand ?? false,
    archiviert: p.archiviert,
    rechte: p.rechte,
    besetzungen: p.besetzungen
      .map((b) => ({
        id: b.id,
        mitgliedSub: b.mitgliedSub,
        mitglied: {
          username: konten.get(b.mitgliedSub)?.username ?? null,
          vorname: zeilen.get(b.mitgliedSub)?.vorname ?? '',
          nachname: zeilen.get(b.mitgliedSub)?.nachname ?? '',
          status: zeilen.get(b.mitgliedSub)?.status ?? 'anwaerter',
          anrede: zeilen.get(b.mitgliedSub)?.anrede ?? 'neutral',
        },
        start: b.startDatum,
        ende: b.endDatum,
        aktuell: istAktuell(b, heute),
      }))
      .sort(
        (a, b) =>
          Number(b.aktuell) - Number(a.aktuell) ||
          b.start.localeCompare(a.start) ||
          a.id.localeCompare(b.id),
      ),
  });

  const postenMitMitgliedern = async (liste: PostenDetails[]): Promise<Posten[]> => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const zeilen = new Map(rows.map((r) => [r.sub, r]));
    const heute = heuteBerlin();
    return liste.map((p) => alsPosten(p, zeilen, konten, heute));
  };

  /** Maps the store's Besetzung errors to HTTP statuses the web app can tell apart. */
  const besetzungFehler = (err: unknown): never => {
    if (err instanceof AblosungUngueltig) {
      throw new HTTPException(400, { message: 'Ungültige Ablösung' });
    }
    if (err instanceof BesetzungUeberschneidung) {
      throw new HTTPException(409, { message: 'Besetzung überschneidet sich' });
    }
    throw err;
  };

  /**
   * A Posten may only be staffed by someone who holds every right it grants, otherwise an editor
   * could put themselves on a Posten with rights they lack. Unknown Posten are left to the store (404).
   */
  const postenRechteMuessenBeiDirLiegen = (
    p: { rechte: readonly string[] } | undefined,
    eigene: readonly string[],
    text: string,
  ) => {
    if (p?.rechte.some((r) => !eigene.includes(r))) {
      throw new HTTPException(403, { message: text });
    }
  };

  return new Hono<AuthEnv>()
    .get('/posten', auth, postenLesen, async (c) => {
      const mitArchiv = c.req.query('archiv') === '1';
      if (mitArchiv && !c.get('permissions').includes('posten:bearbeiten')) {
        throw new HTTPException(403, { message: 'Forbidden' });
      }
      return c.json(await postenMitMitgliedern(await deps.posten.alle(mitArchiv)));
    })
    .get('/posten/:id', auth, postenLesen, async (c) => {
      const p = await deps.posten.holen(c.req.param('id'));
      if (!p || (p.archiviert && !c.get('permissions').includes('posten:bearbeiten'))) {
        throw new HTTPException(404, { message: 'Posten nicht gefunden' });
      }
      return c.json((await postenMitMitgliedern([p]))[0]);
    })
    .post(
      '/posten',
      auth,
      postenBearbeiten,
      zValidator('json', postenAktualisierenSchema),
      async (c) => {
        const id = await deps.posten.anlegen(c.req.valid('json'));
        return c.json({ id }, 201);
      },
    )
    .put(
      '/posten/:id',
      auth,
      postenBearbeiten,
      zValidator('json', postenAktualisierenSchema),
      async (c) => {
        if (!(await deps.posten.aktualisieren(c.req.param('id'), c.req.valid('json')))) {
          throw new HTTPException(404, { message: 'Posten nicht gefunden' });
        }
        return c.json({ ok: true });
      },
    )
    .put(
      '/posten/:id/archiv',
      auth,
      postenBearbeiten,
      zValidator('json', postenArchivierenSchema),
      async (c) => {
        const { archiviert } = c.req.valid('json');
        if (!archiviert) {
          postenRechteMuessenBeiDirLiegen(
            await deps.posten.holen(c.req.param('id')),
            c.get('permissions'),
            'Diesen Posten kannst du nicht wieder aktivieren: Er gewährt Rechte, die du selbst nicht hast.',
          );
        }
        if (!(await deps.posten.archivieren(c.req.param('id'), archiviert))) {
          throw new HTTPException(404, { message: 'Posten nicht gefunden' });
        }
        return c.json({ archiviert });
      },
    )
    .post(
      '/posten/:id/besetzungen',
      auth,
      postenBearbeiten,
      zValidator('json', besetzungAnlegenSchema),
      async (c) => {
        const { ablosung, ...daten } = c.req.valid('json');
        postenRechteMuessenBeiDirLiegen(
          await deps.posten.holen(c.req.param('id')),
          c.get('permissions'),
          'Diesen Posten kannst du nicht besetzen: Er gewährt Rechte, die du selbst nicht hast.',
        );
        await mitgliedMussExistieren(daten.mitgliedSub);
        const id = await deps.posten
          .besetzungAnlegen(c.req.param('id'), daten, ablosung)
          .catch(besetzungFehler);
        if (!id) throw new HTTPException(404, { message: 'Posten nicht gefunden' });
        return c.json({ id }, 201);
      },
    )
    .put(
      '/posten/:id/besetzungen/:bid',
      auth,
      postenBearbeiten,
      zValidator('json', besetzungEingabeSchema),
      async (c) => {
        const daten = c.req.valid('json');
        const posten = await deps.posten.holen(c.req.param('id'));
        postenRechteMuessenBeiDirLiegen(
          posten,
          c.get('permissions'),
          'Diese Besetzung kannst du nicht ändern: Der Posten gewährt Rechte, die du selbst nicht hast.',
        );
        // Ending the Besetzung of a member who was deactivated later must stay possible.
        const bisher = posten?.besetzungen.find((b) => b.id === c.req.param('bid'));
        if (bisher?.mitgliedSub !== daten.mitgliedSub) {
          await mitgliedMussExistieren(daten.mitgliedSub);
        }
        const geaendert = await deps.posten
          .besetzungAendern(c.req.param('id'), c.req.param('bid'), daten)
          .catch(besetzungFehler);
        if (!geaendert) {
          throw new HTTPException(404, { message: 'Besetzung nicht gefunden' });
        }
        return c.json({ ok: true });
      },
    )
    .delete('/posten/:id/besetzungen/:bid', auth, postenBearbeiten, async (c) => {
      if (!(await deps.posten.besetzungLoeschen(c.req.param('id'), c.req.param('bid')))) {
        throw new HTTPException(404, { message: 'Besetzung nicht gefunden' });
      }
      return c.json({ ok: true });
    })
    .put(
      '/admin/posten/:id/rechte',
      auth,
      adminOnly,
      zValidator('json', postenRechteSetzenSchema),
      async (c) => {
        const { rechte } = c.req.valid('json');
        if (!(await deps.posten.rechteSetzen(c.req.param('id'), rechte))) {
          throw new HTTPException(404, { message: 'Posten nicht gefunden' });
        }
        return c.json({ rechte });
      },
    );
  // ----- Schlüssel;
};
