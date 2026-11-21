import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  datumBerlin,
  heuteBerlin,
  protokollBildAnfrageSchema,
  protokollBildPrefix,
  type ProtokollBildUploadDto,
  protokollBildSchluessel,
  aktionenMitZustand,
  bausteinIdsInReihenfolge,
  datumPlusTage,
  protokollAktionen,
  protokollAktionenAusfuehrenSchema,
  VORSCHLAG_FENSTER_TAGE,
  type ProtokollAktionDto,
  type ProtokollAktionenAntwort,
  type ProtokollAktionenAusfuehrenAntwort,
  type ProtokollKalenderEvent,
  type ProtokollStatusAntwort,
  protokollAnlegenSchema,
  protokollDokumentPruefen,
  stimmenPruefen,
  protokollEventIds,
  nichtBeschlussfaehigeAbstimmungen,
  protokollKopfLeer,
  protokollKopfSchema,
  protokollLeer,
  protokollDokumentNormalisieren,
  protokollSpeichernSchema,
  protokollStatusSchema,
  protokollPdfSchema,
  protokollPdfDateiname,
  PROTOKOLL_PDF_MAX_BYTES,
  type ProtokollPdfAntwort,
  protokollVorschlag,
  type ProtokollDokument,
  type ProtokollDto,
  type ProtokollKopf,
  type ProtokollNaechsteSitzungVorschlag,
  type ProtokollListeEintragDto,
  type ProtokollSitzungDto,
  type ProtokollVorschlagDto,
} from '@c4/shared';
import { type EventKurz } from '../kalender';
import { NichtVerbunden, PROTOKOLL_PFAD } from '../onedrive';
import { meldeEventAenderung } from '../kalenderBenachrichtigungen';
import {
  ProtokollAbgeschlossen,
  ProtokollExistiert,
  ProtokollVeraltet,
  PROTOKOLL_SPERRE_MS,
  sperreGehoert,
  type ProtokollDaten,
} from '../protokolle';
import {
  createProtokollAktionen,
  rueckschreiben,
  type Rueckschreibung,
} from '../protokollAktionen';
import {
  kopfAbschliessen,
  kopfOhneSchnappschuss,
  kopfWiederOeffnen,
  naechsteSitzungVorschlagVon,
  protokollArtVon,
  mitgliedDto,
  protokollListen,
} from '../protokolleAnsicht';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

/** How many Sitzungen without protocol the "new protocol" page offers. */
const PROTOKOLL_SITZUNGEN_MAX = 20;

/** How many upcoming Sitzungen the "new protocol" page offers in advance. */
const PROTOKOLL_KOMMENDE_MAX = 5;

/** Upcoming Sitzungen offered as "next Sitzung" in the editor. */
const PROTOKOLL_NAECHSTE_SITZUNGEN_MAX = 10;

