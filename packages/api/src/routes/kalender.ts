import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  dienstEintragenSchema,
  verfuegbarkeitSchema,
  permissionsFor,
  dienstformEingabeSchema,
  eventEingabeSchema,
  eventOrdnerDaten,
  ordnerName,
  eventKategorieEingabeSchema,
  dienstTermine,
  eventTermine,
  icsErzeugen,
  externeEingabeSchema,
  externeZusammenfuehrenSchema,
  geburtstageZeitraumSchema,
  geburtstageZwischen,
  type GeburtstagDto,
  kalenderZeitraumSchema,
  statistikJahrSchema,
  vorlageEingabeSchema,
  serieAendernSchema,
  serieAktivSchema,
  serieEingabeSchema,
  serienBestehendeSchema,
  erinnerungenEingabeSchema,
  type DienstPerson,
  type EventDto,
} from '@c4/shared';
import {
  EntfernungBestaetigen,
  VerfuegbarkeitBestaetigen,
  SerieBetroffen,
  type BetroffenerDienst,
  type EventAenderung,
  tokenHash,
} from '../kalender';
import { bestEffort } from '../benachrichtigungen';
import { NichtVerbunden, OrdnerExistiert, OrdnerFehlt } from '../onedrive';
import { serieSofortErzeugen, serienMarkeFreigeben } from '../kalenderSerien';
import {
  meldeAbsage,
  meldeDienstDurchAndere,
  meldeEventAenderung,
} from '../kalenderBenachrichtigungen';
import { geburtstagSichtbar, istDeaktiviert } from '../mitglieder';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

/** The feed also contains Dienste that began this many days ago. */
const FEED_RUECKBLICK_TAGE = 90;

