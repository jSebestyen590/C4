import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createUserSchema,
  einstellungSchema,
  pushAboLoeschenSchema,
  pushAboSchema,
  dienstEintragenSchema,
  verfuegbarkeitSchema,
  dienstformEingabeSchema,
  eventEingabeSchema,
  eventKategorieEingabeSchema,
  dienstTermine,
  eventTermine,
  icsErzeugen,
  externeEingabeSchema,
  externeZusammenfuehrenSchema,
  geburtstageZeitraumSchema,
  geburtstageZwischen,
  type GeburtstagDto,
  type MitgliedHistorie,
  kalenderZeitraumSchema,
  statistikJahrSchema,
  vorlageEingabeSchema,
  serieAendernSchema,
  serieAktivSchema,
  serieEingabeSchema,
  serienBestehendeSchema,
  erinnerungenEingabeSchema,
  emailAendernSchema,
  emailBestaetigenSchema,
  datumBerlin,
  heuteBerlin,
  besetzungAnlegenSchema,
  besetzungEingabeSchema,
  einlagerungenSchema,
  einlagerungSchema,
  entnahmenSchema,
  entnahmeSchema,
  umlagerungenSchema,
  ausleiheAendernSchema,
  ausleiheSchema,
  gebindeSchema,
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
  inventurAbschlussSchema,
  inventurStartenSchema,
  inventurZaehlungSchema,
  boedenHinzufuegenSchema,
  ifcoTypSchema,
  lagerortAnlegenSchema,
  lagerortReihenfolgeSchema,
  lagerortSchema,
  lagerortWarenSchema,
  wareSchema,
  warengruppeSchema,
  mitgliedAktualisierenSchema,
  postenAktualisierenSchema,
  postenArchivierenSchema,
  postenRechteSetzenSchema,
  profilbildAnfrageSchema,
  setGroupsSchema,
  setMitgliedAktivSchema,
  setMitgliedStatusSchema,
  statusEintragEingabeSchema,
  setUsernameSchema,
  type DienstPerson,
  type EventDto,
  type Health,
  type Me,
  type DeaktivierenVorschau,
  type Mitglied,
  type Posten,
  bezeichnungFuer,
  schluesselAnlegenSchema,
  stimmzettelFehler,
  stimmzettelSchema,
  umfrageEingabeSchema,
  umfrageLaeuft,
  ungueltigNachAenderung,
  ausVorlage,
  bedarfZusammen,
  dienstVerteilung,
  MAX_DAUER_MS,
  terminDauerFehler,
  terminNormalisieren,
  terminSpanne,
  terminText,
  terminWahlSchema,
  type EventEingabe,
  type UmfrageListeDto,
  type UmfrageTermin,
  schluesselEingabeSchema,
  uebergabeSchema,
  type Halter,
  type HalterDto,
  type SchluesselDetailDto,
  type SchluesselDto,
  durchgangEingabeSchema,
  jahreMitEintraegen,
  koenige,
  literZuMl,
  rangliste,
  trichterAendernSchema,
  trichterEingabeSchema,
  TRICHTER_DURCHGAENGE_SEITE,
  type DurchgaengeSeiteDto,
  type DurchgangDto,
  type TrichterDto,
  type TrichterMitgliedDto,
  type TrichterUebersichtDto,
} from '@c4/shared';
import { UsernameTakenError, type Konto, type UserAdmin } from './admin';
import {
  CodeUngueltig,
  EmailVergeben,
  NeuAnmeldungNoetig,
  type EmailAenderung,
} from './emailaenderung';
import type { MitgliedRow } from './db/schema';
import {
  AblosungUngueltig,
  BesetzungUeberschneidung,
  istAktuell,
  type AktuellerPosten,
  type PostenDetails,
  type PostenStore,
} from './posten';
import {
  EntfernungBestaetigen,
  VerfuegbarkeitBestaetigen,
  KalenderKonflikt,
  KalenderUngueltig,
  SerieBetroffen,
  type BetroffenerDienst,
  type EventAenderung,
  tokenHash,
  type KalenderStore,
} from './kalender';
import { bestEffort, type Benachrichtigungen } from './benachrichtigungen';
import { serieSofortErzeugen, serienMarkeFreigeben } from './kalenderSerien';
import {
  meldeAbsage,
  meldeDienstDurchAndere,
  meldeEventAenderung,
} from './kalenderBenachrichtigungen';
import { WarenKonflikt, WarenUngueltig, type WarenStore } from './waren';
import type { AufraeumDetails, InventarStore } from './inventar';
import { UebergabeKonflikt, type SchluesselDaten, type SchluesselStore } from './schluessel';
import { meldeUebergabe } from './schluesselBenachrichtigungen';
import type { DurchgangDaten, TrichterDaten, TrichterStore } from './trichter';
import type { UmfrageDaten, UmfragenCursor, UmfrageSpeichern, UmfragenStore } from './umfragen';
import {
  alsDetailDto,
  alsListeDto,
  darfBearbeiten,
  darfSehen,
  gueltigAbgestimmt,
  kreisDerUmfrage,
  ladeKontext,
  type Aufrufer,
} from './umfrageAnsicht';
import { meldeErneutAbstimmen, meldeNeueUmfrage, meldeTermin } from './umfrageBenachrichtigungen';
import {
  geburtstagSichtbar,
  kanaeleLesen,
  istDeaktiviert,
  kanaeleSchreiben,
  LetzterStatusEintrag,
  StatusDatumDoppelt,
  type MitgliederStore,
} from './mitglieder';
import { kleinKey, profilbildPrefix, type Profilbilder } from './profilbilder';
import {
  authenticate,
  DEAKTIVIERT,
  requirePermission,
  type AuthEnv,
  type TokenVerifier,
} from './auth';