export const protokolleRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, protokolleLesen, protokolleSchreiben, protokollMitglieder, gefunden } = ctx;

  /** Stored text -> document; a damaged one reads as an empty document. */
  const protokollInhaltLesen = (text: string): ProtokollDokument => {
    try {
      const doc: unknown = JSON.parse(text);
      return protokollDokumentPruefen(doc) === null
        ? protokollDokumentNormalisieren(doc as ProtokollDokument)
        : protokollLeer();
    } catch {
      return protokollLeer();
    }
  };

  /** Stored text -> header; a damaged one reads as an empty header. */
  const protokollKopfLesen = (text: string): ProtokollKopf => {
    try {
      const kopf = protokollKopfSchema.safeParse(JSON.parse(text));
      return kopf.success ? kopf.data : protokollKopfLeer();
    } catch {
      return protokollKopfLeer();
    }
  };

  /** The event must exist, be a Sitzung with protocol and not be cancelled (400 otherwise). */
  const sitzungPruefen = async (eventId: string): Promise<EventKurz> => {
    const [event] = await deps.kalender.eventsKurz([eventId]);
    if (!event) throw new HTTPException(400, { message: 'Die Sitzung gibt es nicht.' });
    if (!event.protokoll) {
      throw new HTTPException(400, {
        message:
          'Zu diesem Event gibt es keine Protokolle. Die Kategorie ist keine Sitzung mit Protokoll.',
      });
    }
    if (event.abgesagt) throw new HTTPException(400, { message: 'Die Sitzung ist abgesagt.' });
    return event;
  };

  /**
   * Ids of the votes of a protocol at which its Sitzung was not beschlussfähig (attendance as the
   * protocol shows it: live in a draft, the snapshot once closed).
   */
  const nichtBeschlussfaehigVon = async (
    p: ProtokollDaten,
    dokument: ProtokollDokument,
  ): Promise<string[]> => {
    const [[event], mitglieder, antworten] = await Promise.all([
      deps.kalender.eventsKurz([p.eventId]),
      protokollMitglieder(),
      deps.kalender.teilnahmeAntworten(p.eventId),
    ]);
    const kopf = protokollKopfLesen(p.kopf);
    const { teilnahme, ems } = protokollListen(kopf, p.status, mitglieder, antworten);
    return nichtBeschlussfaehigeAbstimmungen(dokument, {
      art: protokollArtVon(kopf, p.status, event?.protokollArt ?? 'sitzung'),
      teilnahme: teilnahme.map((t) => ({ sub: t.sub, status: t.status, wert: t.wert })),
      ems: ems.filter((e) => e.ausgewaehlt),
    });
  };

  /**
   * Pre-filled document and header for a new protocol: the calendar from the previous Sitzung on (and
   * the events the latest protocol of an earlier Sitzung points to) plus that protocol's notes.
   */
  const protokollVorschlagFuer = async (sitzung: EventKurz): Promise<ProtokollVorschlagDto> => {
    const alle = await deps.protokolle.alle();
    const events = await deps.kalender.eventsKurz(alle.map((p) => p.eventId));
    const beginn = (id: string) => Date.parse(events.find((e) => e.id === id)?.beginn ?? '');
    const davor = alle
      .filter((p) => p.eventId !== sitzung.id && beginn(p.eventId) < Date.parse(sitzung.beginn))
      .sort((a, b) => beginn(b.eventId) - beginn(a.eventId));
    const letztes = davor[0] && (await deps.protokolle.holen(davor[0].id));
    const dokument = letztes ? protokollInhaltLesen(letztes.inhalt) : null;
    const letzteBeginn = davor[0]
      ? events.find((e) => e.id === davor[0]!.eventId)?.beginn
      : undefined;
    const sitzungDatum = datumBerlin(sitzung.beginn);
    const von = letzteBeginn
      ? datumBerlin(letzteBeginn)
      : datumPlusTage(sitzungDatum, -VORSCHLAG_FENSTER_TAGE);
    const bis = datumPlusTage(sitzungDatum, 3 * 366);
    const [liste, kategorien, vorlagen] = await Promise.all([
      deps.kalender.events(von, bis),
      deps.kalender.kategorien(true),
      deps.kalender.vorlagen(true),
    ]);
    const sitzungKategorien = new Set(kategorien.filter((k) => k.protokoll).map((k) => k.id));
    // Events the previous protocol points to that lie outside of the period.
    const bekannt = new Set(liste.map((e) => e.id));
    const weitere = dokument
      ? await Promise.all(
          protokollEventIds(dokument)
            .filter((id) => !bekannt.has(id))
            .map((id) => deps.kalender.event(id)),
        )
      : [];
    const kalender = [...liste, ...weitere.flatMap((e) => (e ? [e] : []))].map(
      (e): ProtokollKalenderEvent => ({
        id: e.id,
        titel: e.anzeigeTitel,
        beginn: e.beginn,
        ende: e.ende,
        abgesagt: e.abgesagt,
        kategorieId: e.kategorie?.id ?? null,
        dauer: e.dauer,
        serie: e.serie,
        sitzung: e.kategorie !== null && sitzungKategorien.has(e.kategorie.id),
        verantwortlichSub: e.verantwortlich?.sub ?? null,
        schichten: e.schichten,
      }),
    );
    return {
      inhalt: protokollVorschlag({
        sitzungDatum,
        letzteSitzungBeginn: letzteBeginn ?? null,
        letztes: dokument,
        kalender,
        vorlageKategorien: Object.fromEntries(vorlagen.map((v) => [v.id, v.kategorieId])),
        wiederholen:
          letztes && dokument && letzteBeginn
            ? {
                bausteinIds: await nichtBeschlussfaehigVon(letztes, dokument),
                datum: datumBerlin(letzteBeginn),
                sitzung: events.find((e) => e.id === letztes.eventId)?.titel ?? 'Sitzung',
              }
            : null,
      }),
      kopf: protokollKopfLeer(),
    };
  };

  /** The next Sitzungen (any art, not cancelled) after the given start, earliest first. */
  const naechsteSitzungenLesen = async (
    beginn: string | undefined,
  ): Promise<ProtokollNaechsteSitzungVorschlag[]> => {
    if (!beginn) return [];
    const events = await deps.kalender.kommendeSitzungen(
      new Date(beginn),
      PROTOKOLL_NAECHSTE_SITZUNGEN_MAX,
    );
    return events.map((e) => ({ eventId: e.id, titel: e.titel, beginn: e.beginn }));
  };

  /** Presigned GET URLs of the images in the document that belong to this protocol. */
  const protokollBilderUrls = async (
    id: string,
    inhalt: ProtokollDokument,
  ): Promise<Record<string, string>> => {
    const keys = protokollBildSchluessel(inhalt).filter((k) =>
      k.startsWith(protokollBildPrefix(id)),
    );
    const urls = await Promise.all(keys.map((k) => deps.protokollbilder.anzeigeUrl(k)));
    return Object.fromEntries(keys.map((k, i) => [k, urls[i]!]));
  };

  const alsProtokollDto = async (p: ProtokollDaten): Promise<ProtokollDto> => {
    const [[event], mitglieder, antworten] = await Promise.all([
      deps.kalender.eventsKurz([p.eventId]),
      protokollMitglieder(),
      deps.kalender.teilnahmeAntworten(p.eventId),
    ]);
    const kopf = protokollKopfLesen(p.kopf);
    const geschlossen = p.status === 'abgeschlossen' && kopf.naechsteSitzungSchnappschuss !== null;
    const naechste = geschlossen ? [] : await naechsteSitzungenLesen(event?.beginn);
    const von = mitglieder.find((m) => m.sub === p.geaendertVon);
    const inhalt = protokollInhaltLesen(p.inhalt);
    return {
      id: p.id,
      eventId: p.eventId,
      sitzung: {
        id: p.eventId,
        titel: event?.titel ?? 'Sitzung',
        beginn: event?.beginn ?? p.erstelltAm.toISOString(),
        kategorie: event?.kategorie ?? null,
        art: protokollArtVon(kopf, p.status, event?.protokollArt ?? 'sitzung'),
      },
      inhalt,
      bilder: await protokollBilderUrls(p.id, inhalt),
      kopf,
      status: p.status,
      version: p.version,
      naechsteSitzungVorschlag: naechsteSitzungVorschlagVon(kopf, p.status, naechste[0] ?? null),
      naechsteSitzungen: p.status === 'entwurf' ? naechste : [],
      ...protokollListen(kopf, p.status, mitglieder, antworten),
      geaendertAm: p.geaendertAm.toISOString(),
      geaendertVon: von ? mitgliedDto(von) : null,
    };
  };

  /** Maps the protocol store's conflicts to 409 (an outdated version also tells the current one and who saved it). */
  const protokollKonflikt = async (err: unknown, c: Context): Promise<Response> => {
    if (err instanceof ProtokollVeraltet) {
      const von = (await protokollMitglieder()).find((m) => m.sub === err.geaendertVon);
      return c.json(
        { error: err.message, version: err.version, geaendertVon: von ? mitgliedDto(von) : null },
        409,
      );
    }
    if (err instanceof ProtokollAbgeschlossen || err instanceof ProtokollExistiert) {
      throw new HTTPException(409, {
        message:
          err instanceof ProtokollExistiert
            ? 'Für diese Sitzung gibt es schon ein Protokoll.'
            : err.message,
      });
    }
    throw err;
  };

  /** 409 for a draft that somebody else edits (or whose lock the caller does not hold), see docs/protokolle.md. */
  const protokollGesperrt = async (
    c: Context,
    halter: { sub: string | null },
  ): Promise<Response> => {
    const von =
      halter.sub === null
        ? undefined
        : (await protokollMitglieder()).find((m) => m.sub === halter.sub);
    return c.json(
      {
        error: 'Das Protokoll wird gerade von jemand anderem bearbeitet.',
        sperre: {
          von: von ? mitgliedDto(von) : null,
          eigene: halter.sub !== null && halter.sub === c.get('user').sub,
        },
      },
      409,
    );
  };

  /** The tab id the editing page sends (header `X-Tab-Id`). */
  const protokollTab = (c: Context): string => c.req.header('x-tab-id') ?? '';

  /** A 409 response unless the caller holds the edit lock of this draft; closed protocols are not locked. */
  const protokollOhneSperre = async (c: Context, p: ProtokollDaten): Promise<Response | null> => {
    if (p.status !== 'entwurf') return null;
    const sub = c.get('user').sub;
    if (sperreGehoert(p, sub, protokollTab(c), new Date())) return null;
    const aktiv = p.sperreBis !== null && p.sperreBis.getTime() > Date.now();
    return protokollGesperrt(c, { sub: aktiv ? p.sperreSub : null });
  };

  // ----- Protokolle: Aktionen beim Abschließen (see docs/protokolle.md)

  const aktionenLaufer = createProtokollAktionen({
    kalender: deps.kalender,
    mitglieder: deps.mitglieder,
    userAdmin: deps.userAdmin,
    posten: deps.posten,
    todos: deps.todos,
    eventGeaendert: async (id, aenderung, akteur) => {
      const event = await deps.kalender.event(id);
      if (event) await meldeEventAenderung(deps.benachrichtigungen, event, aenderung, akteur);
    },
  });

  /** The Aktionen the stored document of a protocol implies, with their plans. */
  const aktionenBerechnen = async (p: ProtokollDaten, dokument: ProtokollDokument) => {
    const [event] = await deps.kalender.eventsKurz([p.eventId]);
    const sitzungDatum = datumBerlin(event?.beginn ?? p.erstelltAm.toISOString());
    const kontext = await aktionenLaufer.kontextLesen(dokument, sitzungDatum, heuteBerlin(), p.id);
    return protokollAktionen(dokument, {
      ...kontext,
      nichtBeschlussfaehig: await nichtBeschlussfaehigVon(p, dokument),
    });
  };

  /** The Aktionen as the web shows them: state, stored result and the members concerned. */
  const aktionenDtos = async (
    p: ProtokollDaten,
    dokument: ProtokollDokument,
    kopf: ProtokollKopf,
  ): Promise<ProtokollAktionDto[]> => {
    const [liste, mitglieder] = await Promise.all([
      aktionenBerechnen(p, dokument),
      protokollMitglieder(),
    ]);
    const nachSub = new Map(mitglieder.map((m) => [m.sub, m]));
    return aktionenMitZustand(liste, kopf.aktionen, bausteinIdsInReihenfolge(dokument)).map(
      (a) => ({
        ...a,
        personen: a.subs.flatMap((sub) => {
          const m = nachSub.get(sub);
          return m ? [mitgliedDto(m)] : [];
        }),
      }),
    );
  };

  /**
   * Writes after Aktionen ran (their effects cannot be undone): when somebody saved in the meantime,
   * the write is tried again on the newer state, so that the written-back ids are not lost.
   */
  const nachAktionenSchreiben = async <T>(
    p: ProtokollDaten,
    schreiben: (stand: ProtokollDaten) => Promise<T>,
    nochmal = true,
  ): Promise<T> => {
    let stand = p;
    for (let versuch = 0; ; versuch++) {
      try {
        return await schreiben(stand);
      } catch (err) {
        if (!nochmal || !(err instanceof ProtokollVeraltet) || versuch >= 2) throw err;
        stand = gefunden(await deps.protokolle.holen(p.id), 'Protokoll nicht gefunden');
      }
    }
  };

  /** Document and kopf with the results of Aktionen written back. */
  const mitErgebnissen = (
    stand: ProtokollDaten,
    patches: readonly Rueckschreibung[],
    ergebnisse: ProtokollKopf['aktionen'],
  ) => {
    const kopf = protokollKopfLesen(stand.kopf);
    return {
      kopf,
      inhalt: rueckschreiben(protokollInhaltLesen(stand.inhalt), patches),
      aktionen: { ...kopf.aktionen, ...ergebnisse },
    };
  };

  /** Writes the results of a run of Aktionen (and written-back ids) onto `stand`. */
  const ergebnisSchreiben = async (
    stand: ProtokollDaten,
    lauf: { patches: readonly Rueckschreibung[]; ergebnisse: ProtokollKopf['aktionen'] },
    akteur: string,
  ) => {
    const neu = mitErgebnissen(stand, lauf.patches, lauf.ergebnisse);
    return gefunden(
      await deps.protokolle.ergebnisSpeichern(
        stand.id,
        {
          inhalt: JSON.stringify(neu.inhalt),
          kopf: JSON.stringify({ ...neu.kopf, aktionen: neu.aktionen }),
          version: stand.version,
        },
        akteur,
      ),
      'Protokoll nicht gefunden',
    );
  };

  return (
    new Hono<AuthEnv>()
      .get('/protokolle', auth, protokolleLesen, async (c) => {
        const [alle, mitglieder] = await Promise.all([
          deps.protokolle.alle(),
          protokollMitglieder(),
        ]);
        const events = await deps.kalender.eventsKurz(alle.map((p) => p.eventId));
        const liste = alle.map((p): ProtokollListeEintragDto => {
          const event = events.find((e) => e.id === p.eventId);
          const von = mitglieder.find((m) => m.sub === p.geaendertVon);
          const beginn = event?.beginn ?? p.erstelltAm.toISOString();
          return {
            id: p.id,
            eventId: p.eventId,
            titel: event?.titel ?? 'Sitzung',
            beginn,
            status: p.status,
            geaendertAm: p.geaendertAm.toISOString(),
            geaendertVon: von ? mitgliedDto(von) : null,
          };
        });
        return c.json(liste.sort((a, b) => Date.parse(b.beginn) - Date.parse(a.beginn)));
      })
      // Sitzungen a protocol can still be started for: past ones plus the next few upcoming ones,
      // newest first.
      .get('/protokolle/sitzungen', auth, protokolleSchreiben, async (c) => {
        const vorhandene = (await deps.protokolle.alle()).map((p) => p.eventId);
        const jetzt = new Date();
        const vergangene = await deps.kalender.sitzungen(
          { bis: jetzt },
          PROTOKOLL_SITZUNGEN_MAX,
          vorhandene,
        );
        const kommende = await deps.kalender.sitzungen(
          { nach: jetzt },
          PROTOKOLL_KOMMENDE_MAX,
          vorhandene,
          true,
        );
        const sitzungen = [...vergangene, ...kommende].sort(
          (a, b) => Date.parse(b.beginn) - Date.parse(a.beginn),
        );
        return c.json(
          sitzungen.map((e): ProtokollSitzungDto => ({
            id: e.id,
            titel: e.titel,
            beginn: e.beginn,
            kategorie: e.kategorie,
            art: e.protokollArt,
          })),
        );
      })
      .get(
        '/protokolle/vorschlag',
        auth,
        protokolleSchreiben,
        zValidator('query', z.object({ eventId: z.string().min(1) })),
        async (c) => {
          const sitzung = await sitzungPruefen(c.req.valid('query').eventId);
          return c.json(await protokollVorschlagFuer(sitzung));
        },
      )
      .post(
        '/protokolle',
        auth,
        protokolleSchreiben,
        zValidator('json', protokollAnlegenSchema),
        async (c) => {
          const eingabe = c.req.valid('json');
          // A new protocol has no id (and so no image prefix) yet, so it cannot carry images.
          if (eingabe.inhalt && protokollBildSchluessel(eingabe.inhalt).length > 0) {
            throw new HTTPException(400, { message: 'Ein Bild gehört nicht zu diesem Protokoll.' });
          }
          const sitzung = await sitzungPruefen(eingabe.eventId);
          if (await deps.protokolle.nachEvent(sitzung.id)) {
            throw new HTTPException(409, {
              message: 'Für diese Sitzung gibt es schon ein Protokoll.',
            });
          }
          const vorschlag =
            eingabe.inhalt && eingabe.kopf ? undefined : await protokollVorschlagFuer(sitzung);
          const inhalt = eingabe.inhalt ?? vorschlag!.inhalt;
          const vorKopf = kopfOhneSchnappschuss(eingabe.kopf ?? vorschlag!.kopf);
          const kopf = {
            ...vorKopf,
            aktionen: {},
            protokollfuehrung: vorKopf.protokollfuehrung ?? c.get('user').sub,
          };
          try {
            const id = await deps.protokolle.anlegen(
              { eventId: sitzung.id, inhalt: JSON.stringify(inhalt), kopf: JSON.stringify(kopf) },
              c.get('user').sub,
            );
            return c.json({ id }, 201);
          } catch (err) {
            return protokollKonflikt(err, c);
          }
        },
      )
      .get('/protokolle/:id', auth, protokolleLesen, async (c) => {
        const p = gefunden(
          await deps.protokolle.holen(c.req.param('id')),
          'Protokoll nicht gefunden',
        );
        return c.json(await alsProtokollDto(p));
      })
      // Takes or extends the edit lock of a draft for the tab in `X-Tab-Id` (heartbeat every 30 s).
      .post('/protokolle/:id/sperre', auth, protokolleSchreiben, async (c) => {
        const tab = protokollTab(c);
        if (!tab || tab.length > 100)
          throw new HTTPException(400, { message: 'Die Tab-Kennung fehlt.' });
        const jetzt = new Date();
        try {
          const ergebnis = gefunden(
            await deps.protokolle.sperreNehmen(
              c.req.param('id'),
              c.get('user').sub,
              tab,
              jetzt,
              new Date(jetzt.getTime() + PROTOKOLL_SPERRE_MS),
            ),
            'Protokoll nicht gefunden',
          );
          if (!ergebnis.erhalten) return protokollGesperrt(c, ergebnis);
          return c.json({ bis: ergebnis.bis!.toISOString() });
        } catch (err) {
          return protokollKonflikt(err, c);
        }
      })
      // Releases the lock; only the tab that holds it can.
      .delete('/protokolle/:id/sperre', auth, protokolleSchreiben, async (c) => {
        await deps.protokolle.sperreLoesen(c.req.param('id'), c.get('user').sub, protokollTab(c));
        return c.json({ ok: true });
      })
      .put(
        '/protokolle/:id',
        auth,
        protokolleSchreiben,
        zValidator('json', protokollSpeichernSchema),
        async (c) => {
          const { inhalt, kopf, version } = c.req.valid('json');
          const gespeichert = gefunden(
            await deps.protokolle.holen(c.req.param('id')),
            'Protokoll nicht gefunden',
          );
          const ohneSperre = await protokollOhneSperre(c, gespeichert);
          if (ohneSperre) return ohneSperre;
          // Images must belong to this protocol (the shared check only knows their shape).
          const fremd = protokollBildSchluessel(inhalt).some(
            (k) => !k.startsWith(protokollBildPrefix(gespeichert.id)),
          );
          if (fremd)
            throw new HTTPException(400, { message: 'Ein Bild gehört nicht zu diesem Protokoll.' });
          try {
            const ergebnis = gefunden(
              await deps.protokolle.speichern(
                c.req.param('id'),
                {
                  inhalt: JSON.stringify(inhalt),
                  // The snapshot and the results of Aktionen are the API's business.
                  kopf: JSON.stringify({
                    ...kopfOhneSchnappschuss(kopf),
                    aktionen: protokollKopfLesen(gespeichert.kopf).aktionen,
                  }),
                  version,
                },
                c.get('user').sub,
              ),
              'Protokoll nicht gefunden',
            );
            return c.json({
              version: ergebnis.version,
              geaendertAm: ergebnis.geaendertAm.toISOString(),
            });
          } catch (err) {
            return protokollKonflikt(err, c);
          }
        },
      )
      // Closing freezes who took part; reopening drops the snapshot again.
      .put(
        '/protokolle/:id/status',
        auth,
        protokolleSchreiben,
        zValidator('json', protokollStatusSchema),
        async (c) => {
          const { status, aktionen: aktionenIds = [] } = c.req.valid('json');
          const akteur = c.get('user').sub;
          const p = gefunden(
            await deps.protokolle.holen(c.req.param('id')),
            'Protokoll nicht gefunden',
          );
          const antwort = (
            ergebnis: { version: number; geaendertAm: Date },
            ausgaenge: ProtokollStatusAntwort['aktionen'] = [],
          ): ProtokollStatusAntwort => ({
            status,
            version: ergebnis.version,
            geaendertAm: ergebnis.geaendertAm.toISOString(),
            aktionen: ausgaenge,
          });
          if (p.status === status)
            return c.json(antwort({ version: p.version, geaendertAm: p.geaendertAm }));
          // Closing a draft needs the edit lock; reopening a closed protocol has none to hold.
          const ohneSperre = await protokollOhneSperre(c, p);
          if (ohneSperre) return ohneSperre;
          const kopf = protokollKopfLesen(p.kopf);
          if (status === 'entwurf') {
            try {
              const ergebnis = gefunden(
                await deps.protokolle.statusSetzen(
                  p.id,
                  status,
                  JSON.stringify(kopfWiederOeffnen(kopf)),
                  p.version,
                  akteur,
                ),
                'Protokoll nicht gefunden',
              );
              return c.json(antwort(ergebnis));
            } catch (err) {
              return protokollKonflikt(err, c);
            }
          }

          const [event] = await deps.kalender.eventsKurz([p.eventId]);
          if (event && Date.parse(event.beginn) > Date.now()) {
            throw new HTTPException(400, {
              message: 'Abschließen geht erst, wenn die Sitzung begonnen hat.',
            });
          }
          const mitglieder = await protokollMitglieder();
          const antworten = await deps.kalender.teilnahmeAntworten(p.eventId);
          const art = event?.protokollArt ?? 'sitzung';
          const naechste = (await naechsteSitzungenLesen(event?.beginn))[0] ?? null;
          // The snapshot shows the state before the Aktionen change members or events.
          const abschliessen = (k: ProtokollKopf) =>
            kopfAbschliessen(k, mitglieder, antworten, art, naechste);
          const neuerKopf = abschliessen(kopf);
          // Every binding vote needs as many votes as members present (see docs/protokolle.md).
          const dokument = protokollInhaltLesen(p.inhalt);
          const listen = protokollListen(neuerKopf, 'abgeschlossen', mitglieder, antworten);
          const { problems } = stimmenPruefen(dokument, {
            art,
            teilnahme: listen.teilnahme,
            ems: listen.ems.filter((e) => e.ausgewaehlt),
            personName: (sub) => {
              const m = mitglieder.find((x) => x.sub === sub);
              return m && (m.username || `${m.vorname} ${m.nachname}`.trim());
            },
          });
          if (problems.length > 0) {
            throw new HTTPException(400, {
              message: `Das Protokoll lässt sich nicht abschließen, die Stimmen passen nicht zur Anwesenheit: ${problems.map((x) => x.text).join(' ')}`,
            });
          }

          // The status is claimed first (one conditional update), so a parallel close cannot run the
          // Aktionen a second time. A failing Aktion later leaves the protocol closed; its result is
          // stored and it can be run again (see docs/protokolle.md).
          let belegt;
          try {
            belegt = gefunden(
              await deps.protokolle.statusBelegen(
                p.id,
                p.version,
                akteur,
                status,
                JSON.stringify(neuerKopf),
              ),
              'Protokoll nicht gefunden',
            );
          } catch (err) {
            return protokollKonflikt(err, c);
          }
          if (aktionenIds.length === 0) return c.json(antwort(belegt));
          const lauf = await aktionenLaufer.laufen(
            await aktionenBerechnen(p, dokument),
            aktionenIds,
            akteur,
          );
          if (lauf.patches.length === 0 && Object.keys(lauf.ergebnisse).length === 0) {
            return c.json(antwort(belegt, lauf.ausgaenge));
          }
          try {
            const stand: ProtokollDaten = {
              ...p,
              status,
              kopf: JSON.stringify(neuerKopf),
              version: belegt.version,
            };
            const ergebnis = await nachAktionenSchreiben(stand, (aktuell) =>
              ergebnisSchreiben(aktuell, lauf, akteur),
            );
            return c.json(antwort(ergebnis, lauf.ausgaenge));
          } catch (err) {
            return protokollKonflikt(err, c);
          }
        },
      )
      // Stores the PDF of a closed protocol in OneDrive (generated in the browser).
      .put(
        '/protokolle/:id/pdf',
        auth,
        protokolleSchreiben,
        zValidator('json', protokollPdfSchema),
        async (c) => {
          const p = gefunden(
            await deps.protokolle.holen(c.req.param('id')),
            'Protokoll nicht gefunden',
          );
          if (p.status !== 'abgeschlossen') {
            throw new HTTPException(409, {
              message: 'Das PDF gibt es erst, wenn das Protokoll abgeschlossen ist.',
            });
          }
          const { dateiname, base64 } = c.req.valid('json');
          const name = protokollPdfDateiname(dateiname);
          if (!name) throw new HTTPException(400, { message: 'Ungültiger Dateiname.' });
          if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
            throw new HTTPException(400, { message: 'Das PDF ist ungültig.' });
          }
          const inhalt = new Uint8Array(Buffer.from(base64, 'base64'));
          if (inhalt.byteLength > PROTOKOLL_PDF_MAX_BYTES) {
            throw new HTTPException(413, { message: 'Das PDF ist zu groß (höchstens 4 MB).' });
          }
          if (new TextDecoder().decode(inhalt.subarray(0, 5)) !== '%PDF-') {
            throw new HTTPException(400, { message: 'Das PDF ist ungültig.' });
          }
          // One folder per year (`Cloud4/Sitzungen/C4/Protokolle/2026/...`); OneDrive creates it on upload.
          const jahr = /^(\d{4})-/.exec(name)?.[1] ?? heuteBerlin().slice(0, 4);
          const pfad = `${PROTOKOLL_PFAD}/${jahr}/${name}`;
          try {
            await deps.onedrive.dateiHochladen(pfad, inhalt, 'application/pdf');
          } catch (err) {
            console.error('Uploading the protocol PDF to OneDrive failed', err);
            throw new HTTPException(503, {
              message:
                err instanceof NichtVerbunden
                  ? 'OneDrive ist nicht verbunden.'
                  : 'OneDrive ist gerade nicht erreichbar.',
            });
          }
          const antwort: ProtokollPdfAntwort = { gespeichert: true, pfad };
          return c.json(antwort);
        },
      )
      .get('/protokolle/:id/aktionen', auth, protokolleSchreiben, async (c) => {
        const p = gefunden(
          await deps.protokolle.holen(c.req.param('id')),
          'Protokoll nicht gefunden',
        );
        const antwort: ProtokollAktionenAntwort = {
          aktionen: await aktionenDtos(
            p,
            protokollInhaltLesen(p.inhalt),
            protokollKopfLesen(p.kopf),
          ),
        };
        return c.json(antwort);
      })
      // Runs Aktionen again (failed or open ones) for a closed protocol.
      .post(
        '/protokolle/:id/aktionen',
        auth,
        protokolleSchreiben,
        zValidator('json', protokollAktionenAusfuehrenSchema),
        async (c) => {
          const akteur = c.get('user').sub;
          const p = gefunden(
            await deps.protokolle.holen(c.req.param('id')),
            'Protokoll nicht gefunden',
          );
          if (p.status !== 'abgeschlossen') {
            throw new HTTPException(409, {
              message: 'Die Aktionen laufen beim Abschließen des Protokolls.',
            });
          }
          // Claimed first, so that a parallel run cannot run the Aktionen a second time.
          let stand: ProtokollDaten;
          try {
            const belegt = gefunden(
              await deps.protokolle.aktionenBelegen(p.id, p.version, akteur),
              'Protokoll nicht gefunden',
            );
            stand = { ...p, version: belegt.version };
          } catch (err) {
            return protokollKonflikt(err, c);
          }
          const lauf = await aktionenLaufer.laufen(
            await aktionenBerechnen(p, protokollInhaltLesen(p.inhalt)),
            c.req.valid('json').aktionen,
            akteur,
          );
          let version = stand.version;
          if (lauf.patches.length > 0 || Object.keys(lauf.ergebnisse).length > 0) {
            try {
              const ergebnis = await nachAktionenSchreiben(stand, (aktuell) =>
                ergebnisSchreiben(aktuell, lauf, akteur),
              );
              version = ergebnis.version;
            } catch (err) {
              return protokollKonflikt(err, c);
            }
          }
          const neu = gefunden(await deps.protokolle.holen(p.id), 'Protokoll nicht gefunden');
          const antwort: ProtokollAktionenAusfuehrenAntwort = {
            version,
            ergebnisse: lauf.ausgaenge,
            aktionen: await aktionenDtos(
              neu,
              protokollInhaltLesen(neu.inhalt),
              protokollKopfLesen(neu.kopf),
            ),
          };
          return c.json(antwort);
        },
      )
      // Upload URL for an image of a draft (the browser scales it to a JPEG first).
      .post(
        '/protokolle/:id/bilder',
        auth,
        protokolleSchreiben,
        zValidator('json', protokollBildAnfrageSchema),
        async (c) => {
          const p = gefunden(
            await deps.protokolle.holen(c.req.param('id')),
            'Protokoll nicht gefunden',
          );
          if (p.status !== 'entwurf') {
            throw new HTTPException(409, {
              message: 'Bilder lassen sich nur im Entwurf hinzufügen.',
            });
          }
          const antwort: ProtokollBildUploadDto = await deps.protokollbilder.uploadVorbereiten(
            p.id,
            c.req.valid('json').groesse,
          );
          return c.json(antwort);
        },
      )
      .delete('/protokolle/:id', auth, protokolleSchreiben, async (c) => {
        // A draft somebody else edits right now cannot be deleted.
        const vorhanden = await deps.protokolle.holen(c.req.param('id'));
        const ohneSperre = vorhanden && (await protokollOhneSperre(c, vorhanden));
        if (ohneSperre) {
          const aktiv = vorhanden.sperreBis !== null && vorhanden.sperreBis.getTime() > Date.now();
          // A free or expired lock allows deleting; only a valid lock of another tab refuses.
          if (aktiv) return ohneSperre;
        }
        try {
          gefunden(await deps.protokolle.loeschen(c.req.param('id')), 'Protokoll nicht gefunden');
        } catch (err) {
          return protokollKonflikt(err, c);
        }
        await deps.protokollbilder.loeschen(c.req.param('id')).catch((err) => {
          console.error('protokollbilder: delete failed', err);
        });
        return c.json({ ok: true });
      })
  );
  // ----- Trichter;
};