export const kalenderRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    kalenderLesen,
    eventsVerwalten,
    kalenderEinrichten,
    bilderLesen,
    kalenderFehler,
    onedriveFehler,
    freigabeVersuchen,
    ordnerCacheAendern,
    ordnerCacheEinfuegen,
    mitOrdnerAufraeumen,
    eventLoeschenMitPruefung,
    eigenesProfilMussExistieren,
    gefunden,
    akteurMitName,
    mitgliedMussExistieren,
  } = ctx;

  /** Creates the due events of a just saved series in the request; never fails the save. */
  const serieSofort = async (id: string): Promise<number> => {
    try {
      return await serieSofortErzeugen(deps.kalender, id);
    } catch (err) {
      console.error(`Series ${id}: immediate event creation failed`, err);
      return 0;
    }
  };

  // ----- Bilder (OneDrive photo folders, see docs/bilder.md)

  /** Creates the event's folder and links it; throws the OneDrive errors. Returns the link to open it. */
  const eventOrdnerAnlegen = async (event: EventDto): Promise<string> => {
    const { von, bis, eventName } = eventOrdnerDaten(event);
    const ordner = await deps.onedrive.ordnerAnlegen(ordnerName(von, bis, eventName));
    await deps.kalender.bilderOrdnerSetzen(event.id, { id: ordner.id, url: ordner.webUrl });
    await ordnerCacheEinfuegen(ordner);
    return (await freigabeVersuchen(ordner.id)) ?? ordner.webUrl;
  };

  /** German hint for a OneDrive failure while saving an event; never throws. */
  const bilderHinweisFuer = (err: unknown, was: 'angelegt' | 'umbenannt'): string => {
    if (err instanceof NichtVerbunden)
      return `OneDrive ist nicht verbunden, der Bilder-Ordner wurde nicht ${was}.`;
    if (err instanceof OrdnerExistiert)
      return `${err.message} Der Bilder-Ordner wurde nicht ${was}.`;
    console.error('OneDrive folder of an event failed', err);
    return `Der Bilder-Ordner konnte nicht ${was} werden, OneDrive ist gerade nicht erreichbar.`;
  };

  /**
   * After an event was saved: creates its folder when asked for and it has none, renames it when
   * name or date changed. OneDrive trouble never fails the save; it comes back as a German hint.
   */
  const bilderOrdnerAbgleichen = async (
    eventId: string,
    anlegen: boolean,
  ): Promise<string | undefined> => {
    let was: 'angelegt' | 'umbenannt' = 'angelegt';
    try {
      const [event, verknuepft] = await Promise.all([
        deps.kalender.event(eventId),
        deps.kalender.bilderOrdner(eventId),
      ]);
      if (!event) return undefined;
      if (verknuepft) {
        was = 'umbenannt';
        const { von, bis, eventName } = eventOrdnerDaten(event);
        const soll = ordnerName(von, bis, eventName);
        try {
          const aktuell = (await deps.onedrive.ordnerListen()).find((o) => o.id === verknuepft.id);
          if (!aktuell) throw new OrdnerFehlt();
          if (aktuell.name !== soll) {
            const neu = await deps.onedrive.umbenennen(verknuepft.id, soll);
            await deps.kalender.bilderOrdnerSetzen(eventId, { id: neu.id, url: neu.webUrl });
            await ordnerCacheEinfuegen(neu);
          }
          return undefined;
        } catch (err) {
          if (!(err instanceof OrdnerFehlt)) return bilderHinweisFuer(err, was);
          // The folder is gone in OneDrive: drop the link, make a new folder if one is wanted.
          await deps.kalender.bilderOrdnerSetzen(eventId, null);
          await ordnerCacheAendern((liste) => liste.filter((o) => o.id !== verknuepft.id));
          if (!anlegen) {
            return 'Der Bilder-Ordner existiert in OneDrive nicht mehr, die Verknüpfung wurde entfernt.';
          }
          was = 'angelegt';
        }
      } else if (!anlegen) {
        return undefined;
      }
      await eventOrdnerAnlegen(event);
      return undefined;
    } catch (err) {
      return bilderHinweisFuer(err, was);
    }
  };

  /** Runs a series change; a change that affects future events answers 409 with the counts. */
  const serienAenderung = async (
    c: { json: (body: unknown, status: 409) => Response },
    aktion: () => Promise<boolean>,
  ): Promise<Response | null> => {
    try {
      gefunden(await mitOrdnerAufraeumen(aktion), 'Serie nicht gefunden');
    } catch (err) {
      if (err instanceof SerieBetroffen) {
        return c.json(
          { error: err.message, unveraendert: err.unveraendert, angepasst: err.angepasst },
          409,
        );
      }
      return kalenderFehler(err);
    }
    // New days should show up right away, not tomorrow.
    await bestEffort(() => serienMarkeFreigeben(deps.benachrichtigungen));
    return null;
  };

  /** Adds the Cognito usernames to members in Kalender DTOs (the store only knows the profile row). */
  const personenMitUsernames = async <T extends { person: DienstPerson }>(
    liste: T[],
  ): Promise<T[]> => {
    if (!liste.some((e) => e.person.art === 'mitglied')) return liste;
    const konten = await deps.userAdmin.konten();
    return liste.map((e) =>
      e.person.art === 'mitglied'
        ? { ...e, person: { ...e.person, username: konten.get(e.person.sub)?.username ?? null } }
        : e,
    );
  };

  const eventsMitUsernames = async (liste: EventDto[]): Promise<EventDto[]> => {
    const alle = liste.flatMap((e) => [...e.schichten.flatMap((s) => s.dienste), ...e.teilnahmen]);
    if (
      !alle.some((d) => d.person.art === 'mitglied') &&
      !liste.some((e) => e.verantwortlich || e.nichtVerfuegbar.length > 0)
    ) {
      return liste;
    }
    const konten = await deps.userAdmin.konten();
    return liste.map((e) => ({
      ...e,
      verantwortlich: e.verantwortlich
        ? { ...e.verantwortlich, username: konten.get(e.verantwortlich.sub)?.username ?? null }
        : null,
      teilnahmen: e.teilnahmen.map((t) => ({
        ...t,
        person: { ...t.person, username: konten.get(t.person.sub)?.username ?? null },
      })),
      nichtVerfuegbar: e.nichtVerfuegbar.map((p) => ({
        ...p,
        username: konten.get(p.sub)?.username ?? null,
      })),
      schichten: e.schichten.map((s) => ({
        ...s,
        dienste: s.dienste.map((d) =>
          d.person.art === 'mitglied'
            ? {
                ...d,
                person: { ...d.person, username: konten.get(d.person.sub)?.username ?? null },
              }
            : d,
        ),
      })),
    }));
  };

  return (
    new Hono<AuthEnv>()
      .get(
        '/kalender/events',
        auth,
        kalenderLesen,
        zValidator('query', kalenderZeitraumSchema),
        async (c) => {
          const { von, bis } = c.req.valid('query');
          if (von > bis) throw new HTTPException(400, { message: 'Ungültiger Zeitraum' });
          return c.json(
            await eventsMitUsernames(await deps.kalender.events(von, bis, c.get('user').sub)),
          );
        },
      )
      // Birthdays of members who show them in the calendar (see `geburtstagSichtbar`).
      .get(
        '/kalender/geburtstage',
        auth,
        kalenderLesen,
        zValidator('query', geburtstageZeitraumSchema),
        async (c) => {
          const { von, bis } = c.req.valid('query');
          const [rows, konten] = await Promise.all([
            deps.mitglieder.alle(),
            deps.userAdmin.konten(),
          ]);
          const sichtbar = rows.flatMap((r) =>
            r.geburtsdatum !== null && geburtstagSichtbar(r) && !istDeaktiviert(r)
              ? [{ ...r, geburtsdatum: r.geburtsdatum }]
              : [],
          );
          return c.json(
            geburtstageZwischen(sichtbar, von, bis).map(
              ({ datum, alter, person }): GeburtstagDto => ({
                datum,
                alter,
                mitglied: {
                  sub: person.sub,
                  username: konten.get(person.sub)?.username ?? null,
                  vorname: person.vorname,
                  nachname: person.nachname,
                  status: person.status,
                  anrede: person.anrede ?? 'neutral',
                },
              }),
            ),
          );
        },
      )
      .get('/kalender/events/:id', auth, kalenderLesen, async (c) => {
        const event = gefunden(
          await deps.kalender.event(c.req.param('id'), c.get('user').sub),
          'Event nicht gefunden',
        );
        const dto = (await eventsMitUsernames([event]))[0]!;
        if (!c.get('permissions').includes('privatpartys:verwalten')) return c.json(dto);
        const privatparty = await deps.privatpartys.nachEvent(event.id);
        return c.json({ ...dto, privatpartyId: privatparty?.id ?? null });
      })
      .post(
        '/kalender/events',
        auth,
        eventsVerwalten,
        zValidator('json', eventEingabeSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const id = await deps.kalender
            .eventAnlegen(daten, c.get('user').sub)
            .catch(kalenderFehler);
          const bilderHinweis = daten.bilderOrdner
            ? await bilderOrdnerAbgleichen(id, true)
            : undefined;
          return c.json({ id, ...(bilderHinweis && { bilderHinweis }) }, 201);
        },
      )
      .put(
        '/kalender/events/:id',
        auth,
        eventsVerwalten,
        zValidator('json', eventEingabeSchema),
        async (c) => {
          let aenderung: EventAenderung;
          const id = c.req.param('id');
          const daten = c.req.valid('json');
          try {
            aenderung = gefunden(
              await deps.kalender.eventAktualisieren(id, daten),
              'Event nicht gefunden',
            );
          } catch (err) {
            if (err instanceof EntfernungBestaetigen) {
              const betroffene: BetroffenerDienst[] = await personenMitUsernames(err.betroffene);
              const teilnahmen = await personenMitUsernames(err.teilnahmen);
              return c.json({ error: err.message, betroffene, teilnahmen }, 409);
            }
            return kalenderFehler(err);
          }
          const akteur = c.get('user').sub;
          await bestEffort(async () => {
            const event = await deps.kalender.event(id);
            if (event) await meldeEventAenderung(deps.benachrichtigungen, event, aenderung, akteur);
          });
          const bilderHinweis = await bilderOrdnerAbgleichen(id, daten.bilderOrdner === true);
          return c.json({ ok: true, ...(bilderHinweis && { bilderHinweis }) });
        },
      )
      .put(
        '/kalender/events/:id/absage',
        auth,
        eventsVerwalten,
        zValidator('json', z.object({ abgesagt: z.boolean() })),
        async (c) => {
          const { abgesagt } = c.req.valid('json');
          const id = c.req.param('id');
          const ergebnis = gefunden(
            await deps.kalender.absageSetzen(id, abgesagt),
            'Event nicht gefunden',
          );
          if (ergebnis.geaendert) {
            const akteur = c.get('user').sub;
            await bestEffort(async () => {
              const event = await deps.kalender.event(id);
              if (event) {
                await meldeAbsage(
                  deps.benachrichtigungen,
                  event,
                  abgesagt,
                  ergebnis.mitgliedSubs,
                  ergebnis.teilnehmerSubs,
                  akteur,
                );
              }
            });
          }
          return c.json({ abgesagt });
        },
      )
      // Own participation: everybody can change only their own answer.
      .put(
        '/kalender/events/:id/teilnahme',
        auth,
        kalenderLesen,
        zValidator('json', z.object({ teilnahme: z.boolean() })),
        async (c) => {
          const sub = c.get('user').sub;
          await eigenesProfilMussExistieren(sub);
          const { teilnahme } = c.req.valid('json');
          gefunden(
            await deps.kalender
              .teilnahmeSetzen(c.req.param('id'), sub, teilnahme)
              .catch(kalenderFehler),
            'Event nicht gefunden',
          );
          return c.json({ teilnahme });
        },
      )
      // Own availability for a Dienste event: an absage ("nicht verfügbar") for the whole event.
      .put(
        '/kalender/events/:id/verfuegbarkeit',
        auth,
        kalenderLesen,
        zValidator('json', verfuegbarkeitSchema),
        async (c) => {
          const sub = c.get('user').sub;
          await eigenesProfilMussExistieren(sub);
          const { verfuegbar, bestaetigt } = c.req.valid('json');
          try {
            gefunden(
              await deps.kalender.verfuegbarkeitSetzen(
                c.req.param('id'),
                sub,
                verfuegbar,
                bestaetigt === true,
              ),
              'Event nicht gefunden',
            );
          } catch (err) {
            if (err instanceof VerfuegbarkeitBestaetigen) {
              return c.json({ error: err.message, dienste: err.dienste }, 409);
            }
            return kalenderFehler(err);
          }
          return c.json({ verfuegbar });
        },
      )
      // Adds the event to / removes it from the caller's own calendar feed.
      .put('/kalender/events/:id/abo', auth, kalenderLesen, async (c) => {
        const sub = c.get('user').sub;
        await eigenesProfilMussExistieren(sub);
        gefunden(
          await deps.kalender.eventAboSetzen(c.req.param('id'), sub, true),
          'Event nicht gefunden',
        );
        return c.json({ imAbo: true });
      })
      .delete('/kalender/events/:id/abo', auth, kalenderLesen, async (c) => {
        gefunden(
          await deps.kalender.eventAboSetzen(c.req.param('id'), c.get('user').sub, false),
          'Event nicht gefunden',
        );
        return c.json({ imAbo: false });
      })
      .delete('/kalender/events/:id', auth, eventsVerwalten, async (c) => {
        gefunden(await eventLoeschenMitPruefung(c.req.param('id')), 'Event nicht gefunden');
        return c.json({ ok: true });
      })
      // Everybody may create the photo folder of an existing event (not only event managers).
      .post('/kalender/events/:id/bilder-ordner', auth, bilderLesen, async (c) => {
        const event = gefunden(
          await deps.kalender.event(c.req.param('id')),
          'Event nicht gefunden',
        );
        if (await deps.kalender.bilderOrdner(event.id)) {
          throw new HTTPException(409, { message: 'Das Event hat schon einen Bilder-Ordner.' });
        }
        const bilderOrdnerUrl = await eventOrdnerAnlegen(event).catch(onedriveFehler);
        return c.json({ bilderOrdnerUrl }, 201);
      })
      // ----- Bilder
      // `?quelle=cache` answers with the stored snapshot at once; without it the list is read from OneDrive
      // (and stored as the new snapshot). Sharing links are created by a job, not here.
      .post(
        '/kalender/schichten/:id/dienste',
        auth,
        kalenderLesen,
        zValidator('json', dienstEintragenSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const sub = c.get('user').sub;
          // Everybody with `kalender:lesen` may enter any member that has a profile row.
          if (daten.mitgliedSub !== undefined && daten.mitgliedSub !== sub) {
            await mitgliedMussExistieren(daten.mitgliedSub);
          }
          await eigenesProfilMussExistieren(sub);
          const { id, absageAufgehoben } = gefunden(
            await deps.kalender
              .dienstEintragen(c.req.param('id'), daten, sub)
              .catch(kalenderFehler),
            'Schicht nicht gefunden',
          );
          if (daten.mitgliedSub !== undefined && daten.mitgliedSub !== sub) {
            await bestEffort(async () => {
              const dienst = await deps.kalender.dienstHolen(id);
              if (dienst) {
                await meldeDienstDurchAndere(
                  deps.benachrichtigungen,
                  dienst,
                  true,
                  await akteurMitName(sub),
                );
              }
            });
          }
          return c.json({ id, absageAufgehoben }, 201);
        },
      )
      .delete('/kalender/dienste/:id', auth, kalenderLesen, async (c) => {
        const dienst = gefunden(
          await deps.kalender.dienstHolen(c.req.param('id')),
          'Dienst nicht gefunden',
        );
        const sub = c.get('user').sub;
        // Any member's Dienst may be removed by anybody; an Externe's entry only by who entered it
        // or with `events:verwalten`.
        const erlaubt =
          dienst.mitgliedSub !== null ||
          c.get('permissions').includes('events:verwalten') ||
          dienst.eingetragenVon === sub;
        if (!erlaubt) {
          throw new HTTPException(403, { message: 'Du darfst diesen Dienst nicht entfernen.' });
        }
        gefunden(await deps.kalender.dienstEntfernen(dienst.id), 'Dienst nicht gefunden');
        if (dienst.mitgliedSub !== null && dienst.mitgliedSub !== sub) {
          await bestEffort(async () =>
            meldeDienstDurchAndere(
              deps.benachrichtigungen,
              dienst,
              false,
              await akteurMitName(sub),
            ),
          );
        }
        return c.json({ ok: true });
      })
      // ----- Kalender: Externe
      .get('/kalender/externe', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.externe(c.req.query('archiv') === '1')),
      )
      .post(
        '/kalender/externe',
        auth,
        kalenderLesen,
        zValidator('json', externeEingabeSchema),
        async (c) => {
          const sub = c.get('user').sub;
          await eigenesProfilMussExistieren(sub);
          const id = await deps.kalender.externAnlegen(
            { ...c.req.valid('json'), archiviert: false },
            sub,
          );
          return c.json({ id }, 201);
        },
      )
      .post(
        '/kalender/externe/zusammenfuehren',
        auth,
        kalenderEinrichten,
        zValidator('json', externeZusammenfuehrenSchema),
        async (c) => {
          const { zielId, quelleIds } = c.req.valid('json');
          const ergebnis = gefunden(
            await deps.kalender.externeZusammenfuehren(zielId, quelleIds).catch(kalenderFehler),
            'Ziel nicht gefunden',
          );
          return c.json(ergebnis);
        },
      )
      .put(
        '/kalender/externe/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', externeEingabeSchema),
        async (c) => {
          gefunden(
            await deps.kalender.externAktualisieren(c.req.param('id'), c.req.valid('json')),
            'Person nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Kalender: Dienstformen, Kategorien, Vorlagen
      .get('/kalender/dienstformen', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.dienstformen(c.req.query('archiv') === '1')),
      )
      .post(
        '/kalender/dienstformen',
        auth,
        kalenderEinrichten,
        zValidator('json', dienstformEingabeSchema),
        async (c) =>
          c.json({ id: await deps.kalender.dienstformAnlegen(c.req.valid('json')) }, 201),
      )
      .put(
        '/kalender/dienstformen/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', dienstformEingabeSchema),
        async (c) => {
          gefunden(
            await deps.kalender.dienstformAktualisieren(c.req.param('id'), c.req.valid('json')),
            'Dienstform nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get('/kalender/kategorien', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.kategorien(c.req.query('archiv') === '1')),
      )
      .post(
        '/kalender/kategorien',
        auth,
        kalenderEinrichten,
        zValidator('json', eventKategorieEingabeSchema),
        async (c) => c.json({ id: await deps.kalender.kategorieAnlegen(c.req.valid('json')) }, 201),
      )
      .put(
        '/kalender/kategorien/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', eventKategorieEingabeSchema),
        async (c) => {
          gefunden(
            await deps.kalender
              .kategorieAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(kalenderFehler),
            'Kategorie nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get('/kalender/vorlagen', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.vorlagen(c.req.query('archiv') === '1')),
      )
      .post(
        '/kalender/vorlagen',
        auth,
        kalenderEinrichten,
        zValidator('json', vorlageEingabeSchema),
        async (c) => {
          const id = await deps.kalender.vorlageAnlegen(c.req.valid('json')).catch(kalenderFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/kalender/vorlagen/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', vorlageEingabeSchema),
        async (c) => {
          gefunden(
            await deps.kalender
              .vorlageAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(kalenderFehler),
            'Vorlage nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/kalender/vorlagen/:id', auth, kalenderEinrichten, async (c) => {
        gefunden(
          await deps.kalender.vorlageLoeschen(c.req.param('id')).catch(kalenderFehler),
          'Vorlage nicht gefunden',
        );
        return c.json({ ok: true });
      })
      // ----- Kalender: Serien
      .get('/kalender/serien', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.serienMitAnzahl()),
      )
      .post(
        '/kalender/serien',
        auth,
        kalenderEinrichten,
        zValidator('json', serieEingabeSchema),
        async (c) => {
          const id = await deps.kalender.serieAnlegen(c.req.valid('json')).catch(kalenderFehler);
          await bestEffort(() => serienMarkeFreigeben(deps.benachrichtigungen));
          return c.json({ id, erzeugt: await serieSofort(id) }, 201);
        },
      )
      .put(
        '/kalender/serien/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', serieAendernSchema),
        async (c) => {
          const { bestehende, ...daten } = c.req.valid('json');
          return (
            (await serienAenderung(c, () =>
              deps.kalender.serieAktualisieren(c.req.param('id'), daten, bestehende),
            )) ?? c.json({ ok: true, erzeugt: await serieSofort(c.req.param('id')) })
          );
        },
      )
      .put(
        '/kalender/serien/:id/aktiv',
        auth,
        kalenderEinrichten,
        zValidator('json', serieAktivSchema),
        async (c) => {
          const { aktiv, bestehende } = c.req.valid('json');
          return (
            (await serienAenderung(c, () =>
              deps.kalender.serieAktivSetzen(c.req.param('id'), aktiv, bestehende),
            )) ?? c.json({ aktiv, erzeugt: aktiv ? await serieSofort(c.req.param('id')) : 0 })
          );
        },
      )
      .delete(
        '/kalender/serien/:id',
        auth,
        kalenderEinrichten,
        zValidator('query', z.object({ bestehende: serienBestehendeSchema.optional() })),
        async (c) =>
          (await serienAenderung(c, () =>
            deps.kalender.serieLoeschen(c.req.param('id'), c.req.valid('query').bestehende),
          )) ?? c.json({ ok: true }),
      )
      // ----- Kalender: global "Dienste fehlen" reminders
      .get('/kalender/erinnerungen', auth, kalenderLesen, async (c) =>
        c.json({ minutenVorher: await deps.kalender.erinnerungen() }),
      )
      .put(
        '/kalender/erinnerungen',
        auth,
        kalenderEinrichten,
        zValidator('json', erinnerungenEingabeSchema),
        async (c) => {
          const { minutenVorher } = c.req.valid('json');
          await deps.kalender.erinnerungenSetzen(minutenVorher);
          return c.json({ minutenVorher: await deps.kalender.erinnerungen() });
        },
      )
      // ----- Kalender: Statistik
      .get(
        '/kalender/statistik',
        auth,
        kalenderLesen,
        zValidator('query', statistikJahrSchema),
        async (c) => {
          const { jahr } = c.req.valid('query');
          const zeilen = await deps.kalender.statistik(jahr);
          return c.json({ jahr, zeilen: await personenMitUsernames(zeilen) });
        },
      )
      // ----- Kalender: ICS feed and own Dienste
      .get('/me/kalender-token', auth, kalenderLesen, async (c) =>
        c.json({ vorhanden: await deps.kalender.tokenVorhanden(c.get('user').sub) }),
      )
      .post('/me/kalender-token', auth, kalenderLesen, async (c) => {
        const sub = c.get('user').sub;
        if (!(await deps.mitglieder.holen(sub)))
          throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        return c.json({ token: await deps.kalender.tokenErzeugen(sub) });
      })
      // Public on purpose (no `auth`): calendar apps cannot send a bearer token; the secret token
      // in the URL is the credential. API Gateway needs a matching route without authorizer.
      .get('/kalender/feed/:token', async (c) => {
        const token = c.req.param('token').replace(/\.ics$/, '');
        const sub = await deps.kalender.subPerTokenHash(tokenHash(token));
        if (!sub) throw new HTTPException(404, { message: 'Kalender nicht gefunden' });
        // The token owner must still be active and allowed to read the calendar (like `auth`: a
        // member without a profile row counts as an active Anwärter).
        const [inhaber, rollen, rechte] = await Promise.all([
          deps.mitglieder.holen(sub),
          deps.userAdmin.rollen(),
          deps.posten.rechteVon(sub),
        ]);
        const erlaubt = permissionsFor(
          rollen.get(sub) ?? [],
          inhaber?.status ?? 'anwaerter',
          rechte,
        );
        if ((inhaber && istDeaktiviert(inhaber)) || !erlaubt.includes('kalender:lesen')) {
          throw new HTTPException(404, { message: 'Kalender nicht gefunden' });
        }
        const ab = new Date(Date.now() - FEED_RUECKBLICK_TAGE * 24 * 3600 * 1000);
        const [dienste, eventListe] = await Promise.all([
          deps.kalender.meineDienste(sub, ab),
          deps.kalender.meineEvents(sub, ab),
        ]);
        const termine = [
          ...dienstTermine(dienste, deps.appUrl),
          ...eventTermine(eventListe, deps.appUrl),
        ];
        return c.body(icsErzeugen(termine, { kalenderName: 'C4 – Mein Kalender' }), 200, {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'no-store',
        });
      })
  );
  // ----- Contact cards (vCard): the phone's Contacts app opens a plain URL, so the link carries a
  // short-lived token of the viewing member instead of a bearer token.;
};