export interface AppDeps {
  verifyToken: TokenVerifier;
  userAdmin: UserAdmin;
  emailAenderung: EmailAenderung;
  mitglieder: MitgliederStore;
  posten: PostenStore;
  waren: WarenStore;
  inventar: InventarStore;
  kalender: KalenderStore;
  schluessel: SchluesselStore;
  umfragen: UmfragenStore;
  trichter: TrichterStore;
  benachrichtigungen: Benachrichtigungen;
  /** Public origin of the web app (`https://c4.example`) for links in the calendar feed; none = no links. */
  appUrl?: string;
  profilbilder: Profilbilder;
  /** Resolves when the database answers `select 1`. */
  pingDb: () => Promise<void>;
}

/** Maps the email-change errors to HTTP statuses the web app can tell apart. */
async function emailAenderung(aktion: () => Promise<void>): Promise<void> {
  try {
    await aktion();
  } catch (err) {
    if (err instanceof NeuAnmeldungNoetig)
      throw new HTTPException(403, { message: 'Erneute Anmeldung erforderlich' });
    if (err instanceof EmailVergeben)
      throw new HTTPException(409, { message: 'E-Mail-Adresse bereits vergeben' });
    if (err instanceof CodeUngueltig) throw new HTTPException(400, { message: 'Ungültiger Code' });
    throw err;
  }
}

/** The feed also contains Dienste that began this many days ago. */
const FEED_RUECKBLICK_TAGE = 90;
/** Ended polls per page, and how many are read from the database at once to fill one. */
export const UMFRAGEN_SEITE = 20;
const UMFRAGEN_STAPEL = 50;

/** "2026-11-01T09:00:00.000Z_<id>" */
const cursorSchreiben = (c: UmfragenCursor) => `${c.erstelltAm.toISOString()}_${c.id}`;
function cursorLesen(wert: string | undefined): UmfragenCursor | undefined {
  if (!wert) return undefined;
  const trenner = wert.indexOf('_');
  const erstelltAm = new Date(wert.slice(0, trenner));
  if (trenner < 0 || Number.isNaN(erstelltAm.getTime())) {
    throw new HTTPException(400, { message: 'Ungültige Position.' });
  }
  return { erstelltAm, id: wert.slice(trenner + 1) };
}

const MITGLIED_DEAKTIVIERT = 'Das Mitglied ist deaktiviert.';

