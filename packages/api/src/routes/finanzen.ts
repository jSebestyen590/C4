import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  BELEGE_MAX,
  belegBuchenSchema,
  belegEinreichenSchema,
  steuersatzGueltigAm,
  steuersatzZeitraumEingabeSchema,
  type SteuersatzZeitraumDto,
  belegEntwurfDatenSchema,
  belegVerwerfenSchema,
  formatEuro,
  type EinreichungDetailDto,
  type EinreichungAuswahlDto,
  type EinreichungDto,
  belegDateiUploadSchema,
  belegEntwurfSchema,
  artikelAendernSchema,
  belegeAbfrageSchema,
  type ArtikelDto,
  erstattungEingabeSchema,
  rechnungsstellerAendernSchema,
  rechnungsstellerEingabeSchema,
  warengruppeKategorieSchema,
  type AuslageMitgliedDto,
  type AuslagenDto,
  type BelegDetailDto,
  type BelegEntwurfDto,
  type BelegeSeiteDto,
  type BelegListeDto,
  type BelegUploadDto,
  type ArtikelKategorieVorschlaege,
  type BelegWareDto,
  type WarengruppeKategorieDto,
  buchungEingabeSchema,
  JOURNAL_MAX,
  kasseAendernSchema,
  kasseEingabeSchema,
  KASSENABRECHNUNGEN_MAX,
  kassenabrechnungEingabeSchema,
  kassenabrechnungenAbfrageSchema,
  kassenzaehlungEingabeSchema,
  kassenzaehlungenAbfrageSchema,
  eventKassenSchema,
  type EventKassenDto,
  type KasseDto,
  type KasseKurzDto,
  type KassenabrechnungDetailDto,
  type KassenabrechnungListeDto,
  type KassenabrechnungenSeiteDto,
  type KassenabrechnungVorschauDto,
  type KassenzaehlungDto,
  journalAbfrageSchema,
  kontoAendernSchema,
  kontoArchivSchema,
  kontoEingabeSchema,
  pruefeKette,
  stornoEingabeSchema,
  type BuchungDetailDto,
  type BuchungenSeiteDto,
  type BuchungListeDto,
  type FinanzMitgliedDto,
  type BargeldUebersichtDto,
  type ZaehlungDetailDto,
  type ZaehlungListeDto,
  type ZaehlungenSeiteDto,
  zaehlungEingabeSchema,
  zaehlungenAbfrageSchema,
  ZAEHLUNGEN_MAX,
  type KettenErgebnisDto,
  type KontoDto,
} from '@c4/shared';
import { BuchungUngueltig, KontoKonflikt, KontoUngueltig, StornoKonflikt } from '../finanzen';
import { BelegWarnungenOffen, type EinreichungEintrag } from '../finanzenBelege';
import { bestEffort, type Sendung } from '../benachrichtigungen';
import { mitgliederMitRecht } from '../privatpartyBenachrichtigungen';
import { WarenKonflikt, WarenUngueltig } from '../waren';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const finanzenRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    kasseZaehlen,
    finanzenLesen,
    finanzenBuchen,
    belegeEinreichen,
    finanzenVerwalten,
    finanzenPruefen,
    gefunden,
  } = ctx;

  /** Display data of the creators in Finanzen DTOs; null if the member has no profile any more. */
  const finanzenMitglieder = async () => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const zeilen = new Map(rows.map((r) => [r.sub, r]));
    return (sub: string): FinanzMitgliedDto | null => {
      const zeile = zeilen.get(sub);
      if (!zeile) return null;
      return {
        sub,
        username: konten.get(sub)?.username ?? null,
        vorname: zeile.vorname,
        nachname: zeile.nachname,
        status: zeile.status,
        anrede: zeile.anrede ?? 'neutral',
      };
    };
  };

  const anzeigeName = (m: FinanzMitgliedDto | null) =>
    m ? (m.username ?? `${m.vorname} ${m.nachname}`) : 'Jemand';

  /** Sends a push after the request's work is done; a failure never fails the request. */
  const pushSenden = (sendung: () => Promise<Sendung | null>) =>
    bestEffort(async () => {
      const s = await sendung();
      if (s) await deps.benachrichtigungen.senden(s);
    });

  /** `belege.status` push to the submitter of a Beleg. */
  const statusPush = (sub: string, titel: string, text: string) =>
    pushSenden(async () => ({
      subs: [sub],
      art: 'belege.status',
      titel,
      text,
      url: '/app/belege',
    }));

  /** The own submission without the file reference, plus the presigned URL for the detail view. */
  const einreichungDto = (e: EinreichungEintrag): EinreichungDto => ({
    id: e.id,
    status: e.status,
    belegdatum: e.belegdatum,
    betragCent: e.betragCent,
    rechnungssteller: e.rechnungssteller,
    notiz: e.notiz,
    verworfenGrund: e.verworfenGrund,
    belegNummer: e.belegNummer,
    eingereichtAm: e.eingereichtAm,
  });

  /** Maps the domain errors of the Finanzen store to HTTP statuses. */
  const finanzenFehler = (err: unknown): never => {
    if (err instanceof BuchungUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof KontoUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof StornoKonflikt) throw new HTTPException(409, { message: err.message });
    if (err instanceof KontoKonflikt) throw new HTTPException(409, { message: err.message });
    if (err instanceof WarenUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof WarenKonflikt) throw new HTTPException(409, { message: err.message });
    throw err;
  };

  return (
    new Hono<AuthEnv>()
      .get('/finanzen/konten', auth, finanzenLesen, async (c) => {
        const mitArchiv = c.req.query('archiviert') === '1';
        const dto: KontoDto[] = await deps.finanzen.konten(mitArchiv);
        return c.json(dto);
      })
      .post(
        '/finanzen/konten',
        auth,
        finanzenVerwalten,
        zValidator('json', kontoEingabeSchema),
        async (c) => {
          const id = await deps.finanzen.kontoAnlegen(c.req.valid('json')).catch(finanzenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/finanzen/konten/:id/archiv',
        auth,
        finanzenVerwalten,
        zValidator('json', kontoArchivSchema),
        async (c) => {
          gefunden(
            await deps.finanzen.kontoArchivieren(c.req.param('id'), c.req.valid('json').archiviert),
            'Konto nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .put(
        '/finanzen/konten/:id',
        auth,
        finanzenVerwalten,
        zValidator('json', kontoAendernSchema),
        async (c) => {
          const daten = c.req.valid('json');
          gefunden(
            await deps.finanzen
              .kontoAendern(c.req.param('id'), {
                ...(daten.name !== undefined && { name: daten.name }),
                ...(daten.art !== undefined && { art: daten.art }),
                ...(daten.parentId !== undefined && { parentId: daten.parentId }),
                ...(daten.stueckelung !== undefined && { stueckelung: daten.stueckelung }),
                ...(daten.steuersatzArt !== undefined && {
                  steuersatzArt: daten.steuersatzArt,
                }),
              })
              .catch(finanzenFehler),
            'Konto nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // The whole journal matching the filters, newest first, capped at JOURNAL_MAX (the page
      // sorts it itself); `gekappt` says that older matches were left out.
      .get(
        '/finanzen/buchungen',
        auth,
        finanzenLesen,
        zValidator('query', journalAbfrageSchema),
        async (c) => {
          const abfrage = c.req.valid('query');
          const [liste, mitglied] = await Promise.all([
            deps.finanzen.journal({ ...abfrage, limit: JOURNAL_MAX + 1 }),
            finanzenMitglieder(),
          ]);
          const dto: BuchungenSeiteDto = {
            buchungen: liste.slice(0, JOURNAL_MAX).map((b): BuchungListeDto => ({
              ...b,
              erstelltVon: mitglied(b.erstelltVon),
            })),
            gekappt: liste.length > JOURNAL_MAX,
          };
          return c.json(dto);
        },
      )
      .get('/finanzen/buchungen/:id', auth, finanzenLesen, async (c) => {
        const [b, mitglied] = await Promise.all([
          deps.finanzen.buchung(c.req.param('id')),
          finanzenMitglieder(),
        ]);
        const buchung = gefunden(b, 'Buchung nicht gefunden');
        const dto: BuchungDetailDto = { ...buchung, erstelltVon: mitglied(buchung.erstelltVon) };
        return c.json(dto);
      })
      .post(
        '/finanzen/buchungen',
        auth,
        finanzenBuchen,
        zValidator('json', buchungEingabeSchema),
        async (c) => {
          const ergebnis = await deps.finanzen
            .buchen(c.req.valid('json'), c.get('user').sub)
            .catch(finanzenFehler);
          return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
        },
      )
      .post(
        '/finanzen/buchungen/:id/storno',
        auth,
        finanzenBuchen,
        zValidator('json', stornoEingabeSchema),
        async (c) => {
          const ergebnis = gefunden(
            await deps.finanzen
              .stornieren(c.req.param('id'), c.req.valid('json'), c.get('user').sub)
              .catch(finanzenFehler),
            'Buchung nicht gefunden',
          );
          return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
        },
      )
      // Bargeld: the Fächer of the Safe with their stock, and the Zählung protocol.
      .get('/finanzen/bargeld', auth, finanzenLesen, async (c) => {
        const dto: BargeldUebersichtDto = await deps.finanzen.bargeld();
        return c.json(dto);
      })
      .post(
        '/finanzen/zaehlungen',
        auth,
        finanzenBuchen,
        zValidator('json', zaehlungEingabeSchema),
        async (c) => {
          const ergebnis = await deps.finanzen
            .zaehlen(c.req.valid('json'), c.get('user').sub)
            .catch(finanzenFehler);
          return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
        },
      )
      .get(
        '/finanzen/zaehlungen',
        auth,
        finanzenLesen,
        zValidator('query', zaehlungenAbfrageSchema),
        async (c) => {
          const [liste, mitglied] = await Promise.all([
            deps.finanzen.zaehlungen({ ...c.req.valid('query'), limit: ZAEHLUNGEN_MAX + 1 }),
            finanzenMitglieder(),
          ]);
          const dto: ZaehlungenSeiteDto = {
            zaehlungen: liste.slice(0, ZAEHLUNGEN_MAX).map((z): ZaehlungListeDto => ({
              ...z,
              gezaehltVon: mitglied(z.gezaehltVon),
            })),
            gekappt: liste.length > ZAEHLUNGEN_MAX,
          };
          return c.json(dto);
        },
      )
      .get('/finanzen/zaehlungen/:id', auth, finanzenLesen, async (c) => {
        const [z, mitglied] = await Promise.all([
          deps.finanzen.zaehlung(c.req.param('id')),
          finanzenMitglieder(),
        ]);
        const zaehlung = gefunden(z, 'Zählung nicht gefunden');
        const dto: ZaehlungDetailDto = { ...zaehlung, gezaehltVon: mitglied(zaehlung.gezaehltVon) };
        return c.json(dto);
      })
      // Barkassen: master data, Abrechnung by the Finanzer:in and the Dienst-Zählung at events.
      .get('/finanzen/kassen', auth, finanzenLesen, async (c) => {
        const dto: KasseDto[] = await deps.finanzen.kassen(c.req.query('archiviert') === '1');
        return c.json(dto);
      })
      .post(
        '/finanzen/kassen',
        auth,
        finanzenVerwalten,
        zValidator('json', kasseEingabeSchema),
        async (c) => {
          const kontoId = await deps.finanzen
            .kasseAnlegen(c.req.valid('json'))
            .catch(finanzenFehler);
          return c.json({ kontoId }, 201);
        },
      )
      .put(
        '/finanzen/kassen/:kontoId',
        auth,
        finanzenVerwalten,
        zValidator('json', kasseAendernSchema),
        async (c) => {
          gefunden(
            await deps.finanzen
              .kasseAendern(c.req.param('kontoId'), c.req.valid('json'))
              .catch(finanzenFehler),
            'Kasse nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get('/finanzen/kassen/:kontoId/abrechnung', auth, finanzenLesen, async (c) => {
        const [v, mitglied] = await Promise.all([
          deps.finanzen.kassenAbrechnungVorschau(c.req.param('kontoId')),
          finanzenMitglieder(),
        ]);
        const vorschau = gefunden(v, 'Kasse nicht gefunden');
        const dto: KassenabrechnungVorschauDto = {
          ...vorschau,
          zaehlungen: vorschau.zaehlungen.map((z) => ({
            ...z,
            gezaehltVon: mitglied(z.gezaehltVon),
          })),
        };
        return c.json(dto);
      })
      .post(
        '/finanzen/kassenabrechnungen',
        auth,
        finanzenBuchen,
        zValidator('json', kassenabrechnungEingabeSchema),
        async (c) => {
          const ergebnis = await deps.finanzen
            .kasseAbrechnen(c.req.valid('json'), c.get('user').sub)
            .catch(finanzenFehler);
          return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
        },
      )
      .get(
        '/finanzen/kassenabrechnungen',
        auth,
        finanzenLesen,
        zValidator('query', kassenabrechnungenAbfrageSchema),
        async (c) => {
          const [liste, mitglied] = await Promise.all([
            deps.finanzen.kassenabrechnungen({
              ...c.req.valid('query'),
              limit: KASSENABRECHNUNGEN_MAX + 1,
            }),
            finanzenMitglieder(),
          ]);
          const dto: KassenabrechnungenSeiteDto = {
            abrechnungen: liste
              .slice(0, KASSENABRECHNUNGEN_MAX)
              .map((a): KassenabrechnungListeDto => ({
                ...a,
                erstelltVon: mitglied(a.erstelltVon),
              })),
            gekappt: liste.length > KASSENABRECHNUNGEN_MAX,
          };
          return c.json(dto);
        },
      )
      .get('/finanzen/kassenabrechnungen/:id', auth, finanzenLesen, async (c) => {
        const [a, mitglied] = await Promise.all([
          deps.finanzen.kassenabrechnung(c.req.param('id')),
          finanzenMitglieder(),
        ]);
        const abrechnung = gefunden(a, 'Kassenabrechnung nicht gefunden');
        const dto: KassenabrechnungDetailDto = {
          ...abrechnung,
          erstelltVon: mitglied(abrechnung.erstelltVon),
        };
        return c.json(dto);
      })
      // The Kassen of an event (Finanzer:in): explicit list, or back to the default of the Kategorie.
      .put(
        '/finanzen/events/:eventId/kassen',
        auth,
        finanzenBuchen,
        zValidator('json', eventKassenSchema),
        async (c) => {
          gefunden(
            await deps.finanzen
              .eventKassenFestlegen(c.req.param('eventId'), c.req.valid('json').kontoIds)
              .catch(finanzenFehler),
            'Event nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/finanzen/events/:eventId/kassen', auth, finanzenBuchen, async (c) => {
        gefunden(
          await deps.finanzen
            .eventKassenFestlegen(c.req.param('eventId'), null)
            .catch(finanzenFehler),
          'Event nicht gefunden',
        );
        return c.json({ ok: true });
      })
      // For everyone who may count: the active Kassen without stock and the counts of an event.
      .get('/kassen', auth, kasseZaehlen, async (c) => {
        const dto: KasseKurzDto[] = await deps.finanzen.kassenKurz();
        return c.json(dto);
      })
      .get(
        '/kassen/zaehlungen',
        auth,
        kasseZaehlen,
        zValidator('query', kassenzaehlungenAbfrageSchema),
        async (c) => {
          const [e, mitglied] = await Promise.all([
            deps.finanzen.eventKassen(c.req.valid('query').eventId),
            finanzenMitglieder(),
          ]);
          const eintrag = gefunden(e, 'Event nicht gefunden');
          const dto: EventKassenDto = {
            ...eintrag,
            zaehlungen: eintrag.zaehlungen.map((z): KassenzaehlungDto => ({
              ...z,
              gezaehltVon: mitglied(z.gezaehltVon),
            })),
          };
          return c.json(dto);
        },
      )
      .post(
        '/kassen/zaehlungen',
        auth,
        kasseZaehlen,
        zValidator('json', kassenzaehlungEingabeSchema),
        async (c) => {
          const ergebnis = await deps.finanzen
            .kasseZaehlen(c.req.valid('json'), c.get('user').sub)
            .catch(finanzenFehler);
          return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
        },
      )
      // Belege: Rechnungssteller, drafts, booking, file upload and the Auslagen of members.
      .get('/finanzen/rechnungssteller', auth, finanzenLesen, async (c) =>
        c.json(await deps.finanzen.rechnungssteller(c.req.query('archiviert') === '1')),
      )
      .post(
        '/finanzen/rechnungssteller',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungsstellerEingabeSchema),
        async (c) => {
          const id = await deps.finanzen
            .rechnungsstellerAnlegen(c.req.valid('json').name)
            .catch(finanzenFehler);
          return c.json({ id }, 201);
        },
      )
      .patch(
        '/finanzen/rechnungssteller/:id',
        auth,
        finanzenBuchen,
        zValidator('json', rechnungsstellerAendernSchema),
        async (c) => {
          gefunden(
            await deps.finanzen
              .rechnungsstellerAendern(c.req.param('id'), c.req.valid('json'))
              .catch(finanzenFehler),
            'Rechnungssteller nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get(
        '/finanzen/belege',
        auth,
        finanzenLesen,
        zValidator('query', belegeAbfrageSchema),
        async (c) => {
          const [liste, mitglied] = await Promise.all([
            deps.finanzen.belege({ ...c.req.valid('query'), limit: BELEGE_MAX + 1 }),
            finanzenMitglieder(),
          ]);
          const gebucht = liste.filter((b) => b.status !== 'entwurf');
          const dto: BelegeSeiteDto = {
            belege: [
              ...liste.filter((b) => b.status === 'entwurf'),
              ...gebucht.slice(0, BELEGE_MAX),
            ].map(({ mitgliedId, eingereichtVon, ...rest }): BelegListeDto => ({
              ...rest,
              mitglied: mitgliedId ? mitglied(mitgliedId) : null,
              eingereichtVon: eingereichtVon ? mitglied(eingereichtVon) : null,
            })),
            gekappt: gebucht.length > BELEGE_MAX,
          };
          return c.json(dto);
        },
      )
      .get('/finanzen/belege/:id', auth, finanzenLesen, async (c) => {
        const [b, mitglied] = await Promise.all([
          deps.finanzen.beleg(c.req.param('id')),
          finanzenMitglieder(),
        ]);
        const { mitgliedId, erstelltVon, eingereichtVon, datei, ...beleg } = gefunden(
          b,
          'Beleg nicht gefunden',
        );
        const dto: BelegDetailDto = {
          ...beleg,
          mitglied: mitgliedId ? mitglied(mitgliedId) : null,
          erstelltVon: mitglied(erstelltVon),
          eingereichtVon: eingereichtVon ? mitglied(eingereichtVon) : null,
          datei: datei && { ...datei, url: await deps.finanzarchiv.anzeigeUrl(datei.schluessel) },
        };
        return c.json(dto);
      })
      .post('/finanzen/belege/:id/kopieren', auth, finanzenBuchen, async (c) => {
        const id = gefunden(
          await deps.finanzen.entwurfKopieren(c.req.param('id'), c.get('user').sub),
          'Beleg nicht gefunden',
        );
        return c.json({ id }, 201);
      })
      .post(
        '/finanzen/beleg-entwuerfe',
        auth,
        finanzenBuchen,
        zValidator('json', belegEntwurfSchema),
        async (c) => {
          const id = await deps.finanzen.entwurfAnlegen(
            c.req.valid('json').daten,
            c.get('user').sub,
          );
          return c.json({ id }, 201);
        },
      )
      .get('/finanzen/beleg-entwuerfe/:id', auth, finanzenLesen, async (c) => {
        const [e, warnungen, mitglied] = await Promise.all([
          deps.finanzen.entwurf(c.req.param('id')),
          deps.finanzen.belegWarnungen(c.req.param('id')),
          finanzenMitglieder(),
        ]);
        const entwurf = gefunden(e, 'Entwurf nicht gefunden');
        const dto: BelegEntwurfDto = {
          id: entwurf.id,
          daten: entwurf.daten,
          dateiUrl: entwurf.daten.datei
            ? await deps.finanzarchiv.anzeigeUrl(entwurf.daten.datei.schluessel)
            : null,
          warnungen: warnungen ?? [],
          status: entwurf.status,
          eingereichtVon: entwurf.eingereichtVon ? mitglied(entwurf.eingereichtVon) : null,
          eingereichtAm: entwurf.eingereichtAm,
          verworfenGrund: entwurf.verworfenGrund,
          erstelltVon: mitglied(entwurf.erstelltVon),
          erstelltAm: entwurf.erstelltAm,
          geaendertAm: entwurf.geaendertAm,
        };
        return c.json(dto);
      })
      .put(
        '/finanzen/beleg-entwuerfe/:id',
        auth,
        finanzenBuchen,
        zValidator('json', belegEntwurfSchema),
        async (c) => {
          gefunden(
            await deps.finanzen.entwurfSpeichern(c.req.param('id'), c.req.valid('json').daten),
            'Entwurf nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/finanzen/beleg-entwuerfe/:id', auth, finanzenBuchen, async (c) => {
        gefunden(await deps.finanzen.entwurfLoeschen(c.req.param('id')), 'Entwurf nicht gefunden');
        return c.json({ ok: true });
      })
      .post(
        '/finanzen/beleg-entwuerfe/:id/buchen',
        auth,
        finanzenBuchen,
        zValidator('json', belegBuchenSchema),
        async (c) => {
          const id = c.req.param('id');
          const mitglied = await finanzenMitglieder();
          const entwurf = await deps.finanzen.entwurf(id);
          const zahler = entwurf?.daten.zahlweg === 'auslage' ? entwurf.daten.mitgliedId : null;
          if (zahler && !mitglied(zahler))
            throw new HTTPException(400, { message: 'Das Mitglied der Auslage gibt es nicht.' });
          try {
            const ergebnis = gefunden(
              await deps.finanzen.entwurfBuchen(id, c.req.valid('json'), c.get('user').sub),
              'Entwurf nicht gefunden',
            );
            if (!ergebnis.wiederholt && entwurf?.eingereichtVon) {
              const betrag = entwurf.daten.eingereichtBetragCent;
              await statusPush(
                entwurf.eingereichtVon,
                'Dein Beleg wurde gebucht',
                betrag === null || betrag === undefined
                  ? 'Dein Beleg wurde gebucht.'
                  : `Dein Beleg über ${formatEuro(betrag)} wurde gebucht.`,
              );
            }
            return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
          } catch (err) {
            if (err instanceof BelegWarnungenOffen)
              return c.json({ error: err.message, warnungen: err.warnungen }, 409);
            return finanzenFehler(err);
          }
        },
      )
      .post(
        '/finanzen/beleg-entwuerfe/:id/verwerfen',
        auth,
        finanzenBuchen,
        zValidator('json', belegVerwerfenSchema),
        async (c) => {
          const id = c.req.param('id');
          const { grund } = c.req.valid('json');
          const entwurf = gefunden(await deps.finanzen.entwurf(id), 'Entwurf nicht gefunden');
          const ergebnis = await deps.finanzen.entwurfVerwerfen(id, grund, c.get('user').sub);
          if (ergebnis === 'fehlt')
            throw new HTTPException(404, { message: 'Entwurf nicht gefunden' });
          if (ergebnis === 'nicht_eingereicht')
            throw new HTTPException(409, {
              message: 'Nur eingereichte Belege kannst du verwerfen.',
            });
          if (entwurf.eingereichtVon)
            await statusPush(
              entwurf.eingereichtVon,
              'Dein Beleg wurde verworfen',
              `Dein Beleg wurde verworfen: ${grund}`,
            );
          return c.json({ ok: true });
        },
      )
      // ----- Einreichungen of members (own ones only)
      .post(
        '/finanzen/einreichungen/upload',
        auth,
        belegeEinreichen,
        zValidator('json', belegDateiUploadSchema),
        async (c) => {
          const upload = await deps.finanzarchiv.uploadVorbereiten(c.req.valid('json'));
          const dto: BelegUploadDto = { ...upload, schonGebucht: null };
          return c.json(dto);
        },
      )
      .post(
        '/finanzen/einreichungen',
        auth,
        belegeEinreichen,
        zValidator('json', belegEinreichenSchema),
        async (c) => {
          const sub = c.get('user').sub;
          const eingabe = c.req.valid('json');
          if (eingabe.rechnungsstellerId) {
            const steller = await deps.finanzen.rechnungssteller(false);
            if (!steller.some((r) => r.id === eingabe.rechnungsstellerId))
              throw new HTTPException(400, { message: 'Den Rechnungssteller gibt es nicht.' });
          }
          // The rate of every item must be valid on the Belegdatum.
          const zeitraeume = await deps.finanzen.steuersatzZeitraeume();
          if (
            eingabe.posten.some(
              (p) => !steuersatzGueltigAm(zeitraeume, p.steuersatz, eingabe.belegdatum),
            )
          )
            throw new HTTPException(400, {
              message: 'Ein Steuersatz gilt am Belegdatum nicht.',
            });
          const daten = belegEntwurfDatenSchema.parse({
            rechnungsstellerId: eingabe.rechnungsstellerId,
            rechnungsstellerName: eingabe.rechnungsstellerName,
            belegdatum: eingabe.belegdatum,
            posten: eingabe.posten,
            zahlweg: 'auslage',
            mitgliedId: sub,
            datei: eingabe.datei,
            // The Finanzer:in sees the stated amount as the Belegsumme and can correct it.
            belegsummeCent: eingabe.betragCent,
            eingereichtBetragCent: eingabe.betragCent,
            notiz: eingabe.notiz,
          });
          let id: string;
          try {
            id = await deps.finanzen.einreichungAnlegen(daten, sub);
          } catch (err) {
            return finanzenFehler(err);
          }
          await pushSenden(async () => {
            const absender = anzeigeName((await finanzenMitglieder())(sub));
            return {
              subs: await mitgliederMitRecht(deps, 'finanzen:buchen'),
              ausser: [sub],
              art: 'belege.eingereicht',
              titel: 'Neuer Beleg eingereicht',
              text: `Neuer Beleg von ${absender}: ${formatEuro(eingabe.betragCent)}`,
              url: `/app/finanzen/belege/entwurf/${id}`,
            };
          });
          return c.json({ id }, 201);
        },
      )
      .get('/finanzen/einreichungen', auth, belegeEinreichen, async (c) => {
        const liste = await deps.finanzen.einreichungen(c.get('user').sub);
        const dto: EinreichungDto[] = liste.map(einreichungDto);
        return c.json(dto);
      })
      .get('/finanzen/einreichungen/auswahl', auth, belegeEinreichen, async (c) => {
        const [steller, konten, waren, artikelVorschlaege, steuersatzZeitraeume] =
          await Promise.all([
            deps.finanzen.rechnungssteller(false),
            deps.finanzen.konten(false),
            deps.finanzen.belegWaren(),
            deps.finanzen.artikelVorschlaege(),
            deps.finanzen.steuersatzZeitraeume(),
          ]);
        const dto: EinreichungAuswahlDto = {
          rechnungssteller: steller.map((r) => ({ id: r.id, name: r.name })),
          kategorien: konten
            .filter((k) => k.art === 'aufwand' && !k.archiviert)
            .map((k) => ({ id: k.id, name: k.name })),
          waren,
          artikelVorschlaege,
          steuersatzZeitraeume: steuersatzZeitraeume.map((z) => ({
            id: z.id,
            ab: z.ab,
            regel: z.regel,
            ermaessigt: z.ermaessigt,
          })),
        };
        return c.json(dto);
      })
      .get('/finanzen/einreichungen/:id', auth, belegeEinreichen, async (c) => {
        const e = gefunden(
          await deps.finanzen.einreichung(c.req.param('id'), c.get('user').sub),
          'Einreichung nicht gefunden',
        );
        const konten = new Map((await deps.finanzen.konten(true)).map((k) => [k.id, k.name]));
        const waren = new Map((await deps.finanzen.belegWaren()).map((w) => [w.id, w]));
        const dto: EinreichungDetailDto = {
          ...einreichungDto(e),
          posten: e.posten.map((p) => {
            const w = p.wareId ? waren.get(p.wareId) : undefined;
            return {
              kategorie: p.kategorieId ? (konten.get(p.kategorieId) ?? null) : null,
              text: p.text,
              betragCent: p.betragCent,
              steuersatz: p.steuersatz,
              ware: w?.name ?? null,
              gebinde: w?.gebinde.find((g) => g.id === p.gebindeId)?.bezeichnung ?? null,
              anzahlMilli: p.anzahlMilli,
            };
          }),
          dateiUrl: e.datei ? await deps.finanzarchiv.anzeigeUrl(e.datei.schluessel) : null,
          dateiName: e.datei?.name ?? null,
          dateiTyp: e.datei?.typ ?? null,
          zurueckziehbar: e.status === 'eingereicht',
        };
        return c.json(dto);
      })
      .delete('/finanzen/einreichungen/:id', auth, belegeEinreichen, async (c) => {
        const ergebnis = await deps.finanzen.einreichungZurueckziehen(
          c.req.param('id'),
          c.get('user').sub,
        );
        if (ergebnis === 'fehlt')
          throw new HTTPException(404, { message: 'Einreichung nicht gefunden' });
        if (ergebnis === 'nicht_eingereicht')
          throw new HTTPException(409, {
            message: 'Der Beleg ist schon in Bearbeitung und lässt sich nicht mehr zurückziehen.',
          });
        return c.json({ ok: true });
      })
      // Presigned upload of a Beleg file straight into the archive; `schonGebucht` hints at a duplicate.
      .post(
        '/finanzen/beleg-dateien/upload',
        auth,
        finanzenBuchen,
        zValidator('json', belegDateiUploadSchema),
        async (c) => {
          const datei = c.req.valid('json');
          const [upload, schonGebucht] = await Promise.all([
            deps.finanzarchiv.uploadVorbereiten(datei),
            deps.finanzen.dateiGebucht(datei.sha256),
          ]);
          const dto: BelegUploadDto = { ...upload, schonGebucht };
          return c.json(dto);
        },
      )
      // Warengruppe -> Kategorie: the Aufwand Konto suggested for Ware items of the group.
      .get('/finanzen/warengruppen-kategorien', auth, finanzenLesen, async (c) => {
        const dto: WarengruppeKategorieDto[] = await deps.finanzen.warengruppenKategorien();
        return c.json(dto);
      })
      .put(
        '/finanzen/warengruppen/:id/kategorie',
        auth,
        finanzenBuchen,
        zValidator('json', warengruppeKategorieSchema),
        async (c) => {
          gefunden(
            await deps.finanzen
              .warengruppeKategorieSetzen(c.req.param('id'), c.req.valid('json').kategorieId)
              .catch(finanzenFehler),
            'Warengruppe nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // Waren with Gebinde, deposit, MHD kind and suggested Kategorie for the Ware items of a Beleg.
      .get('/finanzen/beleg-waren', auth, finanzenLesen, async (c) => {
        const dto: BelegWareDto[] = await deps.finanzen.belegWaren();
        return c.json(dto);
      })
      // Artikel names of booked Kategorie items with the Kategorien used for them (most often first).
      .get('/finanzen/artikel-vorschlaege', auth, finanzenLesen, async (c) => {
        const dto: ArtikelKategorieVorschlaege = await deps.finanzen.artikelVorschlaege();
        return c.json(dto);
      })
      // Artikel with their default tax rate, Kategorien, number of booked Posten and latest booking.
      .get('/finanzen/artikel', auth, finanzenLesen, async (c) => {
        const dto: ArtikelDto[] = await deps.finanzen.artikel();
        return c.json(dto);
      })
      .patch(
        '/finanzen/artikel/:id',
        auth,
        finanzenBuchen,
        zValidator('json', artikelAendernSchema),
        async (c) => {
          gefunden(
            await deps.finanzen.artikelSteuersatzArtSetzen(
              c.req.param('id'),
              c.req.valid('json').steuersatzArt,
            ),
            'Artikel nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // Tax rate periods (regular and reduced rate valid from a date); changing them needs the same
      // right as the Kontenplan.
      .get('/finanzen/steuersatz-zeitraeume', auth, finanzenLesen, async (c) => {
        const dto: SteuersatzZeitraumDto[] = await deps.finanzen.steuersatzZeitraeume();
        return c.json(dto);
      })
      .post(
        '/finanzen/steuersatz-zeitraeume',
        auth,
        finanzenVerwalten,
        zValidator('json', steuersatzZeitraumEingabeSchema),
        async (c) => {
          const id = await deps.finanzen
            .steuersatzZeitraumAnlegen(c.req.valid('json'), c.get('user').sub)
            .catch(finanzenFehler);
          return c.json({ id }, 201);
        },
      )
      .delete('/finanzen/steuersatz-zeitraeume/:id', auth, finanzenVerwalten, async (c) => {
        gefunden(
          await deps.finanzen.steuersatzZeitraumLoeschen(c.req.param('id')).catch(finanzenFehler),
          'Zeitraum nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .get('/finanzen/auslagen', auth, finanzenLesen, async (c) => {
        const [liste, mitglied] = await Promise.all([
          deps.finanzen.auslagen(),
          finanzenMitglieder(),
        ]);
        const dto: AuslagenDto = {
          mitglieder: liste.map((m): AuslageMitgliedDto => ({
            ...m,
            mitglied: mitglied(m.mitgliedId),
          })),
        };
        return c.json(dto);
      })
      .post(
        '/finanzen/erstattungen',
        auth,
        finanzenBuchen,
        zValidator('json', erstattungEingabeSchema),
        async (c) => {
          const eingabe = c.req.valid('json');
          const mitglied = (await finanzenMitglieder())(eingabe.mitgliedId);
          if (!mitglied) throw new HTTPException(400, { message: 'Das Mitglied gibt es nicht.' });
          const name = mitglied.username ?? `${mitglied.vorname} ${mitglied.nachname}`;
          const ergebnis = await deps.finanzen
            .erstatten(eingabe, c.get('user').sub, name)
            .catch(finanzenFehler);
          if (!ergebnis.wiederholt) {
            const eingereicht = await deps.finanzen.eingereichteBelege(eingabe.belegIds);
            const jeMitglied = new Map<string, number>();
            for (const e of eingereicht)
              jeMitglied.set(
                e.eingereichtVon,
                (jeMitglied.get(e.eingereichtVon) ?? 0) + e.summeCent,
              );
            for (const [sub, summe] of jeMitglied)
              await statusPush(
                sub,
                'Deine Auslagen wurden erstattet',
                `Deine Auslagen über ${formatEuro(summe)} wurden erstattet.`,
              );
          }
          return c.json(ergebnis, ergebnis.wiederholt ? 200 : 201);
        },
      )
      // Verifies the whole hash chain and compares the counter with the last booking.
      .get('/finanzen/kette', auth, finanzenPruefen, async (c) => {
        const daten = await deps.finanzen.kettenDaten();
        const ergebnis = await pruefeKette(daten.buchungen);
        const zaehlerPasst =
          daten.zaehlerWert === ergebnis.letzteSeq && daten.zaehlerHash === ergebnis.kopfHash;
        const dto: KettenErgebnisDto = {
          ...ergebnis,
          zaehlerWert: daten.zaehlerWert,
          zaehlerHash: daten.zaehlerHash,
          zaehlerPasst,
          ok: zaehlerPasst && ergebnis.fehler.length === 0,
          geprueftAm: new Date().toISOString(),
        };
        return c.json(dto);
      })
  );
  // ----- Umfragen;
};
