import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  RECHNUNGEN_MAX,
  rechnungDateiSchema,
  rechnungDateiSchluessel,
  rechnungDateiUploadSchema,
  rechnungEinstellungenEingabeSchema,
  rechnungEntwurfSchema,
  rechnungStellenSchema,
  rechnungStornoSchema,
  rechnungZahlungSchema,
  rechnungenAbfrageSchema,
  rechnungsempfaengerAendernSchema,
  rechnungsempfaengerEingabeSchema,
  type RechnungDetailDto,
  type RechnungEinstellungenDto,
  type RechnungEmpfaengerAnzeigeDto,
  type RechnungEntwurfDaten,
  type RechnungEntwurfDto,
  type RechnungUploadDto,
  type RechnungenSeiteDto,
  type RechnungsempfaengerDto,
} from '@c4/shared';
import { BuchungUngueltig, FestschreibungKonflikt, StornoKonflikt } from '../finanzen';
import {
  BelegWarnungenOffen,
  RechnungKonflikt,
  type RechnungEmpfaengerErgebnis,
} from '../finanzenRechnungen';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';
import { finanzenMitgliederLaden } from './finanzenMitglieder';

export const finanzenRechnungenRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, finanzenLesen, finanzenBuchen, finanzenVerwalten, gefunden } = ctx;

  const rechnungFehler = (err: unknown): never => {
    if (err instanceof BuchungUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof RechnungKonflikt) throw new HTTPException(409, { message: err.message });
    if (err instanceof StornoKonflikt) throw new HTTPException(409, { message: err.message });
    if (err instanceof FestschreibungKonflikt)
      throw new HTTPException(409, { message: err.message });
    throw err;
  };

  const archivPruefen = () => {
    if (!deps.finanzarchiv.eingerichtet)
      throw new HTTPException(503, { message: 'Das Finanzarchiv ist nicht eingerichtet.' });
  };

  /** Name and address of a member as printed on a Rechnung, or why they cannot be used. */
  const mitgliedEmpfaenger = async (sub: string): Promise<RechnungEmpfaengerErgebnis> => {
    const [row, mitglied] = await Promise.all([
      deps.mitglieder.holen(sub),
      finanzenMitgliederLaden(deps),
    ]);
    if (!row) return { fehler: 'Das Mitglied gibt es nicht.' };
    const adresse = row.adresse?.trim();
    const name = `${row.vorname} ${row.nachname}`;
    if (!adresse)
      return {
        fehler: `Für ${mitglied(sub)?.username ?? name} ist im Profil keine Adresse hinterlegt.`,
      };
    return { mitgliedSub: sub, empfaengerId: null, name, anschrift: adresse, ustId: null };
  };

  const empfaengerAnzeige = async (
    daten: RechnungEntwurfDaten,
  ): Promise<RechnungEmpfaengerAnzeigeDto | null> => {
    const e = daten.empfaenger;
    if (!e) return null;
    if (e.typ === 'mitglied') {
      const [row, mitglied] = await Promise.all([
        deps.mitglieder.holen(e.sub),
        finanzenMitgliederLaden(deps),
      ]);
      const adresse = row?.adresse?.trim() || null;
      return {
        typ: 'mitglied',
        name: row ? `${row.vorname} ${row.nachname}` : 'Unbekannt',
        anschrift: adresse,
        mitglied: mitglied(e.sub),
        adresseFehlt: adresse === null,
      };
    }
    const extern = (await deps.finanzen.rechnungsempfaenger(true)).find((x) => x.id === e.id);
    return {
      typ: 'extern',
      name: extern?.name ?? 'Unbekannt',
      anschrift: extern?.anschrift ?? null,
      mitglied: null,
      adresseFehlt: false,
    };
  };

  return (
    new Hono<AuthEnv>()
      // ----- Einstellungen (club data on the invoices)
      .get('/finanzen/rechnung-einstellungen', auth, finanzenLesen, async (c) => {
        const [e, mitglied, vorstand] = await Promise.all([
          deps.finanzen.rechnungEinstellungen(),
          finanzenMitgliederLaden(deps),
          deps.posten.vorstandAm(),
        ]);
        const dto: RechnungEinstellungenDto | null = e
          ? {
              ...e,
              erstelltVon: mitglied(e.erstelltVon),
              vorstand: vorstand.flatMap((v) => {
                const m = mitglied(v.sub);
                return m ? [{ postenId: v.postenId, postenName: v.postenName, mitglied: m }] : [];
              }),
            }
          : null;
        return c.json(dto);
      })
      .post(
        '/finanzen/rechnung-einstellungen',
        auth,
        finanzenVerwalten,
        zValidator('json', rechnungEinstellungenEingabeSchema),
        async (c) => {
          const eingabe = c.req.valid('json');
          if (eingabe.erloesKontoWaren) {
            const konto = (await deps.finanzen.konten(false)).find(
              (k) => k.id === eingabe.erloesKontoWaren,
            );
            if (!konto || konto.art !== 'erloes')
              throw new HTTPException(400, {
                message: 'Die Erlös-Kategorie für Waren gibt es nicht.',
              });
          }
          const id = await deps.finanzen.rechnungEinstellungenSpeichern(eingabe, c.get('user').sub);
          return c.json({ id }, 201);
        },
      )
      // ----- External recipients
      .get('/finanzen/rechnungsempfaenger', auth, finanzenLesen, async (c) => {
        const dto: RechnungsempfaengerDto[] = await deps.finanzen.rechnungsempfaenger(
          c.req.query('archiviert') === '1',
        );
        return c.json(dto);
      })
      .post(
        '/finanzen/rechnungsempfaenger',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungsempfaengerEingabeSchema),
        async (c) => {
          const id = await deps.finanzen
            .rechnungsempfaengerAnlegen(c.req.valid('json'))
            .catch(rechnungFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/finanzen/rechnungsempfaenger/:id',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungsempfaengerAendernSchema),
        async (c) => {
          gefunden(
            await deps.finanzen
              .rechnungsempfaengerAendern(c.req.param('id'), c.req.valid('json'))
              .catch(rechnungFehler),
            'Empfänger nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Drafts
      .post(
        '/finanzen/rechnung-entwuerfe',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungEntwurfSchema),
        async (c) => {
          const id = await deps.finanzen.rechnungEntwurfAnlegen(
            c.req.valid('json').daten,
            c.get('user').sub,
          );
          return c.json({ id }, 201);
        },
      )
      .get('/finanzen/rechnung-entwuerfe/:id', auth, finanzenLesen, async (c) => {
        const id = c.req.param('id');
        const [e, warnungen, mitglied] = await Promise.all([
          deps.finanzen.rechnungEntwurf(id),
          deps.finanzen.rechnungEntwurfWarnungen(id),
          finanzenMitgliederLaden(deps),
        ]);
        const entwurf = gefunden(e, 'Entwurf nicht gefunden');
        const dto: RechnungEntwurfDto = {
          id: entwurf.id,
          daten: entwurf.daten,
          empfaenger: await empfaengerAnzeige(entwurf.daten),
          warnungen: warnungen ?? [],
          erstelltVon: mitglied(entwurf.erstelltVon),
          erstelltAm: entwurf.erstelltAm,
          geaendertAm: entwurf.geaendertAm,
        };
        return c.json(dto);
      })
      .put(
        '/finanzen/rechnung-entwuerfe/:id',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungEntwurfSchema),
        async (c) => {
          gefunden(
            await deps.finanzen.rechnungEntwurfSpeichern(
              c.req.param('id'),
              c.req.valid('json').daten,
            ),
            'Entwurf nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/finanzen/rechnung-entwuerfe/:id', auth, finanzenBuchen, async (c) => {
        gefunden(
          await deps.finanzen.rechnungEntwurfLoeschen(c.req.param('id')),
          'Entwurf nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .post(
        '/finanzen/rechnung-entwuerfe/:id/stellen',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungStellenSchema),
        async (c) => {
          const id = c.req.param('id');
          const entwurf = await deps.finanzen.rechnungEntwurf(id);
          const empfaenger = entwurf?.daten.empfaenger;
          const mitglied =
            empfaenger?.typ === 'mitglied' ? await mitgliedEmpfaenger(empfaenger.sub) : null;
          try {
            const ergebnis = gefunden(
              await deps.finanzen.rechnungStellen(
                id,
                c.req.valid('json'),
                c.get('user').sub,
                mitglied,
              ),
              'Entwurf nicht gefunden',
            );
            return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
          } catch (err) {
            if (err instanceof BelegWarnungenOffen)
              return c.json({ error: err.message, warnungen: err.warnungen }, 409);
            return rechnungFehler(err);
          }
        },
      )
      // ----- Issued Rechnungen
      .get(
        '/finanzen/rechnungen',
        auth,
        finanzenLesen,
        zValidator('query', rechnungenAbfrageSchema),
        async (c) => {
          const [liste, mitglied] = await Promise.all([
            deps.finanzen.rechnungen({ ...c.req.valid('query'), limit: RECHNUNGEN_MAX }),
            finanzenMitgliederLaden(deps),
          ]);
          const dto: RechnungenSeiteDto = {
            rechnungen: liste.eintraege.map(({ mitgliedSub, ...rest }) => ({
              ...rest,
              mitglied: mitgliedSub ? mitglied(mitgliedSub) : null,
            })),
            gekappt: liste.gekappt,
            offeneSummeCent: liste.offeneSummeCent,
            ueberfaelligAnzahl: liste.ueberfaelligAnzahl,
          };
          return c.json(dto);
        },
      )
      .get('/finanzen/rechnungen/:id', auth, finanzenLesen, async (c) => {
        const [r, mitglied] = await Promise.all([
          deps.finanzen.rechnung(c.req.param('id')),
          finanzenMitgliederLaden(deps),
        ]);
        const { mitgliedSub, erstelltVon, datei, ...rechnung } = gefunden(
          r,
          'Rechnung nicht gefunden',
        );
        const dto: RechnungDetailDto = {
          ...rechnung,
          mitglied: mitgliedSub ? mitglied(mitgliedSub) : null,
          erstelltVon: mitglied(erstelltVon),
          datei: datei && {
            ...datei,
            url: await deps.finanzarchiv.anzeigeUrl(rechnungDateiSchluessel(datei.sha256)),
          },
        };
        return c.json(dto);
      })
      .post(
        '/finanzen/rechnungen/:id/zahlung',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungZahlungSchema),
        async (c) => {
          try {
            const ergebnis = gefunden(
              await deps.finanzen.rechnungZahlen(
                c.req.param('id'),
                c.req.valid('json'),
                c.get('user').sub,
              ),
              'Rechnung nicht gefunden',
            );
            return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
          } catch (err) {
            if (err instanceof BelegWarnungenOffen)
              return c.json({ error: err.message, warnungen: err.warnungen }, 409);
            return rechnungFehler(err);
          }
        },
      )
      .post(
        '/finanzen/rechnungen/:id/storno',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungStornoSchema),
        async (c) => {
          const ergebnis = gefunden(
            await deps.finanzen
              .rechnungStornieren(c.req.param('id'), c.req.valid('json'), c.get('user').sub)
              .catch(rechnungFehler),
            'Rechnung nicht gefunden',
          );
          return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
        },
      )
      .post('/finanzen/rechnungen/:id/kopieren', auth, finanzenBuchen, async (c) => {
        const id = gefunden(
          await deps.finanzen
            .rechnungKopieren(c.req.param('id'), c.get('user').sub)
            .catch(rechnungFehler),
          'Rechnung nicht gefunden',
        );
        return c.json({ id }, 201);
      })
      // ----- PDF in the archive: presigned upload, then register the file at the Rechnung
      .post(
        '/finanzen/rechnung-dateien/upload',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungDateiUploadSchema),
        async (c) => {
          const { rechnungId, sha256, groesse } = c.req.valid('json');
          archivPruefen();
          gefunden(await deps.finanzen.rechnung(rechnungId), 'Rechnung nicht gefunden');
          const upload = await deps.finanzarchiv.uploadVorbereiten({
            sha256,
            groesse,
            typ: 'application/pdf',
            schluessel: rechnungDateiSchluessel(sha256),
          });
          const dto: RechnungUploadDto = upload;
          return c.json(dto);
        },
      )
      .post(
        '/finanzen/rechnungen/:id/datei',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungDateiSchema),
        async (c) => {
          archivPruefen();
          const ergebnis = await deps.finanzen.rechnungDateiRegistrieren(
            c.req.param('id'),
            c.req.valid('json'),
          );
          if (ergebnis === 'fehlt')
            throw new HTTPException(404, { message: 'Rechnung nicht gefunden' });
          if (ergebnis === 'vorhanden')
            throw new HTTPException(409, { message: 'Die Rechnung hat schon ein PDF.' });
          return c.json({ ok: true }, 201);
        },
      )
  );
};
