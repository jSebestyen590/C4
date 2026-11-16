import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  eventEingabeSchema,
  heuteBerlin,
  stimmzettelFehler,
  stimmzettelSchema,
  umfrageEingabeSchema,
  umfrageLaeuft,
  ungueltigNachAenderung,
  ausVorlage,
  ausVorlageZuZeit,
  bedarfZusammen,
  dienstVerteilung,
  MAX_DAUER_MS,
  terminSpanne,
  terminWahlSchema,
  type EventEingabe,
  type UmfrageListeDto,
  type UmfrageTermin,
  privatpartyOptionName,
} from '@c4/shared';
import { bestEffort } from '../benachrichtigungen';
import { UmfrageKonflikt, type UmfragenCursor } from '../umfragen';
import {
  alsDetailDto,
  alsListeDto,
  darfBearbeiten,
  darfAbstimmen,
  darfSehen,
  gueltigAbgestimmt,
  kreisDerUmfrage,
  type Aufrufer,
} from '../umfrageAnsicht';
import { meldeErneutAbstimmen, meldeNeueUmfrage, meldeTermin } from '../umfrageBenachrichtigungen';
import { istDeaktiviert } from '../mitglieder';
import { terminQuellen as terminQuellenModul } from '../umfrageSpeichern';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';
import { cursorSchreiben, cursorLesen, MITGLIED_DEAKTIVIERT } from './kontext';

/** Ended polls per page, and how many are read from the database at once to fill one. */
export const UMFRAGEN_SEITE = 20;

const UMFRAGEN_STAPEL = 50;