export function createApp(deps: AppDeps) {
  const auth = authenticate(
    deps.verifyToken,
    async (sub) => {
      const row = await deps.mitglieder.holen(sub);
      return row && { status: row.status, deaktiviert: istDeaktiviert(row) };
    },
    (sub) => deps.posten.rechteVon(sub),
  );
  const adminOnly = requirePermission('users:manage');
  const mitgliederLesen = requirePermission('mitglieder:lesen');
  const profilBearbeiten = requirePermission('profil:bearbeiten');
  const postenLesen = requirePermission('posten:lesen');
  const postenBearbeiten = requirePermission('posten:bearbeiten');
  const warenLesen = requirePermission('waren:lesen');
  const bestandBuchen = requirePermission('bestand:buchen');
  const warenVerwalten = requirePermission('waren:verwalten');
  const inventarLesen = requirePermission('inventar:lesen');
  const inventarUmraeumen = requirePermission('inventar:umraeumen');
  const inventarVerwalten = requirePermission('inventar:verwalten');
  const kalenderLesen = requirePermission('kalender:lesen');
  const eventsVerwalten = requirePermission('events:verwalten');
  const kalenderEinrichten = requirePermission('kalender:einrichten');
  const schluesselLesen = requirePermission('schluessel:lesen');
  const schluesselVerwalten = requirePermission('schluessel:verwalten');
  const umfragenLesen = requirePermission('umfragen:lesen');
  const umfragenVerwalten = requirePermission('umfragen:verwalten');
  const trichterLesen = requirePermission('trichter:lesen');
  const trichterVerwalten = requirePermission('trichter:verwalten');

  /** Merges the profile row with the Cognito account; either side may be missing. */
  const alsMitglied = async (
    sub: string,
    row: MitgliedRow | undefined,
    konto: Konto | undefined,
    rollen?: string[],
    posten: AktuellerPosten[] = [],
  ): Promise<Mitglied> => ({
    sub,
    vorname: row?.vorname ?? '',
    nachname: row?.nachname ?? '',
    anrede: row?.anrede ?? 'neutral',
    kontaktkanaele: kanaeleLesen(row?.kontaktkanaele ?? null),
    discordName: row?.discordName ?? null,
    username: konto?.username ?? null,
    status: row?.status ?? 'anwaerter',
    deaktiviert: istDeaktiviert(row),
    email: konto?.email ?? null,
    aktiviert: konto?.aktiviert ?? true,
    adresse: row?.adresse ?? null,
    telefon: row?.telefon ?? null,
    ueberMich: row?.ueberMich ?? null,
    profilbildKey: row?.profilbildKey ?? null,
    profilbildUrl: row?.profilbildKey
      ? await deps.profilbilder.anzeigeUrl(kleinKey(row.profilbildKey))
      : null,
    profilbildGrossUrl: row?.profilbildKey
      ? await deps.profilbilder.anzeigeUrl(row.profilbildKey)
      : null,
    // Always visible; `geburtstagImKalender` only controls calendar and notifications.
    geburtsdatum: row?.geburtsdatum ?? null,
    geburtstagImKalender: row?.geburtstagImKalender ?? true,
    posten: posten.map((p) => ({
      id: p.id,
      name: p.name,
      bezeichnung: bezeichnungFuer(p, row?.anrede ?? 'neutral'),
    })),
    ...(rollen && { rollen }),
  });

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

  /** Adds the Cognito username to the `ersteller` of Vorgänge/Inventuren (the store only knows the profile row). */
  const mitErstellerUsernames = async <
    T extends { ersteller: { sub: string; username: string | null } | null },
  >(
    liste: T[],
  ): Promise<T[]> => {
    if (!liste.some((e) => e.ersteller)) return liste;
    const konten = await deps.userAdmin.konten();
    return liste.map((e) =>
      e.ersteller
        ? {
            ...e,
            ersteller: {
              ...e.ersteller,
              username: konten.get(e.ersteller.sub)?.username ?? null,
            },
          }
        : e,
    );
  };

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

  const eigenePosten = async (sub: string) =>
    (await deps.posten.aktuelleNachMitglied()).get(sub) ?? [];

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

  /** Maps the Waren store's domain errors to 400 (invalid) and 409 (conflict). */
  const warenFehler = (err: unknown): never => {
    if (err instanceof WarenUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof WarenKonflikt) throw new HTTPException(409, { message: err.message });
    throw err;
  };

  /** Maps the Kalender store's domain errors to 400 (invalid) and 409 (conflict). */
  const kalenderFehler = (err: unknown): never => {
    if (err instanceof KalenderUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof KalenderKonflikt) throw new HTTPException(409, { message: err.message });
    throw err;
  };

  /** Creates the due events of a just saved series in the request; never fails the save. */
  const serieSofort = async (id: string): Promise<number> => {
    try {
      return await serieSofortErzeugen(deps.kalender, id);
    } catch (err) {
      console.error(`Series ${id}: immediate event creation failed`, err);
      return 0;
    }
  };

  /** Runs a series change; a change that affects future events answers 409 with the counts. */
  const serienAenderung = async (
    c: { json: (body: unknown, status: 409) => Response },
    aktion: () => Promise<boolean>,
  ): Promise<Response | null> => {
    try {
      gefunden(await aktion(), 'Serie nicht gefunden');
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

  const schluesselFehler = (err: unknown): never => {
    if (err instanceof UebergabeKonflikt) {
      throw new HTTPException(409, {
        message: 'Der Schlüssel wurde inzwischen anders eingetragen. Lade die Seite neu.',
      });
    }
    throw err;
  };

  const umfrageAufrufer = (c: {
    get(k: 'user'): { sub: string };
    get(k: 'permissions'): string[];
  }): Aufrufer => ({
    sub: c.get('user').sub,
    verwaltung: c.get('permissions').includes('umfragen:verwalten'),
  });

  const umfrageKontext = () => ladeKontext(deps);

  /** The poll if the caller may see it; 404 otherwise, so other polls stay hidden. */
  const sichtbareUmfrage = async (id: string, a: Aufrufer) => {
    const [u, k] = await Promise.all([deps.umfragen.holen(id), umfrageKontext()]);
    if (!u || !darfSehen(u, kreisDerUmfrage(u, k), a)) {
      throw new HTTPException(404, { message: 'Umfrage nicht gefunden' });
    }
    return { u, k };
  };

  /** Validated input with ids: existing questions and options keep theirs, new ones get one. */
  const umfrageSpeichern = (
    e: z.output<typeof umfrageEingabeSchema>,
    bestehend?: UmfrageDaten,
  ): UmfrageSpeichern => {
    if (e.endetAm < heuteBerlin()) {
      throw new HTTPException(400, { message: 'Das Ablaufdatum liegt in der Vergangenheit.' });
    }
    return {
      titel: e.titel,
      beschreibung: e.beschreibung,
      endetAm: e.endetAm,
      anonym: e.anonym,
      ergebnisse: e.ergebnisse,
      pflicht: e.pflicht,
      optional: e.optional,
      erinnerungenPflicht: e.erinnerungenPflicht,
      erinnerungenOptional: e.erinnerungenOptional,
      fragen: e.fragen.map((f) => {
        const alt = bestehend?.fragen.find((x) => x.id === f.id);
        return {
          id: alt?.id ?? randomUUID(),
          text: f.text,
          freitext: f.freitext,
          maxAntworten: f.maxAntworten,
          optionen: f.optionen.map((o) => ({
            id: alt?.optionen.find((x) => x.id === o.id)?.id ?? randomUUID(),
            text: o.text,
            termin: o.termin,
          })),
        };
      }),
      termin: e.termin,
      terminFrei: e.terminFrei,
    };
  };

  /** Kategorie and Vorlage behind a scheduling poll; with a Vorlage its Kategorie counts. */
  const terminQuellen = async (termin: UmfrageTermin, nurAktive: boolean) => {
    const [kategorien, vorlagen] = await Promise.all([
      deps.kalender.kategorien(!nurAktive),
      termin.vorlageId ? deps.kalender.vorlagen(!nurAktive) : Promise.resolve([]),
    ]);
    const vorlage = termin.vorlageId ? vorlagen.find((v) => v.id === termin.vorlageId) : null;
    const kategorie = kategorien.find(
      (k) => k.id === (vorlage ? vorlage.kategorieId : termin.kategorieId),
    );
    return { vorlage: vorlage ?? null, kategorie: kategorie ?? null };
  };

  /**
   * Fits a scheduling poll to its Kategorie (or Vorlage): drops what they decide themselves,
   * checks the rest and fills an empty title with the Vorlage's or Kategorie's name.
   */
  const terminVorbereiten = async (
    e: z.output<typeof umfrageEingabeSchema>,
  ): Promise<z.output<typeof umfrageEingabeSchema>> => {
    if (!e.termin) return e;
    const { vorlage, kategorie } = await terminQuellen(e.termin, true);
    if (e.termin.vorlageId && !vorlage) {
      throw new HTTPException(400, { message: 'Unbekannte Vorlage.' });
    }
    if (!kategorie) throw new HTTPException(400, { message: 'Unbekannte Kategorie.' });
    const [frage] = e.fragen;
    const n = terminNormalisieren(
      { ...e.termin, kategorieId: kategorie.id },
      frage!.optionen,
      kategorie.dauer,
    );
    const fehler = terminDauerFehler(n.termin, n.optionen, kategorie.dauer);
    if (fehler) throw new HTTPException(400, { message: fehler });
    if (!vorlage && kategorie.art === 'teilnahme' && n.termin.bedarf) {
      throw new HTTPException(400, {
        message: 'Bei einer Teilnahme-Kategorie gibt es keine Dienste.',
      });
    }
    if (!vorlage && kategorie.art === 'dienste') {
      if (!n.termin.bedarf) {
        throw new HTTPException(400, {
          message:
            'Bitte wähle die Dienstform und wie viele es mindestens und am liebsten sein sollen.',
        });
      }
      const dienstform = (await deps.kalender.dienstformen(false)).some(
        (d) => d.id === n.termin.bedarf!.dienstformId,
      );
      if (!dienstform) throw new HTTPException(400, { message: 'Unbekannte Dienstform.' });
    }
    return {
      ...e,
      titel: e.titel || vorlage?.titel || kategorie.name,
      termin: n.termin,
      fragen: [
        {
          ...frage!,
          optionen: n.optionen.map((o) => ({
            ...o,
            text: o.termin ? terminText(o.termin) : o.text,
          })),
        },
      ],
    };
  };

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

  /** Display data of key holders and the names used in the Übergabe messages. */
  const schluesselMitglieder = async () => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const zeilen = new Map(rows.map((r) => [r.sub, r]));
    const halter = (h: Halter): HalterDto => {
      if (h?.art !== 'mitglied') return h;
      const zeile = zeilen.get(h.sub);
      return {
        art: 'mitglied',
        sub: h.sub,
        username: konten.get(h.sub)?.username ?? null,
        vorname: zeile?.vorname ?? '',
        nachname: zeile?.nachname ?? '',
        status: zeile?.status ?? 'anwaerter',
        anrede: zeile?.anrede ?? 'neutral',
      };
    };
    const name = (sub: string) => {
      const zeile = zeilen.get(sub);
      return (
        konten.get(sub)?.username ??
        (`${zeile?.vorname ?? ''} ${zeile?.nachname ?? ''}`.trim() || 'Jemand')
      );
    };
    return { halter, name };
  };

  const alsSchluesselDto = (
    s: SchluesselDaten,
    halter: (h: Halter) => HalterDto,
  ): SchluesselDto => ({
    id: s.id,
    name: s.name,
    beschreibung: s.beschreibung,
    archiviert: s.archiviert,
    halter: halter(s.halter),
    halterSeit: s.halterSeit?.toISOString() ?? null,
  });

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

  /** Dienste and Externe reference the entering member's profile row. */
  const eigenesProfilMussExistieren = async (sub: string) => {
    if (!(await deps.mitglieder.holen(sub))) {
      throw new HTTPException(400, { message: 'Bitte lege zuerst dein Profil an.' });
    }
  };

  /** 409 for a deactivated account: its status (history) is frozen. */
  const statusVerlaufBearbeitbar = async (sub: string) => {
    if (istDeaktiviert(await deps.mitglieder.holen(sub))) {
      throw new HTTPException(409, {
        message: 'Der Account ist deaktiviert, der Status kann nicht geändert werden.',
      });
    }
  };

  /** Maps the store's status history errors to HTTP errors. */
  const statusVerlaufSchreiben = async <T>(aktion: () => Promise<T>): Promise<T> => {
    try {
      return await aktion();
    } catch (err) {
      if (err instanceof StatusDatumDoppelt) {
        throw new HTTPException(409, {
          message: 'Für dieses Datum gibt es schon einen Statuseintrag.',
        });
      }
      if (err instanceof LetzterStatusEintrag) {
        throw new HTTPException(400, {
          message: 'Der letzte Statuseintrag kann nicht gelöscht werden.',
        });
      }
      throw err;
    }
  };

  /** 404 unless the store found the entry (`false` / `undefined` mean it does not exist). */
  const gefunden = <T>(wert: T | false | undefined, meldung: string): T => {
    if (wert === false || wert === undefined) throw new HTTPException(404, { message: meldung });
    return wert;
  };

  /** The acting member for push texts: username, else Vorname. */
  const akteurMitName = async (sub: string): Promise<{ sub: string; name: string }> => {
    const [konten, profil] = await Promise.all([
      deps.userAdmin.konten(),
      deps.mitglieder.holen(sub),
    ]);
    return { sub, name: konten.get(sub)?.username || profil?.vorname || 'Jemand' };
  };

  /** Besetzungen may only name members that already have a profile row. */
  const mitgliedMussExistieren = async (sub: string) => {
    const row = await deps.mitglieder.holen(sub);
    if (!row) throw new HTTPException(400, { message: 'Mitglied hat noch kein Profil' });
    if (istDeaktiviert(row)) throw new HTTPException(400, { message: MITGLIED_DEAKTIVIERT });
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

  /** All members: every profile row plus every enabled account that has no profile yet. */
  const alleMitglieder = async (
    mitRollen: boolean,
    mitDeaktivierten: boolean,
  ): Promise<Mitglied[]> => {
    const [rows, konten, rollen, posten] = await Promise.all([
      deps.mitglieder.alle(),
      deps.userAdmin.konten(),
      mitRollen ? deps.userAdmin.rollen() : undefined,
      deps.posten.aktuelleNachMitglied(),
    ]);
    const nachSub = new Map(rows.map((r) => [r.sub, r]));
    const subs = [
      ...rows.filter((r) => mitDeaktivierten || !istDeaktiviert(r)).map((r) => r.sub),
      ...[...konten.values()].filter((k) => k.enabled && !nachSub.has(k.sub)).map((k) => k.sub),
    ];
    const liste = await Promise.all(
      subs.map((s) =>
        alsMitglied(
          s,
          nachSub.get(s),
          konten.get(s),
          rollen && (rollen.get(s) ?? []),
          posten.get(s),
        ),
      ),
    );
    const sortKey = (m: Mitglied) =>
      `${m.nachname || '\uffff'} ${m.vorname} ${m.username ?? m.email ?? ''}`.toLowerCase();
    return liste.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
  };

  return (
    new Hono<AuthEnv>()
      .basePath('/api')
      .get('/health', async (c) => {
        let db: Health['db'] = 'ok';
        try {
          await deps.pingDb();
        } catch (err) {
          console.error('health: db check failed', err);
          db = 'error';
        }
        return c.json({ status: 'ok', db } satisfies Health, db === 'ok' ? 200 : 503);
      })
      .get('/me', auth, async (c) => {
        const user = c.get('user');
        const me: Me = {
          sub: user.sub,
          anrede: (await deps.mitglieder.holen(user.sub))?.anrede ?? 'neutral',
          preferredUsername: await deps.userAdmin.getPreferredUsername(user.username ?? user.sub),
          groups: user.groups,
          permissions: c.get('permissions'),
        };
        return c.json(me);
      })
      .put('/me/username', auth, zValidator('json', setUsernameSchema), async (c) => {
        const user = c.get('user');
        const { username } = c.req.valid('json');
        try {
          await deps.userAdmin.setPreferredUsername(user.username ?? user.sub, username);
        } catch (err) {
          if (err instanceof UsernameTakenError) {
            throw new HTTPException(409, { message: 'Username already taken' });
          }
          throw err;
        }
        return c.json({ username });
      })
      .put(
        '/me/email',
        auth,
        profilBearbeiten,
        zValidator('json', emailAendernSchema),
        async (c) => {
          await emailAenderung(() =>
            deps.emailAenderung.anfordern(c.get('accessToken'), c.req.valid('json').email),
          );
          return c.json({ ok: true });
        },
      )
      .post(
        '/me/email/bestaetigen',
        auth,
        profilBearbeiten,
        zValidator('json', emailBestaetigenSchema),
        async (c) => {
          await emailAenderung(() =>
            deps.emailAenderung.bestaetigen(c.get('accessToken'), c.req.valid('json').code),
          );
          return c.json({ ok: true });
        },
      )
      .get('/me/mitglied', auth, profilBearbeiten, async (c) => {
        const row = await deps.mitglieder.holen(c.get('user').sub);
        if (!row) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        return c.json(
          await alsMitglied(
            row.sub,
            row,
            (await deps.userAdmin.konten()).get(row.sub),
            undefined,
            await eigenePosten(row.sub),
          ),
        );
      })
      .put(
        '/me/mitglied',
        auth,
        profilBearbeiten,
        zValidator('json', mitgliedAktualisierenSchema),
        async (c) => {
          const { sub } = c.get('user');
          const { profilbildKey, kontaktkanaele, ...daten } = c.req.valid('json');
          if (profilbildKey && !profilbildKey.startsWith(profilbildPrefix(sub))) {
            throw new HTTPException(400, { message: 'Ungültiges Profilbild' });
          }
          const vorher = await deps.mitglieder.holen(sub);
          await deps.mitglieder.speichern(sub, {
            ...daten,
            kontaktkanaele: kanaeleSchreiben(kontaktkanaele),
            profilbildKey,
          });
          if (vorher?.profilbildKey && vorher.profilbildKey !== profilbildKey) {
            await deps.profilbilder.loeschen(vorher.profilbildKey).catch((err) => {
              console.error('profilbild: delete failed', err);
            });
          }
          const row = await deps.mitglieder.holen(sub);
          if (!row) throw new Error('Mitglied nach dem Speichern nicht gefunden');
          return c.json(
            await alsMitglied(
              sub,
              row,
              (await deps.userAdmin.konten()).get(sub),
              undefined,
              await eigenePosten(sub),
            ),
          );
        },
      )
      .post(
        '/me/profilbild',
        auth,
        profilBearbeiten,
        zValidator('json', profilbildAnfrageSchema),
        async (c) =>
          c.json(await deps.profilbilder.uploadVorbereiten(c.get('user').sub, c.req.valid('json'))),
      )
      .get('/mitglieder', auth, mitgliederLesen, async (c) => {
        const verwaltet = c.get('permissions').includes('users:manage');
        // Deactivated members are only listed on request, and only for admins.
        const mitDeaktivierten = verwaltet && c.req.query('deaktivierte') === '1';
        return c.json(await alleMitglieder(verwaltet, mitDeaktivierten));
      })
      // `kennung` is the username; members that have none yet are addressed by their sub.
      .get('/mitglieder/:kennung', auth, mitgliederLesen, async (c) => {
        const kennung = c.req.param('kennung');
        // Deactivated members stay reachable: links from old Dienste, Trichter and the Verlauf point here.
        const liste = await alleMitglieder(c.get('permissions').includes('users:manage'), true);
        const mitglied =
          liste.find((m) => m.sub === kennung) ??
          liste.find((m) => m.username?.toLowerCase() === kennung.toLowerCase());
        if (!mitglied) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        return c.json(mitglied);
      })
      // Status history, Posten and deactivation date of a member (same visibility as the member itself).
      .get('/mitglieder/:kennung/historie', auth, mitgliederLesen, async (c) => {
        const kennung = c.req.param('kennung');
        const liste = await alleMitglieder(c.get('permissions').includes('users:manage'), true);
        const mitglied =
          liste.find((m) => m.sub === kennung) ??
          liste.find((m) => m.username?.toLowerCase() === kennung.toLowerCase());
        if (!mitglied) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        const [verlauf, besetzungen, row] = await Promise.all([
          deps.mitglieder.statusVerlauf(mitglied.sub),
          deps.posten.besetzungenVon(mitglied.sub),
          deps.mitglieder.holen(mitglied.sub),
        ]);
        const historie: MitgliedHistorie = {
          statusVerlauf: verlauf,
          besetzungen: besetzungen.map((b) => ({
            postenId: b.postenId,
            postenName: b.postenName,
            start: b.startDatum,
            ende: b.endDatum,
          })),
          deaktiviertAm: row?.deaktiviertAm ? heuteBerlin(row.deaktiviertAm) : null,
        };
        return c.json(historie);
      })
      .post(
        '/admin/mitglieder/:sub/status-verlauf',
        auth,
        adminOnly,
        zValidator('json', statusEintragEingabeSchema),
        async (c) => {
          const sub = c.req.param('sub');
          await statusVerlaufBearbeitbar(sub);
          const id = await statusVerlaufSchreiben(() =>
            deps.mitglieder.statusEintragAnlegen(sub, c.req.valid('json')),
          );
          gefunden(id, 'Mitglied nicht gefunden');
          return c.json(await deps.mitglieder.statusVerlauf(sub), 201);
        },
      )
      .put(
        '/admin/mitglieder/:sub/status-verlauf/:id',
        auth,
        adminOnly,
        zValidator('json', statusEintragEingabeSchema),
        async (c) => {
          const sub = c.req.param('sub');
          await statusVerlaufBearbeitbar(sub);
          gefunden(
            await statusVerlaufSchreiben(() =>
              deps.mitglieder.statusEintragAendern(sub, c.req.param('id'), c.req.valid('json')),
            ),
            'Eintrag nicht gefunden',
          );
          return c.json(await deps.mitglieder.statusVerlauf(sub));
        },
      )
      .delete('/admin/mitglieder/:sub/status-verlauf/:id', auth, adminOnly, async (c) => {
        const sub = c.req.param('sub');
        await statusVerlaufBearbeitbar(sub);
        gefunden(
          await statusVerlaufSchreiben(() =>
            deps.mitglieder.statusEintragLoeschen(sub, c.req.param('id')),
          ),
          'Eintrag nicht gefunden',
        );
        return c.json(await deps.mitglieder.statusVerlauf(sub));
      })
      .put(
        '/admin/mitglieder/:sub/status',
        auth,
        adminOnly,
        zValidator('json', setMitgliedStatusSchema),
        async (c) => {
          const { status, ab } = c.req.valid('json');
          await statusVerlaufBearbeitbar(c.req.param('sub'));
          if (
            !(await deps.mitglieder.statusSetzen(c.req.param('sub'), status, ab ?? heuteBerlin()))
          ) {
            throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
          }
          return c.json({ status });
        },
      )
      // What is still open for the member; shown before deactivating. Nothing is changed.
      .get('/admin/mitglieder/:sub/deaktivieren-vorschau', auth, adminOnly, async (c) => {
        const sub = c.req.param('sub');
        const heute = heuteBerlin();
        const [dienste, posten, schluessel] = await Promise.all([
          deps.kalender.meineDienste(sub, new Date(Date.now() - 24 * 3600 * 1000)),
          deps.posten.aktuelleNachMitglied(heute),
          deps.schluessel.alle(false),
        ]);
        const gesehen = new Set<string>();
        const vorschau: DeaktivierenVorschau = {
          dienste: dienste.flatMap((d) => {
            const datum = datumBerlin(d.beginn);
            const schluesselDienst = `${d.eventId}|${datum}`;
            if (d.abgesagt || datum < heute || gesehen.has(schluesselDienst)) return [];
            gesehen.add(schluesselDienst);
            return [{ eventId: d.eventId, titel: d.eventTitel, datum }];
          }),
          posten: (posten.get(sub) ?? []).map((p) => ({ id: p.id, name: p.name })),
          schluessel: schluessel
            .filter((s) => s.halter?.art === 'mitglied' && s.halter.sub === sub)
            .map((s) => ({ id: s.id, name: s.name })),
        };
        return c.json(vorschau);
      })
      // Deactivate / reactivate. The database decides (see `authenticate`); Cognito only blocks the login.
      .put(
        '/admin/mitglieder/:sub/aktiv',
        auth,
        adminOnly,
        zValidator('json', setMitgliedAktivSchema),
        async (c) => {
          const sub = c.req.param('sub');
          const { aktiv } = c.req.valid('json');
          if (sub === c.get('user').sub && !aktiv) {
            throw new HTTPException(400, { message: 'Du kannst dich nicht selbst deaktivieren.' });
          }
          const [row, konto] = await Promise.all([
            deps.mitglieder.holen(sub),
            deps.userAdmin.konten().then((k) => k.get(sub)),
          ]);
          if (!row && !konto) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
          await deps.mitglieder.deaktiviertSetzen(sub, !aktiv);
          if (konto) await deps.userAdmin.setEnabled(konto.kontoName, aktiv);
          return c.json({ aktiv });
        },
      )
      .post('/admin/users', auth, adminOnly, zValidator('json', createUserSchema), async (c) => {
        const { email, groups, vorname = '', nachname = '', status } = c.req.valid('json');
        const user = await deps.userAdmin.createUser(email, groups);
        // Every invited user gets a member row right away; names may be filled in later.
        if (user.sub) {
          await deps.mitglieder.speichern(
            user.sub,
            {
              vorname,
              nachname,
              anrede: null,
              kontaktkanaele: null,
              discordName: null,
              adresse: null,
              telefon: null,
              ueberMich: null,
              profilbildKey: null,
              geburtsdatum: null,
              geburtstagImKalender: null,
            },
            status,
          );
        }
        return c.json({ ...user, vorname, nachname, status }, 201);
      })
      .put(
        '/admin/mitglieder/:sub/rollen',
        auth,
        adminOnly,
        zValidator('json', setGroupsSchema),
        async (c) => {
          const sub = c.req.param('sub');
          const { groups } = c.req.valid('json');
          if (sub === c.get('user').sub && !groups.includes('admin')) {
            throw new HTTPException(400, {
              message: 'Du kannst dir die Administrator-Rolle nicht selbst entziehen.',
            });
          }
          const konto = (await deps.userAdmin.konten()).get(sub);
          if (!konto) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
          return c.json({ groups: await deps.userAdmin.setGroups(konto.kontoName, groups) });
        },
      )
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
          await mitgliedMussExistieren(daten.mitgliedSub);
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
      )
      // ----- Schlüssel
      .get('/schluessel', auth, schluesselLesen, async (c) => {
        const mitArchiv = c.req.query('archiv') === '1';
        if (mitArchiv && !c.get('permissions').includes('schluessel:verwalten')) {
          throw new HTTPException(403, { message: 'Forbidden' });
        }
        const [liste, m] = await Promise.all([
          deps.schluessel.alle(mitArchiv),
          schluesselMitglieder(),
        ]);
        return c.json(liste.map((s) => alsSchluesselDto(s, m.halter)));
      })
      .get('/schluessel/:id', auth, schluesselLesen, async (c) => {
        const s = await deps.schluessel.holen(c.req.param('id'));
        if (!s || (s.archiviert && !c.get('permissions').includes('schluessel:verwalten'))) {
          throw new HTTPException(404, { message: 'Schlüssel nicht gefunden' });
        }
        const m = await schluesselMitglieder();
        const dto: SchluesselDetailDto = {
          ...alsSchluesselDto(s, m.halter),
          uebergaben: s.uebergaben.map((u) => ({
            id: u.id,
            von: m.halter(u.von),
            an: m.halter(u.an),
            eingetragenVon: m.halter({ art: 'mitglied', sub: u.eingetragenVon }),
            zeitpunkt: u.zeitpunkt.toISOString(),
          })),
        };
        return c.json(dto);
      })
      .post(
        '/schluessel',
        auth,
        schluesselVerwalten,
        zValidator('json', schluesselAnlegenSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const akteur = c.get('user').sub;
          if (daten.halter?.art === 'mitglied') await mitgliedMussExistieren(daten.halter.sub);
          const id = await deps.schluessel.anlegen(daten, akteur);
          if (daten.halter) {
            const halter = daten.halter;
            await bestEffort(async () => {
              const m = await schluesselMitglieder();
              await meldeUebergabe(deps.benachrichtigungen, {
                schluessel: { id, name: daten.name },
                von: null,
                an: halter,
                akteur,
                name: m.name,
              });
            });
          }
          return c.json({ id }, 201);
        },
      )
      .put(
        '/schluessel/:id',
        auth,
        schluesselVerwalten,
        zValidator('json', schluesselEingabeSchema),
        async (c) => {
          gefunden(
            await deps.schluessel.aktualisieren(c.req.param('id'), c.req.valid('json')),
            'Schlüssel nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .put(
        '/schluessel/:id/archiv',
        auth,
        schluesselVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.schluessel.archivieren(c.req.param('id'), archiviert),
            'Schlüssel nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      .post(
        '/schluessel/:id/uebergaben',
        auth,
        schluesselLesen,
        zValidator('json', uebergabeSchema),
        async (c) => {
          const { von, an } = c.req.valid('json');
          const akteur = c.get('user').sub;
          if (an === null && !c.get('permissions').includes('schluessel:verwalten')) {
            throw new HTTPException(403, {
              message: 'Nur die Schlüsselverwaltung kann einen Schlüssel ohne Halter eintragen.',
            });
          }
          await eigenesProfilMussExistieren(akteur);
          if (an?.art === 'mitglied') await mitgliedMussExistieren(an.sub);
          const s = gefunden(
            await deps.schluessel
              .uebergeben(c.req.param('id'), { von, an }, akteur)
              .catch(schluesselFehler),
            'Schlüssel nicht gefunden',
          );
          const m = await schluesselMitglieder();
          await bestEffort(() =>
            meldeUebergabe(deps.benachrichtigungen, {
              schluessel: s,
              von,
              an,
              akteur,
              name: m.name,
            }),
          );
          return c.json(alsSchluesselDto(s, m.halter));
        },
      )
      // ----- Trichter
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
        await deps.trichter.durchgangLoeschen(d.id);
        return c.json({ ok: true });
      })
      // ----- Umfragen
      .get('/umfragen', auth, umfragenLesen, async (c) => {
        const a = umfrageAufrufer(c);
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
        const a = umfrageAufrufer(c);
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
        const a = umfrageAufrufer(c);
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
        const a = umfrageAufrufer(c);
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
          const a = umfrageAufrufer(c);
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
          let eingabe: EventEingabe;
          if (vorlage) {
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
          const a = umfrageAufrufer(c);
          const { u, k } = await sichtbareUmfrage(c.req.param('id'), a);
          if (!kreisDerUmfrage(u, k).has(a.sub)) {
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
          await deps.umfragen.abstimmen(
            u.id,
            a.sub,
            zettel.antworten.flatMap((x) => [
              ...x.optionIds.map((optionId) => ({ frageId: x.frageId, optionId, freitext: null })),
              ...(x.freitext ? [{ frageId: x.frageId, optionId: null, freitext: x.freitext }] : []),
            ]),
          );
          return c.json({ ok: true });
        },
      )
      // ----- Waren: Lagerorte
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
      // ----- Inventar: Kategorien
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
      // ----- Kalender: Events
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
        return c.json((await eventsMitUsernames([event]))[0]!);
      })
      .post(
        '/kalender/events',
        auth,
        eventsVerwalten,
        zValidator('json', eventEingabeSchema),
        async (c) => {
          const id = await deps.kalender
            .eventAnlegen(c.req.valid('json'), c.get('user').sub)
            .catch(kalenderFehler);
          return c.json({ id }, 201);
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
          try {
            aenderung = gefunden(
              await deps.kalender.eventAktualisieren(id, c.req.valid('json')),
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
          return c.json({ ok: true });
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
        gefunden(
          await deps.kalender.eventLoeschen(c.req.param('id')).catch(kalenderFehler),
          'Event nicht gefunden',
        );
        return c.json({ ok: true });
      })
      // ----- Kalender: Dienste
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
      // ----- Push notifications (generic module, see docs/benachrichtigungen.md)
      .get('/push/schluessel', auth, profilBearbeiten, async (c) =>
        c.json({ publicKey: await deps.benachrichtigungen.publicKey() }),
      )
      .post('/push/abos', auth, profilBearbeiten, zValidator('json', pushAboSchema), async (c) => {
        const sub = c.get('user').sub;
        await eigenesProfilMussExistieren(sub);
        await deps.benachrichtigungen.aboSpeichern(sub, c.req.valid('json'));
        return c.json({ ok: true }, 201);
      })
      .get(
        '/push/abos/status',
        auth,
        profilBearbeiten,
        zValidator('query', pushAboLoeschenSchema),
        async (c) =>
          c.json({
            registriert: await deps.benachrichtigungen.aboRegistriert(
              c.get('user').sub,
              c.req.valid('query').endpoint,
            ),
          }),
      )
      .delete(
        '/push/abos',
        auth,
        profilBearbeiten,
        zValidator('json', pushAboLoeschenSchema),
        async (c) => {
          await deps.benachrichtigungen.aboLoeschen(
            c.get('user').sub,
            c.req.valid('json').endpoint,
          );
          return c.json({ ok: true });
        },
      )
      .post('/push/test', auth, profilBearbeiten, async (c) =>
        c.json(await deps.benachrichtigungen.testSenden(c.get('user').sub)),
      )
      .get('/me/benachrichtigungen', auth, profilBearbeiten, async (c) =>
        c.json(
          gefunden(
            await deps.benachrichtigungen.einstellungen(c.get('user').sub),
            'Mitglied nicht gefunden',
          ),
        ),
      )
      .put(
        '/me/benachrichtigungen',
        auth,
        profilBearbeiten,
        zValidator('json', einstellungSchema),
        async (c) => {
          const { art, aktiv, minuten } = c.req.valid('json');
          gefunden(
            await deps.benachrichtigungen.einstellungSetzen(c.get('user').sub, art, aktiv, minuten),
            'Mitglied nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .onError((err, c) => {
        if (err instanceof HTTPException) {
          if (err.cause === DEAKTIVIERT) {
            return c.json({ error: err.message, deaktiviert: true }, err.status);
          }
          return c.json({ error: err.message }, err.status);
        }
        console.error(err);
        return c.json({ error: 'Internal server error' }, 500);
      })
  );
}
export type AppType = ReturnType<typeof createApp>;
