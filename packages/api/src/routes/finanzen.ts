import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  buchungEingabeSchema,
  JOURNAL_MAX,
  kasseAendernSchema,
  kasseEingabeSchema,
  KASSENABRECHNUNGEN_MAX,
  kassenabrechnungEingabeSchema,
  kassenabrechnungenAbfrageSchema,
  kassenzaehlungEingabeSchema,
  kassenzaehlungenAbfrageSchema,
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
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const finanzenRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    kasseZaehlen,
    finanzenLesen,
    finanzenBuchen,
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

  /** Maps the domain errors of the Finanzen store to HTTP statuses. */
  const finanzenFehler = (err: unknown): never => {
    if (err instanceof BuchungUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof KontoUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof StornoKonflikt) throw new HTTPException(409, { message: err.message });
    if (err instanceof KontoKonflikt) throw new HTTPException(409, { message: err.message });
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
                ...(daten.steuersatzStandard !== undefined && {
                  steuersatzStandard: daten.steuersatzStandard,
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
          const [liste, mitglied] = await Promise.all([
            deps.finanzen.kassenzaehlungen(c.req.valid('query').eventId),
            finanzenMitglieder(),
          ]);
          const dto: KassenzaehlungDto[] = liste.map((z) => ({
            ...z,
            gezaehltVon: mitglied(z.gezaehltVon),
          }));
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
