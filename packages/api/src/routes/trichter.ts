import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  heuteBerlin,
  durchgangEingabeSchema,
  jahreMitEintraegen,
  koenige,
  literZuMl,
  rangliste,
  trichterAendernSchema,
  trichterEingabeSchema,
  TRICHTER_DURCHGAENGE_SEITE,
  TRICHTER_JAHR_ABGESCHLOSSEN,
  jahrBerlin,
  type DurchgaengeSeiteDto,
  type DurchgangDto,
  type TrichterDto,
  type TrichterMitgliedDto,
  type TrichterUebersichtDto,
} from '@c4/shared';
import { type DurchgangDaten, type TrichterDaten } from '../trichter';
import { istDeaktiviert } from '../mitglieder';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';
import { cursorSchreiben, cursorLesen, MITGLIED_DEAKTIVIERT } from './kontext';

export const trichterRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, trichterLesen, trichterVerwalten, eigenesProfilMussExistieren, gefunden } =
    ctx;

  /** Display data of members in Trichter DTOs; unknown members get a placeholder. */
  const trichterMitglieder = async () => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const zeilen = new Map(rows.map((r) => [r.sub, r]));
    return (sub: string): TrichterMitgliedDto => {
      const zeile = zeilen.get(sub);
      return {
        sub,
        username: konten.get(sub)?.username ?? null,
        vorname: zeile?.vorname ?? '',
        nachname: zeile?.nachname ?? '',
        status: zeile?.status ?? 'anwaerter',
        anrede: zeile?.anrede ?? 'neutral',
      };
    };
  };

  const alsTrichterDto = (t: TrichterDaten): TrichterDto => ({
    id: t.id,
    name: t.name,
    volumenMl: t.volumenMl,
    auslaesse: t.auslaesse,
    archiviert: t.archiviert,
  });

  const alsDurchgangDto = (
    d: DurchgangDaten,
    mitglied: (sub: string) => TrichterMitgliedDto,
    aufrufer: { sub: string; permissions: readonly string[] },
  ): DurchgangDto => ({
    id: d.id,
    trichter: { id: d.trichterId, name: d.trichterName },
    volumenMl: d.volumenMl,
    zeitpunkt: d.zeitpunkt.toISOString(),
    teilnehmende: d.teilnehmende.map(mitglied),
    eingetragenVon: mitglied(d.eingetragenVon),
    eingetragenAm: d.eingetragenAm.toISOString(),
    darfLoeschen:
      d.eingetragenVon === aufrufer.sub || aufrufer.permissions.includes('trichter:verwalten'),
  });

  return (
    new Hono<AuthEnv>()
      .get('/trichter', auth, trichterLesen, async (c) => {
        const mitArchiv = c.req.query('archiviert') === '1';
        return c.json((await deps.trichter.alle(mitArchiv)).map(alsTrichterDto));
      })
      .post(
        '/trichter',
        auth,
        trichterVerwalten,
        zValidator('json', trichterEingabeSchema),
        async (c) => {
          const { name, volumenL, auslaesse } = c.req.valid('json');
          const id = await deps.trichter.anlegen({
            name,
            volumenMl: literZuMl(volumenL),
            auslaesse,
          });
          return c.json({ id }, 201);
        },
      )
      .put(
        '/trichter/:id',
        auth,
        trichterVerwalten,
        zValidator('json', trichterAendernSchema),
        async (c) => {
          const { volumenL, ...rest } = c.req.valid('json');
          const daten = {
            ...(rest.name !== undefined && { name: rest.name }),
            ...(rest.auslaesse !== undefined && { auslaesse: rest.auslaesse }),
            ...(rest.archiviert !== undefined && { archiviert: rest.archiviert }),
            ...(volumenL !== undefined && { volumenMl: literZuMl(volumenL) }),
          };
          gefunden(
            await deps.trichter.aktualisieren(c.req.param('id'), daten),
            'Trichter nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // Kings of the current year and of all time, the ranking for `jahr` (a year or `alle`).
      .get('/trichter/uebersicht', auth, trichterLesen, async (c) => {
        const wert = c.req.query('jahr') ?? 'alle';
        const jahr = wert === 'alle' ? null : Number(wert);
        if (jahr !== null && !Number.isInteger(jahr)) {
          throw new HTTPException(400, { message: 'Ungültiges Jahr.' });
        }
        const aktuellesJahr = Number(heuteBerlin().slice(0, 4));
        const [durchgaenge, mitglied] = await Promise.all([
          deps.trichter.fuerRangliste(),
          trichterMitglieder(),
        ]);
        const dto: TrichterUebersichtDto = {
          aktuellesJahr,
          jahr,
          jahreskoenige: koenige(rangliste(durchgaenge, aktuellesJahr)).map(mitglied),
          ewigeKoenige: koenige(rangliste(durchgaenge, null)).map(mitglied),
          rangliste: rangliste(durchgaenge, jahr).map((z) => ({
            mitglied: mitglied(z.sub),
            anzahl: z.anzahl,
            ml: z.ml,
          })),
          jahre: jahreMitEintraegen(durchgaenge),
        };
        return c.json(dto);
      })
      // Durchgänge page by page, newest first; `weiter` is the `vor` cursor of the next page.
      .get('/trichter/durchgaenge', auth, trichterLesen, async (c) => {
        const vor = cursorLesen(c.req.query('vor'));
        const [liste, mitglied] = await Promise.all([
          deps.trichter.durchgaenge(
            TRICHTER_DURCHGAENGE_SEITE + 1,
            vor && { zeitpunkt: vor.erstelltAm, id: vor.id },
          ),
          trichterMitglieder(),
        ]);
        const seite = liste.slice(0, TRICHTER_DURCHGAENGE_SEITE);
        const letzte = seite.at(-1);
        const aufrufer = { sub: c.get('user').sub, permissions: c.get('permissions') };
        const dto: DurchgaengeSeiteDto = {
          durchgaenge: seite.map((d) => alsDurchgangDto(d, mitglied, aufrufer)),
          weiter:
            liste.length > seite.length && letzte
              ? cursorSchreiben({ erstelltAm: letzte.zeitpunkt, id: letzte.id })
              : null,
        };
        return c.json(dto);
      })
      .post(
        '/trichter/durchgaenge',
        auth,
        trichterLesen,
        zValidator('json', durchgangEingabeSchema),
        async (c) => {
          const eingabe = c.req.valid('json');
          const sub = c.get('user').sub;
          if (eingabe.teilnehmende.includes(sub)) {
            throw new HTTPException(400, {
              message: 'Du kannst dich nicht selbst eintragen. Das machen die anderen für dich.',
            });
          }
          if (eingabe.zeitpunkt && jahrBerlin(eingabe.zeitpunkt) < jahrBerlin(new Date())) {
            throw new HTTPException(400, { message: TRICHTER_JAHR_ABGESCHLOSSEN });
          }
          const t = await deps.trichter.holen(eingabe.trichterId);
          if (!t) throw new HTTPException(400, { message: 'Trichter nicht gefunden.' });
          if (t.archiviert) {
            throw new HTTPException(400, { message: 'Dieser Trichter ist archiviert.' });
          }
          if (eingabe.teilnehmende.length > t.auslaesse) {
            throw new HTTPException(400, {
              message: `Dieser Trichter hat nur ${t.auslaesse} Auslässe.`,
            });
          }
          const volumenMl = literZuMl(eingabe.volumenL);
          if (volumenMl > t.volumenMl) {
            throw new HTTPException(400, {
              message: 'Das Volumen ist größer als das des Trichters.',
            });
          }
          await eigenesProfilMussExistieren(sub);
          // Like the member list: profile rows plus enabled accounts that have no profile yet.
          const [rows, konten] = await Promise.all([
            deps.mitglieder.alle(),
            deps.userAdmin.konten(),
          ]);
          const profile = new Set(rows.map((r) => r.sub));
          if (eingabe.teilnehmende.some((s) => !profile.has(s) && !konten.get(s)?.enabled)) {
            throw new HTTPException(400, { message: 'Mitglied nicht gefunden.' });
          }
          const deaktiviert = new Set(rows.filter(istDeaktiviert).map((r) => r.sub));
          if (eingabe.teilnehmende.some((s) => deaktiviert.has(s))) {
            throw new HTTPException(400, { message: MITGLIED_DEAKTIVIERT });
          }
          const id = await deps.trichter.durchgangAnlegen({
            trichterId: t.id,
            volumenMl,
            zeitpunkt: eingabe.zeitpunkt ? new Date(eingabe.zeitpunkt) : new Date(),
            eingetragenVon: sub,
            teilnehmende: eingabe.teilnehmende,
          });
          return c.json({ id }, 201);
        },
      )
      .delete('/trichter/durchgaenge/:id', auth, trichterLesen, async (c) => {
        const d = gefunden(
          await deps.trichter.durchgang(c.req.param('id')),
          'Durchgang nicht gefunden',
        );
        if (
          d.eingetragenVon !== c.get('user').sub &&
          !c.get('permissions').includes('trichter:verwalten')
        ) {
          throw new HTTPException(403, { message: 'Forbidden' });
        }
        if (jahrBerlin(d.zeitpunkt) < jahrBerlin(new Date())) {
          throw new HTTPException(400, { message: TRICHTER_JAHR_ABGESCHLOSSEN });
        }
        await deps.trichter.durchgangLoeschen(d.id);
        return c.json({ ok: true });
      })
  );
  // ----- Finanzen (see docs/finanzen.md). Bookings are insert-only: no PUT/DELETE on them.;
};