export const umfragenRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    umfragenLesen,
    umfragenVerwalten,
    kalenderFehler,
    umfrageKontext,
    umfrageSpeichern,
    terminVorbereiten,
    eigenesProfilMussExistieren,
    gefunden,
    akteurMitName,
  } = ctx;

  const umfrageAufrufer = (c: {
    get(k: 'user'): { sub: string };
    get(k: 'permissions'): string[];
  }): Aufrufer => ({
    sub: c.get('user').sub,
    verwaltung: c.get('permissions').includes('umfragen:verwalten'),
  });

  /** Like `umfrageAufrufer`; holders of `privatpartys:verwalten` also see, handle and vote in the polls of Privatpartys. */
  const aufruferMitParty = async (c: Parameters<typeof umfrageAufrufer>[0]): Promise<Aufrufer> => {
    const a = umfrageAufrufer(c);
    if (a.verwaltung || !c.get('permissions').includes('privatpartys:verwalten')) return a;
    return { ...a, privatpartys: await deps.privatpartys.umfrageIds() };
  };

  /** The poll if the caller may see it; 404 otherwise, so other polls stay hidden. */
  const sichtbareUmfrage = async (id: string, a: Aufrufer) => {
    const [u, k] = await Promise.all([deps.umfragen.holen(id), umfrageKontext()]);
    if (!u || !darfSehen(u, kreisDerUmfrage(u, k), a)) {
      throw new HTTPException(404, { message: 'Umfrage nicht gefunden' });
    }
    return { u, k };
  };

  const terminQuellen = (termin: UmfrageTermin, nurAktive: boolean) =>
    terminQuellenModul(deps.kalender, termin, nurAktive);

  /** Dauer and Bedarf of a scheduling poll for display (all Dienstformen of a Vorlage together). */
  const terminAnzeige = async (termin: UmfrageTermin) => {
    const [{ vorlage, kategorie }, dienstformen] = await Promise.all([
      terminQuellen(termin, false),
      deps.kalender.dienstformen(true),
    ]);
    const plaetze = vorlage
      ? vorlage.schichten.flatMap((s) => (s.art === 'betrieb' ? s.bedarfe : []))
      : termin.bedarf
        ? [termin.bedarf]
        : [];
    const zusammen = bedarfZusammen(plaetze);
    return {
      terminDauer: kategorie?.dauer ?? null,
      terminBedarf:
        kategorie?.art === 'dienste' && plaetze.length > 0
          ? {
              minimum: zusammen.minimum,
              wunsch: zusammen.wunsch,
              dienstformen: zusammen.dienstformIds.map(
                (id) => dienstformen.find((d) => d.id === id)?.name ?? id,
              ),
            }
          : null,
    };
  };

  /** 400 when one of the members is deactivated (unknown subs are left to the store). */
  const personenAktivPruefen = async (subs: readonly string[]) => {
    if (subs.length === 0) return;
    const rows = await deps.mitglieder.alle();
    const deaktiviert = new Set(rows.filter(istDeaktiviert).map((r) => r.sub));
    if (subs.some((s) => deaktiviert.has(s))) {
      throw new HTTPException(400, { message: MITGLIED_DEAKTIVIERT });
    }
  };

  return (
    new Hono<AuthEnv>()
      .get('/umfragen', auth, umfragenLesen, async (c) => {
        const a = await aufruferMitParty(c);
        const [liste, k] = await Promise.all([
          deps.umfragen.laufende(heuteBerlin()),
          umfrageKontext(),
        ]);
        return c.json(
          liste.flatMap((u) => {
            const kreis = kreisDerUmfrage(u, k);
            return darfSehen(u, kreis, a) ? [alsListeDto(u, k, a, kreis)] : [];
          }),
        );
      })
      // Ended polls page by page; `weiter` is the cursor of the next page (null: no more).
      .get('/umfragen/beendet', auth, umfragenLesen, async (c) => {
        const a = await aufruferMitParty(c);
        const heute = heuteBerlin();
        const k = await umfrageKontext();
        let nach = cursorLesen(c.req.query('nach'));
        const seite: { dto: UmfrageListeDto; cursor: UmfragenCursor }[] = [];
        // Visibility is checked here, so read on until the page and one more are found.
        for (;;) {
          const stapel = await deps.umfragen.beendete(heute, UMFRAGEN_STAPEL, nach);
          for (const u of stapel) {
            const kreis = kreisDerUmfrage(u, k);
            nach = { erstelltAm: u.erstelltAm, id: u.id };
            if (darfSehen(u, kreis, a))
              seite.push({ dto: alsListeDto(u, k, a, kreis), cursor: nach });
            if (seite.length > UMFRAGEN_SEITE) break;
          }
          if (seite.length > UMFRAGEN_SEITE || stapel.length < UMFRAGEN_STAPEL) break;
        }
        const umfragen = seite.slice(0, UMFRAGEN_SEITE);
        const letzte = umfragen.at(-1)?.cursor;
        return c.json({
          umfragen: umfragen.map((e) => e.dto),
          weiter: seite.length > UMFRAGEN_SEITE && letzte ? cursorSchreiben(letzte) : null,
        });
      })
      .get('/umfragen/:id', auth, umfragenLesen, async (c) => {
        const a = await aufruferMitParty(c);
        const { u, k } = await sichtbareUmfrage(c.req.param('id'), a);
        const dto = alsDetailDto(u, k, a);
        return c.json(u.termin ? { ...dto, ...(await terminAnzeige(u.termin)) } : dto);
      })
      .post(
        '/umfragen',
        auth,
        umfragenLesen,
        zValidator('json', umfrageEingabeSchema),
        async (c) => {
          const sub = c.get('user').sub;
          await eigenesProfilMussExistieren(sub);
          const eingabe = await terminVorbereiten(c.req.valid('json'));
          await personenAktivPruefen([...eingabe.pflicht.personen, ...eingabe.optional.personen]);
          const id = await deps.umfragen.anlegen(umfrageSpeichern(eingabe), sub);
          await bestEffort(async () => {
            const [u, k, akteur] = await Promise.all([
              deps.umfragen.holen(id),
              umfrageKontext(),
              akteurMitName(sub),
            ]);
            if (u) await meldeNeueUmfrage(deps.benachrichtigungen, u, k, akteur);
          });
          return c.json({ id }, 201);
        },
      )
      .put(
        '/umfragen/:id',
        auth,
        umfragenLesen,
        zValidator('json', umfrageEingabeSchema),
        async (c) => {
          const a = umfrageAufrufer(c);
          const { u, k } = await sichtbareUmfrage(c.req.param('id'), a);
          if (!darfBearbeiten(u, a)) throw new HTTPException(403, { message: 'Forbidden' });
          if (!umfrageLaeuft(u)) {
            throw new HTTPException(409, { message: 'Die Umfrage ist beendet.' });
          }
          const eingabe = await terminVorbereiten(c.req.valid('json'));
          // Persons already in the circle may stay, even if they were deactivated since.
          const bisher = new Set([...u.pflicht.personen, ...u.optional.personen]);
          await personenAktivPruefen(
            [...eingabe.pflicht.personen, ...eingabe.optional.personen].filter(
              (p) => !bisher.has(p),
            ),
          );
          if (eingabe.anonym !== u.anonym && u.abgaben.length > 0) {
            throw new HTTPException(400, {
              message: 'Nach der ersten Stimme lässt sich „anonym“ nicht mehr ändern.',
            });
          }
          const daten = umfrageSpeichern(eingabe, u);
          const aenderung = ungueltigNachAenderung(
            daten.fragen.map((f) => ({
              ...f,
              optionIds: f.optionen.map((o) => o.id),
              leerErlaubt: daten.termin !== null || daten.terminFrei,
            })),
            u.stimmen,
            u.abgaben.map((x) => x.sub),
          );
          const schonOffen = new Set(u.abgaben.filter((x) => x.erneutNoetig).map((x) => x.sub));
          const betroffen = aenderung.erneut.filter((s) => !schonOffen.has(s));
          if (betroffen.length > 0 && !eingabe.bestaetigt) {
            return c.json(
              {
                error: 'Durch die Änderung müssen einige erneut abstimmen.',
                betroffene: betroffen.length,
              },
              409,
            );
          }
          gefunden(
            await deps.umfragen.aktualisieren(u.id, daten, aenderung),
            'Umfrage nicht gefunden',
          );
          await bestEffort(async () => {
            const neu = await deps.umfragen.holen(u.id);
            if (!neu) return;
            const vorher = kreisDerUmfrage(u, k);
            const hinzu = new Set(
              [...kreisDerUmfrage(neu, k).keys()].filter((s) => !vorher.has(s)),
            );
            await Promise.all([
              meldeErneutAbstimmen(
                deps.benachrichtigungen,
                neu,
                betroffen.filter((s) => s !== a.sub),
              ),
              hinzu.size > 0
                ? meldeNeueUmfrage(
                    deps.benachrichtigungen,
                    neu,
                    k,
                    await akteurMitName(a.sub),
                    hinzu,
                  )
                : undefined,
            ]);
          });
          return c.json({ ok: true });
        },
      )
      .post('/umfragen/:id/beenden', auth, umfragenLesen, async (c) => {
        const a = await aufruferMitParty(c);
        const { u } = await sichtbareUmfrage(c.req.param('id'), a);
        if (!darfBearbeiten(u, a)) throw new HTTPException(403, { message: 'Forbidden' });
        if (!umfrageLaeuft(u))
          throw new HTTPException(409, { message: 'Die Umfrage ist beendet.' });
        await deps.umfragen.beenden(u.id, new Date());
        return c.json({ ok: true });
      })
      .post(
        '/umfragen/:id/event',
        auth,
        umfragenLesen,
        zValidator('json', terminWahlSchema),
        async (c) => {
          const a = await aufruferMitParty(c);
          const { u, k } = await sichtbareUmfrage(c.req.param('id'), a);
          if (!darfBearbeiten(u, a)) throw new HTTPException(403, { message: 'Forbidden' });
          const termin = u.termin;
          if (!termin) throw new HTTPException(400, { message: 'Das ist keine Terminumfrage.' });
          if (umfrageLaeuft(u)) {
            throw new HTTPException(409, { message: 'Beende die Umfrage zuerst.' });
          }
          // A deleted event may be created again.
          if (u.eventId && (await deps.kalender.event(u.eventId))) {
            throw new HTTPException(409, {
              message: 'Aus dieser Umfrage gibt es schon ein Event.',
            });
          }
          const { optionId } = c.req.valid('json');
          const option = u.fragen[0]?.optionen.find((o) => o.id === optionId);
          if (!option?.termin) throw new HTTPException(400, { message: 'Unbekannter Termin.' });
          const { vorlage, kategorie } = await terminQuellen(termin, true);
          if (!kategorie || (termin.vorlageId && !vorlage)) {
            throw new HTTPException(409, {
              message: `${vorlage || !termin.vorlageId ? 'Die Kategorie' : 'Die Vorlage'} gibt es nicht mehr. Lege das Event im Kalender an.`,
            });
          }
          const gueltig = gueltigAbgestimmt(u);
          const vorhanden = new Set(k.mitglieder.map((m) => m.sub));
          const zustimmende = [
            ...new Set(
              u.stimmen
                .filter(
                  (s) => s.optionId === option.id && gueltig.has(s.sub) && vorhanden.has(s.sub),
                )
                .map((s) => s.sub),
            ),
          ];
          // A title taken over from the Vorlage or Kategorie stays empty, so the event follows them.
          const vorgabe = vorlage?.titel || kategorie.name;
          const titel = u.titel === vorgabe ? (vorlage?.titel ?? '') : u.titel;
          const teilnahme = kategorie.art === 'teilnahme';
          // The poll of a Privatparty: the chosen option is one of its wish dates (found by its name).
          const privatparty = await deps.privatpartys.nachUmfrage(u.id);
          if (
            privatparty &&
            (privatparty.status === 'abgesagt' ||
              (privatparty.status === 'zugesagt' &&
                privatparty.eventId &&
                (await deps.kalender.event(privatparty.eventId))))
          ) {
            throw new HTTPException(409, {
              message: 'Die Privatparty ist bereits zugesagt oder abgesagt.',
            });
          }
          const wunschTermin = privatparty?.termine.find(
            (t) =>
              t.datum === option.termin!.datum && privatpartyOptionName(t) === option.termin!.name,
          );
          let eingabe: EventEingabe;
          if (vorlage && privatparty) {
            // No contact data or request title in the event, only the Vorlage's (else a plain) title.
            const ausDerVorlage = wunschTermin
              ? ausVorlageZuZeit(
                  vorlage,
                  option.termin.datum,
                  wunschTermin.beginn,
                  wunschTermin.ende,
                  kategorie,
                )
              : ausVorlage(vorlage, option.termin.datum, kategorie);
            eingabe = {
              ...ausDerVorlage,
              titel: vorlage.titel.trim() || 'Privatparty',
              teilnahmeStatus: teilnahme ? [] : null,
              eingeladen: teilnahme ? zustimmende : [],
            };
          } else if (vorlage) {
            const ausDerVorlage = ausVorlage(vorlage, option.termin.datum, kategorie);
            eingabe = {
              ...ausDerVorlage,
              titel,
              beschreibung: u.beschreibung ?? ausDerVorlage.beschreibung,
              teilnahmeStatus: teilnahme ? [] : null,
              eingeladen: teilnahme ? zustimmende : [],
            };
          } else {
            const { beginn, ende } = terminSpanne(termin, option.termin, kategorie.dauer);
            // One Schicht from the start, at most 24 hours (multi-day events get more by hand).
            const schichtEnde = new Date(
              Math.min(new Date(ende).getTime(), new Date(beginn).getTime() + MAX_DAUER_MS),
            ).toISOString();
            eingabe = eventEingabeSchema.parse({
              titel,
              beschreibung: u.beschreibung,
              kategorieId: kategorie.id,
              beginn,
              ende,
              schichten:
                !teilnahme && termin.bedarf
                  ? [{ art: 'betrieb', beginn, ende: schichtEnde, bedarfe: [termin.bedarf] }]
                  : [],
              teilnahmeStatus: teilnahme ? [] : null,
              eingeladen: teilnahme ? zustimmende : [],
            });
          }
          const eventId = await deps.kalender.eventAnlegen(eingabe, a.sub).catch(kalenderFehler);
          await deps.umfragen.eventSetzen(u.id, eventId, option.id);
          if (privatparty) {
            await deps.privatpartys.zusagen(privatparty.id, wunschTermin?.id ?? null, eventId);
          }
          if (!teilnahme) {
            // Everybody who agreed gets one Dienst: first up to every Minimum, then every Wunsch.
            const schichten = (await deps.kalender.event(eventId))?.schichten ?? [];
            const plaetze = schichten.flatMap((sch) =>
              sch.art === 'betrieb' ? sch.bedarfe.map((b) => ({ schichtId: sch.id, ...b })) : [],
            );
            for (const { sub, platz } of dienstVerteilung(plaetze, zustimmende)) {
              await deps.kalender
                .dienstEintragen(
                  platz.schichtId,
                  { dienstformId: platz.dienstformId, kommentar: null, mitgliedSub: sub },
                  a.sub,
                )
                .catch((err: unknown) => console.error('Poll: entering a Dienst failed', err));
            }
          }
          await bestEffort(() =>
            meldeTermin(
              deps.benachrichtigungen,
              { titel: u.titel, eventId, text: option.text },
              [...kreisDerUmfrage(u, k).keys()].filter((s) => s !== a.sub),
              new Set(zustimmende),
            ),
          );
          return c.json({ eventId }, 201);
        },
      )
      .delete('/umfragen/:id', auth, umfragenVerwalten, async (c) => {
        gefunden(await deps.umfragen.loeschen(c.req.param('id')), 'Umfrage nicht gefunden');
        return c.json({ ok: true });
      })
      .put(
        '/umfragen/:id/stimme',
        auth,
        umfragenLesen,
        zValidator('json', stimmzettelSchema),
        async (c) => {
          const a = await aufruferMitParty(c);
          const { u, k } = await sichtbareUmfrage(c.req.param('id'), a);
          if (!darfAbstimmen(u, kreisDerUmfrage(u, k), a)) {
            throw new HTTPException(403, { message: 'Du bist bei dieser Umfrage nicht gefragt.' });
          }
          if (!umfrageLaeuft(u))
            throw new HTTPException(409, { message: 'Die Umfrage ist beendet.' });
          await eigenesProfilMussExistieren(a.sub);
          const zettel = c.req.valid('json');
          const fehler = stimmzettelFehler(
            u.fragen.map((f) => ({
              ...f,
              optionIds: f.optionen.map((o) => o.id),
              leerErlaubt: u.termin !== null || u.terminFrei,
            })),
            zettel,
          );
          if (fehler) throw new HTTPException(400, { message: fehler });
          await deps.umfragen
            .abstimmen(
              u.id,
              a.sub,
              zettel.antworten.flatMap((x) => [
                ...x.optionIds.map((optionId) => ({
                  frageId: x.frageId,
                  optionId,
                  freitext: null,
                })),
                ...(x.freitext
                  ? [{ frageId: x.frageId, optionId: null, freitext: x.freitext }]
                  : []),
              ]),
            )
            .catch((e: unknown) => {
              if (e instanceof UmfrageKonflikt)
                throw new HTTPException(409, { message: e.message });
              throw e;
            });
          return c.json({ ok: true });
        },
      )
  );
  // ----- Waren: Lagerorte;
};
