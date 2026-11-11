import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createUserSchema,
  einstellungSchema,
  verlaufAlleGelesenSchema,
  verlaufSeiteQuerySchema,
  type VerlaufSeiteDto,
  pushAboLoeschenSchema,
  pushAboSchema,
  dienstEintragenSchema,
  verfuegbarkeitSchema,
  vcardErstellen,
  permissionsFor,
  dienstformEingabeSchema,
  eventEingabeSchema,
  bilderOrdnerAnlegenSchema,
  bilderSortieren,
  eventOrdnerDaten,
  ordnerName,
  ordnerNameParsen,
  type BilderListeDto,
  type BilderOrdnerDto,
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
  tagNachher,
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
  protokollBildAnfrageSchema,
  protokollBildPrefix,
  type ProtokollBildUploadDto,
  protokollBildSchluessel,
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
  ausVorlageZuZeit,
  bedarfZusammen,
  dienstVerteilung,
  MAX_DAUER_MS,
  terminSpanne,
  terminWahlSchema,
  type EventEingabe,
  type UmfrageListeDto,
  type UmfrageTermin,
  schluesselEingabeSchema,
  uebergabeSchema,
  anfrageAnlegenSchema,
  antwortSchema,
  planungSchema,
  type AnfrageDto,
  type MitgliedRefDto,
  type PlanungDto,
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
  buchungEingabeSchema,
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
  type KettenErgebnisDto,
  type KontoDto,
  type DurchgaengeSeiteDto,
  type DurchgangDto,
  type TrichterDto,
  type TrichterMitgliedDto,
  type TrichterUebersichtDto,
  aktionenMitZustand,
  bausteinIdsInReihenfolge,
  todoEingabeSchema,
  todoErledigtSchema,
  todoFuerMichErledigt,
  todosSortieren,
  type Todo,
  type TodoQuelle,
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
  leererKreis,
  MITGLIED_STATI,
  PRIVATPARTY_STATI,
  privatpartyEingabeSchema,
  privatpartyNachrichtSchema,
  privatpartyZuordnenSchema,
  type PrivatpartyMailStatusDto,
  type PrivatpartyNachrichtDto,
  privatpartyOptionName,
  privatpartyPersonEingabeSchema,
  privatpartyStatusEingabeSchema,
  privatpartyUmfrageSchema,
  privatpartyUmfrageTitel,
  privatpartyZusageSchema,
  UMFRAGE_ERINNERUNG_STANDARD,
  type PrivatpartyEventKurzDto,
  type PrivatpartyUmfrageKurzDto,
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
  type EventKurz,
  type KalenderStore,
} from './kalender';
import { bestEffort, type Benachrichtigungen } from './benachrichtigungen';
import {
  alsDetailDto as alsPrivatpartyDetailDto,
  alsListeDto as alsPrivatpartyListeDto,
  alsPersonDto as alsPrivatpartyPersonDto,
} from './privatpartyAnsicht';
import { mailJob } from './privatpartyMail';
import type { PartyMail } from './partymailTypen';
import { TerminInBenutzung, type PrivatpartyEintrag, type PrivatpartysStore } from './privatpartys';
import {
  NichtKonfiguriert,
  NichtVerbunden,
  OneDriveFehler,
  OrdnerExistiert,
  OrdnerFehlt,
  PROTOKOLL_PFAD,
  type FreigabenStore,
  type OneDrive,
  type OneDriveOrdner,
  type OrdnerCacheStore,
} from './onedrive';
import { serieSofortErzeugen, serienMarkeFreigeben } from './kalenderSerien';
import {
  meldeAbsage,
  meldeDienstDurchAndere,
  meldeEventAenderung,
} from './kalenderBenachrichtigungen';
import { WarenKonflikt, WarenUngueltig, type WarenStore } from './waren';
import type { AufraeumDetails, InventarStore } from './inventar';
import type { TodoDaten, TodosStore } from './todos';
import { UebergabeKonflikt, type SchluesselDaten, type SchluesselStore } from './schluessel';
import {
  antwortBerechtigte,
  erwarteteHalterJeSchluessel,
  ladeAnfrageKontext,
  meldeAnfrage,
  meldeAntwort,
  meldeGegenvorschlagAngenommen,
  meldePlanung,
  meldeUebergabe,
  type AnfrageKontext,
} from './schluesselBenachrichtigungen';
import {
  AnfrageKonflikt,
  type AnfrageMitAntworten,
  type PlanungDaten,
  type SchluesselAnfragenStore,
} from './schluesselAnfragen';
import type { DurchgangDaten, TrichterDaten, TrichterStore } from './trichter';
import {
  BuchungUngueltig,
  KontoKonflikt,
  KontoUngueltig,
  StornoKonflikt,
  type FinanzenStore,
} from './finanzen';
import {
  ProtokollAbgeschlossen,
  ProtokollExistiert,
  ProtokollVeraltet,
  type ProtokollDaten,
  type ProtokollStore,
} from './protokolle';
import { createProtokollAktionen, rueckschreiben, type Rueckschreibung } from './protokollAktionen';
import {
  kopfAbschliessen,
  kopfOhneSchnappschuss,
  kopfWiederOeffnen,
  naechsteSitzungVorschlagVon,
  protokollArtVon,
  mitgliedDto,
  protokollListen,
  type ProtokollMitglied,
} from './protokolleAnsicht';
import type { UmfragenCursor, UmfragenStore } from './umfragen';
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
  vcardTokenHash,
  StatusDatumDoppelt,
  type MitgliederStore,
} from './mitglieder';
import { kleinKey, profilbildPrefix, type Profilbilder } from './profilbilder';
import {
  terminQuellen as terminQuellenModul,
  terminVorbereiten as terminVorbereitenModul,
  umfrageSpeichern as umfrageSpeichernModul,
} from './umfrageSpeichern';
import type { Protokollbilder } from './protokollbilder';
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
  schluesselAnfragen: SchluesselAnfragenStore;
  todos: TodosStore;
  umfragen: UmfragenStore;
  trichter: TrichterStore;
  finanzen: FinanzenStore;
  protokolle: ProtokollStore;
  privatpartys: PrivatpartysStore;
  /** The Party-Mail mailbox (IMAP/SMTP); `eingerichtet()` is false without the secret. */
  partymail: PartyMail;
  benachrichtigungen: Benachrichtigungen;
  onedrive: OneDrive;
  /** Cache of the anonymous sharing links of the photo folders. */
  freigaben: FreigabenStore;
  /** Last snapshot of the folder list, shown at once while the live list loads. */
  ordnerCache: OrdnerCacheStore;
  /** Public origin of the web app (`https://c4.example`) for links in the calendar feed; none = no links. */
  appUrl?: string;
  profilbilder: Profilbilder;
  protokollbilder: Protokollbilder;
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
/** Notification history entries per page. */
const VERLAUF_SEITE = 30;
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

/** How many Sitzungen without protocol the "new protocol" page offers. */
const PROTOKOLL_SITZUNGEN_MAX = 20;
/** Upcoming Sitzungen offered as "next Sitzung" in the editor. */
const PROTOKOLL_NAECHSTE_SITZUNGEN_MAX = 10;

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
  const finanzenLesen = requirePermission('finanzen:lesen');
  const finanzenBuchen = requirePermission('finanzen:buchen');
  const finanzenVerwalten = requirePermission('finanzen:verwalten');
  const finanzenPruefen = requirePermission('finanzen:pruefen');
  const bilderLesen = requirePermission('bilder:lesen');
  const protokolleLesen = requirePermission('protokolle:lesen');
  const protokolleSchreiben = requirePermission('protokolle:schreiben');
  const privatpartysVerwalten = requirePermission('privatpartys:verwalten');

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
    wohnheim: row?.wohnheim ?? false,
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

  // ----- Bilder (OneDrive photo folders, see docs/bilder.md)

  /** Redirect URI of the OneDrive login: the SPA page, on the app's own origin or the local dev server. */
  const redirectUriPruefen = (uri: string) => {
    const ende = '/app/bilder/einrichtung';
    const ok =
      uri.endsWith(ende) &&
      (!deps.appUrl || uri.startsWith(deps.appUrl) || uri === `http://localhost:5173${ende}`);
    if (!ok) throw new HTTPException(400, { message: 'Ungültige Weiterleitungsadresse.' });
  };

  /** Maps OneDrive errors to HTTP statuses for routes that talk to OneDrive directly. */
  const onedriveFehler = (err: unknown): never => {
    if (err instanceof NichtVerbunden)
      throw new HTTPException(503, { message: 'OneDrive ist nicht verbunden.' });
    if (err instanceof OrdnerExistiert) throw new HTTPException(409, { message: err.message });
    if (err instanceof OrdnerFehlt) throw new HTTPException(404, { message: err.message });
    if (err instanceof NichtKonfiguriert || err instanceof OneDriveFehler)
      throw new HTTPException(400, { message: err.message });
    console.error('OneDrive request failed', err);
    throw new HTTPException(502, { message: 'OneDrive ist gerade nicht erreichbar.' });
  };

  /** Creates the folder's anonymous sharing link (Microsoft returns the existing one) and caches it. */
  const freigabeErstellen = async (ordnerId: string): Promise<string> => {
    const url = await deps.onedrive.freigabeLink(ordnerId);
    await deps.freigaben.setzen(ordnerId, url);
    return url;
  };

  /** Like `freigabeErstellen`, but a failure is only logged and gives null. */
  const freigabeVersuchen = async (ordnerId: string): Promise<string | null> => {
    try {
      return await freigabeErstellen(ordnerId);
    } catch (err) {
      console.error(`OneDrive sharing link of folder ${ordnerId} failed`, err);
      return null;
    }
  };

  /**
   * Changes the stored folder list snapshot (add, rename, remove an entry) so it stays current without a
   * live load. Keeps its `stand`; without a snapshot nothing is stored (it would look complete). Never throws.
   */
  const ordnerCacheAendern = async (
    aendern: (liste: OneDriveOrdner[]) => OneDriveOrdner[],
  ): Promise<void> => {
    try {
      const snapshot = await deps.ordnerCache.lesen();
      if (snapshot) await deps.ordnerCache.schreiben(aendern(snapshot.ordner), snapshot.stand);
    } catch (err) {
      console.error('Updating the folder list cache failed', err);
    }
  };
  const ordnerCacheEinfuegen = (ordner: OneDriveOrdner) =>
    ordnerCacheAendern((liste) => [...liste.filter((o) => o.id !== ordner.id), ordner]);

  /** Builds the DTO list; event links and sharing links come fresh from the DB, not from the snapshot. */
  const bilderListe = async (ordner: readonly OneDriveOrdner[]): Promise<BilderOrdnerDto[]> => {
    const [zuordnung, links] = await Promise.all([
      deps.kalender.bilderOrdnerZuordnung(),
      deps.freigaben.alle().catch((err) => {
        console.error('Reading the sharing link cache failed', err);
        return new Map<string, string>();
      }),
    ]);
    const events = new Map(zuordnung.map((z) => [z.ordnerId, z.eventId]));
    return bilderSortieren(
      ordner.map((o) => {
        const geparst = ordnerNameParsen(o.name);
        return {
          id: o.id,
          name: o.name,
          webUrl: o.webUrl,
          von: geparst?.von ?? null,
          bis: geparst?.bis ?? null,
          eventName: geparst?.eventName ?? o.name,
          genauigkeit: geparst?.genauigkeit ?? 'tag',
          freigabeUrl: links.get(o.id) ?? null,
          eventId: events.get(o.id) ?? null,
        } satisfies BilderOrdnerDto;
      }),
    );
  };

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

  /** Deletes the folders of removed events if they are empty; errors are only logged. */
  const bilderOrdnerAufraeumen = async (ordnerIds: readonly string[]) => {
    for (const id of ordnerIds) {
      try {
        const ergebnis = await deps.onedrive.loeschenWennLeer(id);
        if (ergebnis !== 'nicht-leer') {
          await deps.freigaben.loeschen(id);
          await ordnerCacheAendern((liste) => liste.filter((o) => o.id !== id));
        }
      } catch (err) {
        console.error(`OneDrive folder ${id} could not be cleaned up`, err);
      }
    }
  };

  /**
   * Runs a change that may delete events (event delete, series changes) and cleans up the folders of
   * the events that are gone afterwards.
   */
  const mitOrdnerAufraeumen = async <T>(aktion: () => Promise<T>): Promise<T> => {
    const vorher = await deps.kalender.bilderOrdnerZuordnung();
    const ergebnis = await aktion();
    if (vorher.length > 0) {
      const nachher = new Set((await deps.kalender.bilderOrdnerZuordnung()).map((z) => z.eventId));
      await bilderOrdnerAufraeumen(
        vorher.filter((z) => !nachher.has(z.eventId)).map((z) => z.ordnerId),
      );
    }
    return ergebnis;
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

  const schluesselFehler = (err: unknown): never => {
    if (err instanceof AnfrageKonflikt) {
      throw new HTTPException(409, {
        message: 'Die Anfrage ist schon vergeben oder zurückgezogen.',
      });
    }
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

  /** Like `umfrageAufrufer`; holders of `privatpartys:verwalten` also handle the poll of a Privatparty. */
  const aufruferFuerUmfrage = async (
    c: Parameters<typeof umfrageAufrufer>[0],
    umfrageId: string,
  ): Promise<Aufrufer> => {
    const a = umfrageAufrufer(c);
    if (a.verwaltung || !c.get('permissions').includes('privatpartys:verwalten')) return a;
    return (await deps.privatpartys.nachUmfrage(umfrageId)) ? { ...a, privatpartys: true } : a;
  };

  const umfrageKontext = () => ladeKontext(deps);

  /** The poll if the caller may see it; 404 otherwise, so other polls stay hidden. */
  const sichtbareUmfrage = async (id: string, a: Aufrufer) => {
    const [u, k] = await Promise.all([deps.umfragen.holen(id), umfrageKontext()]);
    if (!u || !darfSehen(u, kreisDerUmfrage(u, k), a)) {
      throw new HTTPException(404, { message: 'Umfrage nicht gefunden' });
    }
    return { u, k };
  };

  const umfrageSpeichern = umfrageSpeichernModul;
  const terminQuellen = (termin: UmfrageTermin, nurAktive: boolean) =>
    terminQuellenModul(deps.kalender, termin, nurAktive);
  const terminVorbereiten = (e: z.output<typeof umfrageEingabeSchema>) =>
    terminVorbereitenModul(deps.kalender, e);

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

  type SchluesselMitglieder = Awaited<ReturnType<typeof schluesselMitglieder>>;

  const mitgliedRef = (m: SchluesselMitglieder, sub: string) =>
    m.halter({ art: 'mitglied', sub }) as MitgliedRefDto;

  const alsPlanungDto = (p: PlanungDaten, m: SchluesselMitglieder): PlanungDto => ({
    id: p.id,
    schluesselId: p.schluesselId,
    an: mitgliedRef(m, p.anSub),
    zeitfenster: { datum: p.datum, ab: p.ab, bis: p.bis, notiz: p.notiz },
    anfrageId: p.anfrageId,
    erstelltVon: mitgliedRef(m, p.erstelltVon),
  });

  /** Planned handovers per key, in time order. */
  const planungenJeSchluessel = async (m: SchluesselMitglieder) => {
    const gruppen = new Map<string, PlanungDto[]>();
    for (const p of await deps.schluesselAnfragen.planungen()) {
      const liste = gruppen.get(p.schluesselId) ?? [];
      liste.push(alsPlanungDto(p, m));
      gruppen.set(p.schluesselId, liste);
    }
    return gruppen;
  };

  const alsSchluesselDto = (
    s: SchluesselDaten,
    halter: (h: Halter) => HalterDto,
    planungen: PlanungDto[] = [],
  ): SchluesselDto => ({
    id: s.id,
    name: s.name,
    beschreibung: s.beschreibung,
    archiviert: s.archiviert,
    halter: halter(s.halter),
    halterSeit: s.halterSeit?.toISOString() ?? null,
    planungen,
  });

  const anfrageKontext = () =>
    ladeAnfrageKontext({
      schluessel: deps.schluessel,
      anfragen: deps.schluesselAnfragen,
      mitglieder: deps.mitglieder,
    });

  const alsAnfrageDto = (
    a: AnfrageMitAntworten,
    m: SchluesselMitglieder,
    schluesselNamen: Map<string, string>,
    ich: string,
    kontext: AnfrageKontext,
    heute: string,
  ): AnfrageDto => {
    const schluessel = (id: string | null) =>
      id && schluesselNamen.has(id) ? { id, name: schluesselNamen.get(id)! } : null;
    const abgelaufen = a.status === 'offen' && a.datum < heute;
    return {
      id: a.id,
      art: a.art,
      ersteller: mitgliedRef(m, a.erstellerSub),
      schluessel: schluessel(a.schluesselId),
      zeitfenster: { datum: a.datum, ab: a.ab, bis: a.bis, notiz: a.notiz },
      status: abgelaufen ? 'abgelaufen' : a.status,
      erstellt: a.erstellt.toISOString(),
      antworten: a.antworten.map((w) => ({
        id: w.id,
        mitglied: mitgliedRef(m, w.sub),
        art: w.art,
        zeitfenster: w.datum ? { datum: w.datum, ab: w.ab, bis: w.bis, notiz: w.notiz } : null,
        schluessel: schluessel(w.schluesselId),
        notiz: w.notiz,
        erstellt: w.erstellt.toISOString(),
      })),
      darfAntworten:
        a.status === 'offen' && !abgelaufen && antwortBerechtigte(a, kontext).includes(ich),
    };
  };

  /** Everything the Anfrage routes need in one go. */
  const anfrageAnsicht = async () => {
    const [m, keys, kontext] = await Promise.all([
      schluesselMitglieder(),
      deps.schluessel.alle(true),
      anfrageKontext(),
    ]);
    return { m, keys, namen: new Map(keys.map((k) => [k.id, k.name])), kontext };
  };

  // ----- Privatpartys: helpers (see docs/privatpartys.md)

  /** Deletes an event like `DELETE /kalender/events/:id`; false when it is already gone. */
  const eventLoeschenMitPruefung = async (eventId: string): Promise<boolean> => {
    if (await deps.protokolle.nachEvent(eventId)) {
      throw new HTTPException(409, { message: 'Zu dieser Sitzung gibt es ein Protokoll.' });
    }
    return mitOrdnerAufraeumen(() => deps.kalender.eventLoeschen(eventId).catch(kalenderFehler));
  };

  const MAIL_AUS = 'Die Party-Mail ist nicht eingerichtet.';

  const privatpartyGefunden = async (id: string): Promise<PrivatpartyEintrag> =>
    gefunden(await deps.privatpartys.holen(id), 'Privatparty nicht gefunden');

  /** Where a reply goes: the reply address of the mails, else the person's email. */
  const antwortAdresse = async (e: PrivatpartyEintrag): Promise<string | null> => {
    if (e.mailAdresse) return e.mailAdresse;
    const person = e.personId ? await deps.privatpartys.person(e.personId) : undefined;
    return person?.email ?? null;
  };

  const privatpartyDetail = async (e: PrivatpartyEintrag) => {
    const [umfrage, event, nachrichten, konten, mailEingerichtet, antwortAn] = await Promise.all([
      e.umfrageId ? deps.umfragen.holen(e.umfrageId) : undefined,
      e.eventId ? deps.kalender.event(e.eventId) : undefined,
      deps.privatpartys.nachrichten(e.id),
      deps.userAdmin.konten(),
      deps.partymail.eingerichtet(),
      antwortAdresse(e),
    ]);
    const umfrageKurz: PrivatpartyUmfrageKurzDto | null = umfrage
      ? { id: umfrage.id, titel: umfrage.titel, laeuft: umfrageLaeuft(umfrage, new Date()) }
      : null;
    // An event deleted in the calendar is shown as none.
    const eventKurz: PrivatpartyEventKurzDto | null = event
      ? { id: event.id, titel: event.anzeigeTitel, beginn: event.beginn }
      : null;
    const sender = new Map<string, PrivatpartyNachrichtDto['gesendetVon']>();
    for (const sub of new Set(nachrichten.flatMap((n) => (n.mitgliedSub ? [n.mitgliedSub] : [])))) {
      const profil = await deps.mitglieder.holen(sub);
      sender.set(
        sub,
        profil
          ? {
              sub,
              username: konten.get(sub)?.username ?? null,
              vorname: profil.vorname,
              nachname: profil.nachname,
              status: profil.status,
              anrede: profil.anrede ?? 'neutral',
            }
          : null,
      );
    }
    const dtos: PrivatpartyNachrichtDto[] = nachrichten.map((n) => ({
      id: n.id,
      richtung: n.richtung,
      vonAdresse: n.vonAdresse,
      vonName: n.vonName,
      anAdresse: n.anAdresse,
      betreff: n.betreff,
      text: n.text,
      anhaenge: n.anhaenge,
      zeitpunkt: n.zeitpunkt.toISOString(),
      gesendetVon: n.mitgliedSub ? (sender.get(n.mitgliedSub) ?? null) : null,
    }));
    return alsPrivatpartyDetailDto(e, umfrageKurz, eventKurz, dtos, mailEingerichtet, antwortAn);
  };

  /** Accepts a wish date: creates the event from the Vorlage at the wished times and ends a running poll. */
  const privatpartyZusagen = async (
    e: PrivatpartyEintrag,
    terminId: string,
    vorlageId: string,
    sub: string,
  ): Promise<string> => {
    if (e.status === 'zugesagt' && e.eventId && (await deps.kalender.event(e.eventId))) {
      throw new HTTPException(409, { message: 'Die Privatparty ist schon zugesagt.' });
    }
    const termin = e.termine.find((t) => t.id === terminId);
    if (!termin) throw new HTTPException(400, { message: 'Unbekannter Termin.' });
    const vorlage = (await deps.kalender.vorlagen(false)).find((v) => v.id === vorlageId);
    if (!vorlage) throw new HTTPException(400, { message: 'Unbekannte Vorlage.' });
    const kategorie = (await deps.kalender.kategorien(false)).find(
      (k) => k.id === vorlage.kategorieId,
    );
    if (!kategorie) throw new HTTPException(400, { message: 'Unbekannte Kategorie.' });
    const eingabe: EventEingabe = {
      ...ausVorlageZuZeit(vorlage, termin.datum, termin.beginn, termin.ende, kategorie),
      // Only the Vorlage's (else a plain) title: no contact data in the calendar.
      titel: vorlage.titel.trim() || 'Privatparty',
    };
    const eventId = await deps.kalender.eventAnlegen(eingabe, sub).catch(kalenderFehler);
    if (e.umfrageId) {
      const u = await deps.umfragen.holen(e.umfrageId);
      if (u && umfrageLaeuft(u, new Date())) await deps.umfragen.beenden(u.id, new Date());
    }
    await deps.privatpartys.zusagen(e.id, termin.id, eventId);
    return eventId;
  };

  // ----- Todos: helpers

  /** A Todo as the person `sub` sees it (members shown with username and status). */
  const alsTodoDto = (
    t: TodoDaten,
    sub: string,
    mitglieder: ReadonlyMap<string, ProtokollMitglied>,
    quellen: ReadonlyMap<string, TodoQuelle>,
  ): Todo => {
    const zustaendige = t.zustaendige.map((z) => {
      const m = mitglieder.get(z.sub);
      return {
        sub: z.sub,
        username: m?.username ?? null,
        vorname: m?.vorname ?? '',
        nachname: m?.nachname ?? '',
        status: m?.status ?? 'extern',
        anrede: m?.anrede ?? 'neutral',
        erledigtAm: z.erledigtAm?.toISOString() ?? null,
      };
    });
    const teil = {
      modus: t.modus,
      erledigtAm: t.erledigtAm?.toISOString() ?? null,
      zustaendige,
    };
    return {
      id: t.id,
      titel: t.titel,
      notizen: t.notizen,
      faelligAm: t.faelligAm,
      modus: t.modus,
      quelle: (t.protokollId && quellen.get(t.protokollId)) || null,
      zustaendige,
      erledigtAm: teil.erledigtAm,
      erledigtVon: t.erledigtVon,
      ichErledigt: todoFuerMichErledigt(teil, sub),
      bearbeitbar: t.protokollId === null && t.erstelltVon === sub,
    };
  };

  /** The protocols the Todos come from, as "Sitzung name and date", by protocol id. */
  const todoQuellen = async (liste: readonly TodoDaten[]): Promise<Map<string, TodoQuelle>> => {
    const ids = new Set(liste.flatMap((t) => (t.protokollId ? [t.protokollId] : [])));
    if (ids.size === 0) return new Map();
    const protokolle = (await deps.protokolle.alle()).filter((p) => ids.has(p.id));
    const events = new Map(
      (await deps.kalender.eventsKurz(protokolle.map((p) => p.eventId))).map((e) => [e.id, e]),
    );
    return new Map(
      protokolle.map((p) => {
        const e = events.get(p.eventId);
        return [
          p.id,
          {
            protokollId: p.id,
            eventName: e?.titel ?? '',
            datum: datumBerlin(e?.beginn ?? p.erstelltAm.toISOString()),
          },
        ] as const;
      }),
    );
  };

  /** One Todo as the person sees it. */
  const todoFuer = async (t: TodoDaten, sub: string): Promise<Todo> => {
    const [mitglieder, quellen] = await Promise.all([protokollMitglieder(), todoQuellen([t])]);
    return alsTodoDto(t, sub, new Map(mitglieder.map((m) => [m.sub, m])), quellen);
  };

  /** The Todo, if the person created it or is zuständig (404 otherwise, so ids do not leak). */
  const eigenesTodoLaden = async (id: string, sub: string): Promise<TodoDaten> => {
    const t = gefunden(await deps.todos.byId(id), 'Todo nicht gefunden');
    if (t.erstelltVon !== sub && !t.zustaendige.some((z) => z.sub === sub)) {
      throw new HTTPException(404, { message: 'Todo nicht gefunden' });
    }
    return t;
  };

  /** A Todo the person may edit or delete: created by them, not from a protocol (403 otherwise). */
  const todoBearbeitbarLaden = async (id: string, sub: string): Promise<TodoDaten> => {
    const t = await eigenesTodoLaden(id, sub);
    if (t.protokollId !== null || t.erstelltVon !== sub) {
      throw new HTTPException(403, { message: 'Dieses Todo kannst du nicht ändern.' });
    }
    return t;
  };

  // ----- Protokolle: helpers

  /** All members as the minutes show them (usernames come from Cognito). */
  const protokollMitglieder = async (): Promise<ProtokollMitglied[]> => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    return rows.map((r) => ({
      sub: r.sub,
      username: konten.get(r.sub)?.username ?? null,
      vorname: r.vorname,
      nachname: r.nachname,
      status: r.status,
      anrede: r.anrede ?? 'neutral',
      deaktiviert: istDeaktiviert(r),
    }));
  };

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

  /** Maps the protocol store's conflicts to 409 (an outdated version also tells the current one). */
  const protokollKonflikt = (err: unknown, c: Context): Response => {
    if (err instanceof ProtokollVeraltet) {
      return c.json({ error: err.message, version: err.version }, 409);
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
              wohnheim: null,
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
        const planungen = await planungenJeSchluessel(m);
        return c.json(liste.map((s) => alsSchluesselDto(s, m.halter, planungen.get(s.id))));
      })
      // ----- Schlüssel: Anfragen (Bedarf / Abgabe), registered before `/schluessel/:id`
      .get('/schluessel/anfragen', auth, schluesselLesen, async (c) => {
        const ich = c.get('user').sub;
        const heute = heuteBerlin();
        const [alle, ansicht] = await Promise.all([
          deps.schluesselAnfragen.anfragen(),
          anfrageAnsicht(),
        ]);
        // Open and current requests of everybody, plus the viewer's own from the last days.
        // Withdrawn requests are never listed.
        const sichtbar = alle
          .filter(
            (a) =>
              a.status !== 'zurueckgezogen' &&
              ((a.status === 'offen' && a.datum >= heute) ||
                (a.erstellerSub === ich && a.datum >= tagNachher(heute, -3))),
          )
          .sort((a, b) => a.datum.localeCompare(b.datum) || (a.ab ?? '').localeCompare(b.ab ?? ''));
        return c.json(
          sichtbar.map((a) =>
            alsAnfrageDto(a, ansicht.m, ansicht.namen, ich, ansicht.kontext, heute),
          ),
        );
      })
      .get('/schluessel/anfragen/:id', auth, schluesselLesen, async (c) => {
        const a = gefunden(
          await deps.schluesselAnfragen.anfrage(c.req.param('id')),
          'Anfrage nicht gefunden',
        );
        const ansicht = await anfrageAnsicht();
        return c.json(
          alsAnfrageDto(
            a,
            ansicht.m,
            ansicht.namen,
            c.get('user').sub,
            ansicht.kontext,
            heuteBerlin(),
          ),
        );
      })
      .post(
        '/schluessel/anfragen',
        auth,
        schluesselLesen,
        zValidator('json', anfrageAnlegenSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const ich = c.get('user').sub;
          await eigenesProfilMussExistieren(ich);
          let schluesselName: string | null = null;
          if (daten.schluesselId) {
            const s = await deps.schluessel.holen(daten.schluesselId);
            if (!s || s.archiviert)
              throw new HTTPException(404, { message: 'Schlüssel nicht gefunden' });
            schluesselName = s.name;
            if (daten.art === 'abgabe') {
              const geplant = (await deps.schluesselAnfragen.planungen(s.id)).some(
                (p) => p.anSub === ich,
              );
              if (!(s.halter?.art === 'mitglied' && s.halter.sub === ich) && !geplant) {
                throw new HTTPException(409, {
                  message: 'Du kannst nur Schlüssel abgeben, die du hast oder bekommen sollst.',
                });
              }
            }
          }
          const id = await deps.schluesselAnfragen.anlegen({
            art: daten.art,
            erstellerSub: ich,
            schluesselId: daten.schluesselId,
            datum: daten.datum,
            ab: daten.ab,
            bis: daten.bis,
            notiz: daten.notiz,
          });
          await bestEffort(async () => {
            const [kontext, m] = await Promise.all([anfrageKontext(), schluesselMitglieder()]);
            await meldeAnfrage(deps.benachrichtigungen, {
              anfrage: { id, art: daten.art, datum: daten.datum, ab: daten.ab, bis: daten.bis },
              empfaenger: antwortBerechtigte(
                {
                  art: daten.art,
                  erstellerSub: ich,
                  schluesselId: daten.schluesselId,
                  datum: daten.datum,
                  ab: daten.ab,
                },
                kontext,
              ),
              ersteller: m.name(ich),
              schluesselName,
            });
          });
          return c.json({ id }, 201);
        },
      )
      .put('/schluessel/anfragen/:id/rueckzug', auth, schluesselLesen, async (c) => {
        const a = gefunden(
          await deps.schluesselAnfragen.anfrage(c.req.param('id')),
          'Anfrage nicht gefunden',
        );
        if (a.erstellerSub !== c.get('user').sub) {
          throw new HTTPException(403, {
            message: 'Nur wer die Anfrage gestellt hat, kann sie zurückziehen.',
          });
        }
        if (!(await deps.schluesselAnfragen.zurueckziehen(a.id))) {
          throw new HTTPException(409, {
            message: 'Die Anfrage ist schon vergeben oder zurückgezogen.',
          });
        }
        return c.json({ ok: true });
      })
      .put(
        '/schluessel/anfragen/:id/antwort',
        auth,
        schluesselLesen,
        zValidator('json', antwortSchema),
        async (c) => {
          const antwort = c.req.valid('json');
          const ich = c.get('user').sub;
          const a = gefunden(
            await deps.schluesselAnfragen.anfrage(c.req.param('id')),
            'Anfrage nicht gefunden',
          );
          if (a.erstellerSub === ich) {
            throw new HTTPException(403, {
              message: 'Du kannst nicht auf deine eigene Anfrage antworten.',
            });
          }
          if (a.status !== 'offen' || a.datum < heuteBerlin()) {
            throw new HTTPException(409, {
              message: 'Die Anfrage ist schon vergeben, zurückgezogen oder abgelaufen.',
            });
          }
          await eigenesProfilMussExistieren(ich);
          const kontext = await anfrageKontext();
          if (!antwortBerechtigte(a, kontext).includes(ich)) {
            throw new HTTPException(403, { message: 'Diese Anfrage ist nicht an dich gerichtet.' });
          }
          // The key a responder offers for a Bedarf of "irgendeiner": one they are expected to hold then.
          const schluesselId = a.schluesselId ?? antwort.schluesselId;
          if (a.art === 'bedarf' && !a.schluesselId && antwort.art !== 'ablehnung') {
            const eigene = new Set(
              [...erwarteteHalterJeSchluessel(a, kontext)]
                .filter(([, subs]) => subs.includes(ich))
                .map(([id]) => id),
            );
            if (!schluesselId || !eigene.has(schluesselId)) {
              throw new HTTPException(400, { message: 'Bitte wähle den Schlüssel, den du gibst.' });
            }
          }
          const zusage = antwort.art === 'zusage';
          gefunden(
            await deps.schluesselAnfragen
              .antwortSpeichern(
                a.id,
                {
                  sub: ich,
                  art: antwort.art,
                  datum: antwort.art === 'gegenvorschlag' ? antwort.datum : null,
                  ab: antwort.art === 'gegenvorschlag' ? antwort.ab : null,
                  bis: antwort.art === 'gegenvorschlag' ? antwort.bis : null,
                  notiz: antwort.notiz,
                  schluesselId: antwort.art === 'ablehnung' ? null : schluesselId,
                },
                zusage && schluesselId
                  ? {
                      schluesselId,
                      anSub: a.art === 'bedarf' ? a.erstellerSub : ich,
                      datum: a.datum,
                      ab: a.ab,
                      bis: a.bis,
                      notiz: a.notiz,
                      anfrageId: a.id,
                      erstelltVon: ich,
                    }
                  : null,
              )
              .catch(schluesselFehler),
            'Anfrage nicht gefunden',
          );
          await bestEffort(async () => {
            const m = await schluesselMitglieder();
            await meldeAntwort(deps.benachrichtigungen, {
              anfrageId: a.id,
              art: antwort.art,
              erstellerSub: a.erstellerSub,
              ersteller: m.name(a.erstellerSub),
              antwortender: { sub: ich, name: m.name(ich) },
              vorschlag:
                antwort.art === 'gegenvorschlag' && antwort.datum
                  ? { datum: antwort.datum, ab: antwort.ab, bis: antwort.bis }
                  : undefined,
              andereAntworter: a.antworten.map((x) => x.sub),
            });
          });
          return c.json({ ok: true });
        },
      )
      .post(
        '/schluessel/anfragen/:id/antworten/:antwortId/annehmen',
        auth,
        schluesselLesen,
        async (c) => {
          const ich = c.get('user').sub;
          const a = gefunden(
            await deps.schluesselAnfragen.anfrage(c.req.param('id')),
            'Anfrage nicht gefunden',
          );
          if (a.erstellerSub !== ich) {
            throw new HTTPException(403, {
              message: 'Nur wer die Anfrage gestellt hat, kann einen Vorschlag annehmen.',
            });
          }
          const w = gefunden(
            a.antworten.find(
              (x) => x.id === c.req.param('antwortId') && x.art === 'gegenvorschlag',
            ),
            'Vorschlag nicht gefunden',
          );
          const schluesselId = a.schluesselId ?? w.schluesselId;
          if (!w.datum || !schluesselId) {
            throw new HTTPException(409, { message: 'Der Vorschlag nennt keinen Schlüssel.' });
          }
          gefunden(
            await deps.schluesselAnfragen
              .gegenvorschlagAnnehmen(a.id, {
                schluesselId,
                anSub: a.art === 'bedarf' ? a.erstellerSub : w.sub,
                datum: w.datum,
                ab: w.ab,
                bis: w.bis,
                notiz: w.notiz ?? a.notiz,
                anfrageId: a.id,
                erstelltVon: ich,
              })
              .catch(schluesselFehler),
            'Anfrage nicht gefunden',
          );
          await bestEffort(async () => {
            const m = await schluesselMitglieder();
            await meldeGegenvorschlagAngenommen(deps.benachrichtigungen, {
              anfrageId: a.id,
              ersteller: m.name(ich),
              vorschlagSub: w.sub,
              andereAntworter: a.antworten.map((x) => x.sub),
            });
          });
          return c.json({ ok: true });
        },
      )
      // ----- Schlüssel: geplante Übergaben
      .post(
        '/schluessel/:id/planungen',
        auth,
        schluesselLesen,
        zValidator('json', planungSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const ich = c.get('user').sub;
          const s = await deps.schluessel.holen(c.req.param('id'));
          if (!s || s.archiviert)
            throw new HTTPException(404, { message: 'Schlüssel nicht gefunden' });
          await mitgliedMussExistieren(daten.anSub);
          if (s.halter?.art === 'mitglied' && s.halter.sub === daten.anSub) {
            throw new HTTPException(409, { message: 'Dieses Mitglied hat den Schlüssel schon.' });
          }
          const id = await deps.schluesselAnfragen.planungAnlegen({
            schluesselId: s.id,
            anSub: daten.anSub,
            datum: daten.datum,
            ab: daten.ab,
            bis: daten.bis,
            notiz: daten.notiz,
            anfrageId: null,
            erstelltVon: ich,
          });
          await bestEffort(async () =>
            meldePlanung(deps.benachrichtigungen, {
              schluessel: s,
              halter: s.halter,
              plaene: await deps.schluesselAnfragen.planungen(s.id),
              planungId: id,
              aktion: 'angelegt',
              zeitfenster: daten,
              akteur: ich,
              name: (await schluesselMitglieder()).name,
            }),
          );
          return c.json({ id }, 201);
        },
      )
      .put(
        '/schluessel/planungen/:id',
        auth,
        schluesselLesen,
        zValidator('json', planungSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const ich = c.get('user').sub;
          const p = gefunden(
            await deps.schluesselAnfragen.planung(c.req.param('id')),
            'Planung nicht gefunden',
          );
          await mitgliedMussExistieren(daten.anSub);
          gefunden(
            await deps.schluesselAnfragen.planungAendern(p.id, daten),
            'Planung nicht gefunden',
          );
          await bestEffort(async () => {
            const s = await deps.schluessel.holen(p.schluesselId);
            if (!s) return;
            await meldePlanung(deps.benachrichtigungen, {
              schluessel: s,
              halter: s.halter,
              plaene: await deps.schluesselAnfragen.planungen(s.id),
              planungId: p.id,
              aktion: 'geaendert',
              zeitfenster: daten,
              akteur: ich,
              name: (await schluesselMitglieder()).name,
            });
          });
          return c.json({ ok: true });
        },
      )
      .delete('/schluessel/planungen/:id', auth, schluesselLesen, async (c) => {
        const ich = c.get('user').sub;
        const p = gefunden(
          await deps.schluesselAnfragen.planung(c.req.param('id')),
          'Planung nicht gefunden',
        );
        // The chain as it was, so the previous holder can still be told.
        const vorher = await deps.schluesselAnfragen.planungen(p.schluesselId);
        gefunden(await deps.schluesselAnfragen.planungLoeschen(p.id), 'Planung nicht gefunden');
        await bestEffort(async () => {
          const s = await deps.schluessel.holen(p.schluesselId);
          if (!s) return;
          await meldePlanung(deps.benachrichtigungen, {
            schluessel: s,
            halter: s.halter,
            plaene: vorher,
            planungId: p.id,
            aktion: 'geloescht',
            zeitfenster: p,
            akteur: ich,
            name: (await schluesselMitglieder()).name,
          });
        });
        return c.json({ ok: true });
      })
      .get('/schluessel/:id', auth, schluesselLesen, async (c) => {
        const s = await deps.schluessel.holen(c.req.param('id'));
        if (!s || (s.archiviert && !c.get('permissions').includes('schluessel:verwalten'))) {
          throw new HTTPException(404, { message: 'Schlüssel nicht gefunden' });
        }
        const m = await schluesselMitglieder();
        const planungen = await deps.schluesselAnfragen.planungen(s.id);
        const dto: SchluesselDetailDto = {
          ...alsSchluesselDto(
            s,
            m.halter,
            planungen.map((p) => alsPlanungDto(p, m)),
          ),
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
          const planungen = await deps.schluesselAnfragen.planungen(s.id);
          return c.json(
            alsSchluesselDto(
              s,
              m.halter,
              planungen.map((p) => alsPlanungDto(p, m)),
            ),
          );
        },
      )
      // ----- Privatpartys (see docs/privatpartys.md): everything needs `privatpartys:verwalten`
      .get('/privatpartys/personen', auth, privatpartysVerwalten, async (c) => {
        const liste = await deps.privatpartys.personen();
        return c.json(liste.map((p) => alsPrivatpartyPersonDto(p, p.anzahl)));
      })
      .post(
        '/privatpartys/personen',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyPersonEingabeSchema),
        async (c) => {
          const id = await deps.privatpartys.personAnlegen(c.req.valid('json'), c.get('user').sub);
          return c.json({ id }, 201);
        },
      )
      .get('/privatpartys/personen/:id', auth, privatpartysVerwalten, async (c) => {
        const person = gefunden(
          await deps.privatpartys.person(c.req.param('id')),
          'Person nicht gefunden',
        );
        const privatpartys = await deps.privatpartys.nachPerson(person.id);
        return c.json({
          ...alsPrivatpartyPersonDto(person, privatpartys.length),
          privatpartys: privatpartys.map(alsPrivatpartyListeDto),
        });
      })
      .put(
        '/privatpartys/personen/:id',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyPersonEingabeSchema),
        async (c) => {
          gefunden(
            await deps.privatpartys.personAktualisieren(c.req.param('id'), c.req.valid('json')),
            'Person nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/privatpartys/personen/:id', auth, privatpartysVerwalten, async (c) => {
        const ergebnis = await deps.privatpartys.personLoeschen(c.req.param('id'));
        if (ergebnis === 'nicht_gefunden') {
          throw new HTTPException(404, { message: 'Person nicht gefunden' });
        }
        if (ergebnis === 'in_benutzung') {
          throw new HTTPException(409, {
            message: 'Zu dieser Person gibt es noch Privatpartys.',
          });
        }
        return c.json({ ok: true });
      })
      .get('/privatpartys/mail-status', auth, privatpartysVerwalten, async (c) => {
        const [eingerichtet, stand] = await Promise.all([
          deps.partymail.eingerichtet(),
          deps.privatpartys.abrufStand(),
        ]);
        return c.json({
          eingerichtet,
          letzterAbruf: stand.letzterAbruf?.toISOString() ?? null,
          fehler: stand.fehler,
        } satisfies PrivatpartyMailStatusDto);
      })
      .post('/privatpartys/mail/abrufen', auth, privatpartysVerwalten, async (c) => {
        if (!(await deps.partymail.eingerichtet()))
          throw new HTTPException(409, { message: MAIL_AUS });
        const ergebnis = await mailJob(deps);
        if (ergebnis.fehler)
          throw new HTTPException(502, { message: 'Der Abruf ist fehlgeschlagen.' });
        return c.json({ neu: ergebnis.neu });
      })
      .post(
        '/privatpartys/nachrichten/:id/zuordnen',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyZuordnenSchema),
        async (c) => {
          const nachricht = gefunden(
            await deps.privatpartys.nachricht(c.req.param('id')),
            'Nachricht nicht gefunden',
          );
          const daten = c.req.valid('json');
          const quelleId = nachricht.privatpartyId;
          let zielId: string;
          if ('neu' in daten) {
            // Same blank entry the mail job creates for an unthreaded incoming mail.
            const quelle = await privatpartyGefunden(quelleId);
            zielId = await deps.privatpartys.anlegen(
              {
                personId: null,
                anlass: null,
                notizen: null,
                termine: [],
                mailAdresse:
                  nachricht.richtung === 'ein' ? nachricht.vonAdresse : quelle.mailAdresse,
                letzteNachrichtAm: nachricht.zeitpunkt,
              },
              null,
            );
          } else {
            const ziel = await privatpartyGefunden(daten.privatpartyId);
            if (ziel.id === quelleId) {
              throw new HTTPException(400, {
                message: 'Die Nachricht gehört schon zu dieser Anfrage.',
              });
            }
            if (ziel.status !== 'offen') {
              throw new HTTPException(409, { message: 'Die Anfrage ist nicht offen.' });
            }
            zielId = ziel.id;
          }
          await deps.privatpartys.nachrichtVerschieben(nachricht.id, zielId);
          // An entry that only existed for this mail is not needed any more.
          const geloescht = await deps.privatpartys.leerenEintragLoeschen(quelleId);
          return c.json({ ok: true, geloescht, id: zielId });
        },
      )
      .get(
        '/privatpartys',
        auth,
        privatpartysVerwalten,
        zValidator(
          'query',
          z.object({ status: z.enum([...PRIVATPARTY_STATI, 'alle']).optional() }),
        ),
        async (c) => {
          const status = c.req.valid('query').status ?? 'offen';
          const liste = await deps.privatpartys.alle(status === 'alle' ? undefined : status);
          return c.json(liste.map(alsPrivatpartyListeDto));
        },
      )
      .post(
        '/privatpartys',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyEingabeSchema),
        async (c) => {
          const daten = c.req.valid('json');
          gefunden(await deps.privatpartys.person(daten.personId), 'Person nicht gefunden');
          const id = await deps.privatpartys.anlegen(daten, c.get('user').sub);
          return c.json({ id }, 201);
        },
      )
      .get('/privatpartys/:id', auth, privatpartysVerwalten, async (c) => {
        return c.json(await privatpartyDetail(await privatpartyGefunden(c.req.param('id'))));
      })
      .put(
        '/privatpartys/:id',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyEingabeSchema),
        async (c) => {
          const daten = c.req.valid('json');
          gefunden(await deps.privatpartys.person(daten.personId), 'Person nicht gefunden');
          try {
            gefunden(
              await deps.privatpartys.aktualisieren(c.req.param('id'), daten),
              'Privatparty nicht gefunden',
            );
          } catch (err) {
            if (err instanceof TerminInBenutzung) {
              throw new HTTPException(409, {
                message: 'Der zugesagte Termin kann nicht entfernt werden.',
              });
            }
            throw err;
          }
          return c.json({ ok: true });
        },
      )
      .delete('/privatpartys/:id', auth, privatpartysVerwalten, async (c) => {
        const ergebnis = await deps.privatpartys.loeschen(c.req.param('id'));
        if (ergebnis === 'nicht_gefunden') {
          throw new HTTPException(404, { message: 'Privatparty nicht gefunden' });
        }
        if (ergebnis === 'in_benutzung') {
          throw new HTTPException(409, {
            message:
              'An der Privatparty hängen ein Event oder Nachrichten. Sage sie stattdessen ab.',
          });
        }
        return c.json({ ok: true });
      })
      .post(
        '/privatpartys/:id/umfrage',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyUmfrageSchema),
        async (c) => {
          const sub = c.get('user').sub;
          const e = await privatpartyGefunden(c.req.param('id'));
          const { vorlageId, endetAm, pflicht } = c.req.valid('json');
          if (e.termine.length === 0) {
            throw new HTTPException(400, { message: 'Lege zuerst Wunschtermine an.' });
          }
          if (e.umfrageId) {
            const bisher = await deps.umfragen.holen(e.umfrageId);
            if (bisher && umfrageLaeuft(bisher, new Date())) {
              throw new HTTPException(409, { message: 'Es läuft schon eine Umfrage.' });
            }
          }
          const vorlage = (await deps.kalender.vorlagen(false)).find((v) => v.id === vorlageId);
          if (!vorlage) throw new HTTPException(400, { message: 'Unbekannte Vorlage.' });
          await eigenesProfilMussExistieren(sub);
          const alle = { ...leererKreis(), status: [...MITGLIED_STATI] };
          const geparst = umfrageEingabeSchema.safeParse({
            titel: privatpartyUmfrageTitel(e.anlass),
            beschreibung: null,
            endetAm,
            anonym: false,
            ergebnisse: 'sofort',
            pflicht: pflicht ? alle : leererKreis(),
            optional: pflicht ? leererKreis() : alle,
            erinnerungenPflicht: pflicht ? [...UMFRAGE_ERINNERUNG_STANDARD.pflicht] : [],
            erinnerungenOptional: pflicht ? [] : [...UMFRAGE_ERINNERUNG_STANDARD.optional],
            fragen: [
              {
                text: '',
                freitext: false,
                maxAntworten: null,
                optionen: e.termine.map((t) => ({
                  text: '',
                  termin: {
                    datum: t.datum,
                    bis: null,
                    beginn: null,
                    ende: null,
                    name: privatpartyOptionName(t),
                  },
                })),
              },
            ],
            termin: {
              kategorieId: vorlage.kategorieId,
              vorlageId: vorlage.id,
              jeTermin: false,
              beginn: null,
              ende: null,
              bedarf: null,
            },
          });
          if (!geparst.success) {
            throw new HTTPException(400, {
              message: geparst.error.issues[0]?.message ?? 'Ungültige Umfrage.',
            });
          }
          const eingabe = await terminVorbereiten(geparst.data);
          const id = await deps.umfragen.anlegen(umfrageSpeichern(eingabe), sub);
          await deps.privatpartys.umfrageSetzen(e.id, id);
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
      .post(
        '/privatpartys/:id/nachrichten',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyNachrichtSchema),
        async (c) => {
          const sub = c.get('user').sub;
          const e = await privatpartyGefunden(c.req.param('id'));
          if (!(await deps.partymail.eingerichtet())) {
            throw new HTTPException(409, { message: MAIL_AUS });
          }
          const an = await antwortAdresse(e);
          if (!an) {
            throw new HTTPException(400, {
              message:
                'Es gibt keine E-Mail-Adresse für die Antwort. Trage sie bei der Person ein.',
            });
          }
          const bisher = await deps.privatpartys.nachrichten(e.id);
          const letzte = bisher.at(-1);
          const betreff = letzte?.betreff?.trim()
            ? /^re:/i.test(letzte.betreff.trim())
              ? letzte.betreff.trim()
              : `Re: ${letzte.betreff.trim()}`
            : 'Deine Anfrage beim C4';
          const gesendet = await deps.partymail
            .senden({
              an,
              betreff,
              text: c.req.valid('json').text,
              inReplyTo: letzte?.messageId ?? null,
              referenzen: letzte
                ? [...new Set([...letzte.referenzen, letzte.messageId])].slice(-20)
                : [],
            })
            .catch((err: unknown) => {
              console.error('Party-Mail send failed', err);
              throw new HTTPException(502, {
                message:
                  `Die Mail konnte nicht gesendet werden. ${err instanceof Error ? err.message : ''}`.trim(),
              });
            });
          const id = await deps.privatpartys.nachrichtAnlegen({
            privatpartyId: e.id,
            richtung: 'aus',
            messageId: gesendet.messageId,
            inReplyTo: letzte?.messageId ?? null,
            referenzen: letzte ? [...letzte.referenzen, letzte.messageId] : [],
            vonAdresse: gesendet.vonAdresse,
            vonName: gesendet.vonName,
            anAdresse: an,
            betreff,
            text: c.req.valid('json').text,
            anhaenge: [],
            zeitpunkt: new Date(),
            mitgliedSub: sub,
          });
          await bestEffort(() => deps.partymail.gesendetAblegen(gesendet.raw));
          return c.json({ id }, 201);
        },
      )
      .post(
        '/privatpartys/:id/zusage',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyZusageSchema),
        async (c) => {
          const e = await privatpartyGefunden(c.req.param('id'));
          const { terminId, vorlageId } = c.req.valid('json');
          const eventId = await privatpartyZusagen(e, terminId, vorlageId, c.get('user').sub);
          return c.json({ eventId }, 201);
        },
      )
      .put(
        '/privatpartys/:id/status',
        auth,
        privatpartysVerwalten,
        zValidator('json', privatpartyStatusEingabeSchema),
        async (c) => {
          const e = await privatpartyGefunden(c.req.param('id'));
          const { status, terminId, vorlageId } = c.req.valid('json');
          if (status === 'zugesagt') {
            if (!terminId || !vorlageId) {
              throw new HTTPException(400, { message: 'Bitte wähle Termin und Vorlage.' });
            }
            const eventId = await privatpartyZusagen(e, terminId, vorlageId, c.get('user').sub);
            return c.json({ eventId });
          }
          // Leaving "zugesagt" deletes the event (if it is already gone, nothing to do).
          if (e.eventId) await eventLoeschenMitPruefung(e.eventId);
          await deps.privatpartys.statusSetzen(e.id, status);
          return c.json({ ok: true });
        },
      )
      // ----- Todos (see docs/todos.md): always the signed-in member's own
      .get('/me/todos', auth, async (c) => {
        const sub = c.get('user').sub;
        const liste = await deps.todos.meine(sub);
        const [mitglieder, quellen] = await Promise.all([
          protokollMitglieder(),
          todoQuellen(liste),
        ]);
        const nachSub = new Map(mitglieder.map((m) => [m.sub, m]));
        const dtos: Todo[] = todosSortieren(liste.map((t) => alsTodoDto(t, sub, nachSub, quellen)));
        return c.json(dtos);
      })
      .post('/me/todos', auth, zValidator('json', todoEingabeSchema), async (c) => {
        const sub = c.get('user').sub;
        const daten = c.req.valid('json');
        const id = await deps.todos.anlegen({
          titel: daten.titel,
          notizen: daten.notizen || null,
          faelligAm: daten.faelligAm,
          modus: 'einzeln',
          protokollId: null,
          bausteinId: null,
          erstelltVon: sub,
          subs: [sub],
        });
        const t = gefunden(await deps.todos.byId(id), 'Todo nicht gefunden');
        return c.json(await todoFuer(t, sub), 201);
      })
      .put('/me/todos/:id', auth, zValidator('json', todoEingabeSchema), async (c) => {
        const sub = c.get('user').sub;
        const t = await todoBearbeitbarLaden(c.req.param('id'), sub);
        const daten = c.req.valid('json');
        gefunden(
          await deps.todos.aendern(t.id, {
            titel: daten.titel,
            notizen: daten.notizen || null,
            faelligAm: daten.faelligAm,
            modus: t.modus,
          }),
          'Todo nicht gefunden',
        );
        const neu = gefunden(await deps.todos.byId(t.id), 'Todo nicht gefunden');
        return c.json(await todoFuer(neu, sub));
      })
      .delete('/me/todos/:id', auth, async (c) => {
        const t = await todoBearbeitbarLaden(c.req.param('id'), c.get('user').sub);
        gefunden(await deps.todos.loeschen(t.id), 'Todo nicht gefunden');
        return c.json({ ok: true });
      })
      .put('/me/todos/:id/erledigt', auth, zValidator('json', todoErledigtSchema), async (c) => {
        const sub = c.get('user').sub;
        const id = c.req.param('id');
        const ergebnis = await deps.todos.abhaken(id, sub, c.req.valid('json').erledigt);
        if (ergebnis === 'nicht_gefunden') {
          throw new HTTPException(404, { message: 'Todo nicht gefunden' });
        }
        if (ergebnis === 'nicht_zustaendig') {
          throw new HTTPException(403, { message: 'Du bist für dieses Todo nicht zuständig.' });
        }
        const t = gefunden(await deps.todos.byId(id), 'Todo nicht gefunden');
        return c.json(await todoFuer(t, sub));
      })
      // ----- Protokolle
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
      // Sitzungen a protocol can still be started for: up to tomorrow, newest first.
      .get('/protokolle/sitzungen', auth, protokolleSchreiben, async (c) => {
        const vorhandene = (await deps.protokolle.alle()).map((p) => p.eventId);
        const bis = new Date(Date.now() + 24 * 3600_000);
        const sitzungen = await deps.kalender.sitzungen(bis, PROTOKOLL_SITZUNGEN_MAX, vorhandene);
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

          // The chosen Aktionen run one by one, a failure does not stop the others or the closing.
          const lauf =
            aktionenIds.length > 0
              ? await aktionenLaufer.laufen(
                  await aktionenBerechnen(p, dokument),
                  aktionenIds,
                  akteur,
                )
              : { ausgaenge: [], patches: [], ergebnisse: {} };
          const wirkung = lauf.patches.length > 0 || Object.keys(lauf.ergebnisse).length > 0;
          try {
            const ergebnis = await nachAktionenSchreiben(
              p,
              async (stand) => {
                const frisch =
                  stand === p ? neuerKopf : abschliessen(protokollKopfLesen(stand.kopf));
                const neu = mitErgebnissen(stand, lauf.patches, lauf.ergebnisse);
                return gefunden(
                  await deps.protokolle.statusSetzen(
                    p.id,
                    status,
                    JSON.stringify({
                      ...frisch,
                      aktionen: { ...frisch.aktionen, ...neu.aktionen },
                    }),
                    stand.version,
                    akteur,
                    lauf.patches.length > 0 ? JSON.stringify(neu.inhalt) : undefined,
                  ),
                  'Protokoll nicht gefunden',
                );
              },
              wirkung,
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
          const lauf = await aktionenLaufer.laufen(
            await aktionenBerechnen(p, protokollInhaltLesen(p.inhalt)),
            c.req.valid('json').aktionen,
            akteur,
          );
          let version = p.version;
          if (lauf.patches.length > 0 || Object.keys(lauf.ergebnisse).length > 0) {
            try {
              const ergebnis = await nachAktionenSchreiben(p, async (stand) => {
                const neu = mitErgebnissen(stand, lauf.patches, lauf.ergebnisse);
                return gefunden(
                  await deps.protokolle.ergebnisSpeichern(
                    p.id,
                    {
                      inhalt: JSON.stringify(neu.inhalt),
                      kopf: JSON.stringify({ ...neu.kopf, aktionen: neu.aktionen }),
                      version: stand.version,
                    },
                    akteur,
                  ),
                  'Protokoll nicht gefunden',
                );
              });
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
      // ----- Finanzen (see docs/finanzen.md). Bookings are insert-only: no PUT/DELETE on them.
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
      // Journal page by page, newest first; `weiter` is the `vorSeq` of the next page.
      .get(
        '/finanzen/buchungen',
        auth,
        finanzenLesen,
        zValidator('query', journalAbfrageSchema),
        async (c) => {
          const abfrage = c.req.valid('query');
          const [liste, mitglied] = await Promise.all([
            deps.finanzen.journal({ ...abfrage, limit: abfrage.limit + 1 }),
            finanzenMitglieder(),
          ]);
          const seite = liste.slice(0, abfrage.limit);
          const dto: BuchungenSeiteDto = {
            buchungen: seite.map((b): BuchungListeDto => ({
              ...b,
              erstelltVon: mitglied(b.erstelltVon),
            })),
            weiter: liste.length > seite.length ? (seite.at(-1)?.seq ?? null) : null,
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
        const a = await aufruferFuerUmfrage(c, c.req.param('id'));
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
        const a = await aufruferFuerUmfrage(c, c.req.param('id'));
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
          const a = await aufruferFuerUmfrage(c, c.req.param('id'));
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
      .get(
        '/bilder/ordner',
        auth,
        bilderLesen,
        zValidator('query', z.object({ quelle: z.enum(['cache']).optional() })),
        async (c) => {
          if (c.req.valid('query').quelle === 'cache') {
            const [status, snapshot] = await Promise.all([
              deps.onedrive.status(),
              deps.ordnerCache.lesen(),
            ]);
            return c.json({
              verbunden: status.verbunden,
              ordner: snapshot && status.verbunden ? await bilderListe(snapshot.ordner) : [],
              stand: snapshot && status.verbunden ? snapshot.stand.toISOString() : null,
              ausCache: true,
            } satisfies BilderListeDto);
          }
          let ordner;
          try {
            ordner = await deps.onedrive.ordnerListen();
          } catch (err) {
            if (err instanceof NichtVerbunden) {
              return c.json({
                verbunden: false,
                ordner: [],
                stand: null,
                ausCache: false,
              } satisfies BilderListeDto);
            }
            return onedriveFehler(err);
          }
          const stand = new Date();
          await deps.ordnerCache.schreiben(ordner, stand).catch((err) => {
            console.error('Storing the folder list cache failed', err);
          });
          return c.json({
            verbunden: true,
            ordner: await bilderListe(ordner),
            stand: stand.toISOString(),
            ausCache: false,
          } satisfies BilderListeDto);
        },
      )
      .post(
        '/bilder/ordner',
        auth,
        bilderLesen,
        zValidator('json', bilderOrdnerAnlegenSchema),
        async (c) => {
          const { eventName, von, bis } = c.req.valid('json');
          const name = ordnerName(von, bis ?? von, eventName);
          const ordner = await deps.onedrive.ordnerAnlegen(name).catch(onedriveFehler);
          await ordnerCacheEinfuegen(ordner);
          const geparst = ordnerNameParsen(ordner.name);
          return c.json(
            {
              id: ordner.id,
              name: ordner.name,
              webUrl: ordner.webUrl,
              von: geparst?.von ?? von,
              bis: geparst?.bis ?? bis ?? von,
              eventName: geparst?.eventName ?? eventName,
              genauigkeit: geparst?.genauigkeit ?? 'tag',
              freigabeUrl: await freigabeVersuchen(ordner.id),
              eventId: null,
            } satisfies BilderOrdnerDto,
            201,
          );
        },
      )
      // Anonymous read-only sharing link of a folder (created and cached on first use).
      .post('/bilder/ordner/:id/freigabe', auth, bilderLesen, async (c) => {
        const url = await freigabeErstellen(c.req.param('id')).catch(onedriveFehler);
        return c.json({ url });
      })
      // ----- Bilder: OneDrive connection (admins)
      .get('/bilder/verbindung', auth, adminOnly, async (c) => c.json(await deps.onedrive.status()))
      .put(
        '/bilder/verbindung',
        auth,
        adminOnly,
        zValidator(
          'json',
          z.object({
            clientId: z.string().trim().min(1, 'Bitte gib die Client-ID an.').max(200),
            clientSecret: z
              .string()
              .trim()
              .max(500)
              .optional()
              .transform((v) => v || undefined),
            basisPfad: z.string().trim().max(300).default(''),
          }),
        ),
        async (c) => {
          const { clientSecret, ...rest } = c.req.valid('json');
          const akteur = await akteurMitName(c.get('user').sub);
          await deps.onedrive
            .konfigurieren({ ...rest, ...(clientSecret && { clientSecret }) }, akteur.name)
            .catch(onedriveFehler);
          return c.json(await deps.onedrive.status());
        },
      )
      .post(
        '/bilder/verbindung/login',
        auth,
        adminOnly,
        zValidator(
          'json',
          z.object({ redirectUri: z.string().max(500), state: z.string().min(8).max(200) }),
        ),
        async (c) => {
          const { redirectUri, state } = c.req.valid('json');
          redirectUriPruefen(redirectUri);
          const url = await deps.onedrive.loginUrl(redirectUri, state).catch(onedriveFehler);
          return c.json({ url });
        },
      )
      .post(
        '/bilder/verbindung/code',
        auth,
        adminOnly,
        zValidator(
          'json',
          z.object({ code: z.string().min(1).max(4000), redirectUri: z.string().max(500) }),
        ),
        async (c) => {
          const { code, redirectUri } = c.req.valid('json');
          redirectUriPruefen(redirectUri);
          const akteur = await akteurMitName(c.get('user').sub);
          return c.json(
            await deps.onedrive.codeEinloesen(code, redirectUri, akteur.name).catch(onedriveFehler),
          );
        },
      )
      .delete('/bilder/verbindung', auth, adminOnly, async (c) => {
        await deps.onedrive.trennen();
        return c.json(await deps.onedrive.status());
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
      // ----- Contact cards (vCard): the phone's Contacts app opens a plain URL, so the link carries a
      // short-lived token of the viewing member instead of a bearer token.
      .post('/me/vcard-token', auth, mitgliederLesen, async (c) => {
        const sub = c.get('user').sub;
        if (!(await deps.mitglieder.holen(sub)))
          throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        const { token, ablauf } = await deps.mitglieder.vcardTokenErzeugen(sub);
        return c.json({ token, ablauf: ablauf.toISOString() });
      })
      // Public on purpose (no `auth`); API Gateway needs a matching route without authorizer.
      .get('/vcard/:token/:datei', async (c) => {
        const nichtGefunden = new HTTPException(404, { message: 'Kontakt nicht gefunden' });
        const eintrag = await deps.mitglieder.vcardTokenSuchen(
          vcardTokenHash(c.req.param('token')),
        );
        if (!eintrag || eintrag.ablauf.getTime() <= Date.now()) throw nichtGefunden;
        // The token owner must still be active and allowed to read members.
        const [inhaber, rollen, rechte] = await Promise.all([
          deps.mitglieder.holen(eintrag.sub),
          deps.userAdmin.rollen(),
          deps.posten.rechteVon(eintrag.sub),
        ]);
        if (!inhaber || istDeaktiviert(inhaber)) throw nichtGefunden;
        const erlaubt = permissionsFor(rollen.get(eintrag.sub) ?? [], inhaber.status, rechte);
        if (!erlaubt.includes('mitglieder:lesen')) throw nichtGefunden;
        const kennung = decodeURIComponent(c.req.param('datei')).replace(/\.vcf$/i, '');
        const liste = await alleMitglieder(false, true);
        const mitglied =
          liste.find((m) => m.sub === kennung) ??
          liste.find((m) => m.username?.toLowerCase() === kennung.toLowerCase());
        if (!mitglied || mitglied.deaktiviert) throw nichtGefunden;
        let fotoBase64: string | null = null;
        if (mitglied.profilbildKey) {
          try {
            const bytes = await deps.profilbilder.lesen(kleinKey(mitglied.profilbildKey));
            fotoBase64 = Buffer.from(bytes).toString('base64');
          } catch (err) {
            console.error('vcard: profile picture not readable', err);
          }
        }
        const name =
          mitglied.username ?? (`${mitglied.vorname} ${mitglied.nachname}`.trim() || 'kontakt');
        const dateiname = `${name.replace(/[^\w.-]+/g, '_')}.vcf`;
        return c.body(vcardErstellen({ ...mitglied, fotoBase64 }), 200, {
          'Content-Type': 'text/vcard; charset=utf-8',
          'Content-Disposition': `inline; filename="${dateiname}"`,
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
      .get(
        '/me/benachrichtigungen/verlauf',
        auth,
        profilBearbeiten,
        zValidator('query', verlaufSeiteQuerySchema),
        async (c) => {
          const { art, bereich, ungelesen, vor: vorWert } = c.req.valid('query');
          const vor = cursorLesen(vorWert);
          const { eintraege, weiter } = await deps.benachrichtigungen.verlaufSeite(
            c.get('user').sub,
            {
              art,
              bereich,
              nurUngelesen: ungelesen === 'true',
              vor: vor && { erstellt: vor.erstelltAm, id: vor.id },
              limit: VERLAUF_SEITE,
            },
          );
          const dto: VerlaufSeiteDto = {
            eintraege: eintraege.map((e) => ({
              id: e.id,
              art: e.art,
              titel: e.titel,
              text: e.text,
              url: e.url,
              erstellt: e.erstellt.toISOString(),
              gelesen: e.gelesen !== null,
            })),
            weiter: weiter ? cursorSchreiben({ erstelltAm: weiter.erstellt, id: weiter.id }) : null,
          };
          return c.json(dto);
        },
      )
      .get('/me/benachrichtigungen/verlauf/ungelesen', auth, profilBearbeiten, async (c) =>
        c.json({ anzahl: await deps.benachrichtigungen.verlaufUngelesen(c.get('user').sub) }),
      )
      .post(
        '/me/benachrichtigungen/verlauf/gelesen',
        auth,
        profilBearbeiten,
        zValidator('json', verlaufAlleGelesenSchema),
        async (c) => {
          await deps.benachrichtigungen.verlaufAlleGelesen(c.get('user').sub, c.req.valid('json'));
          return c.body(null, 204);
        },
      )
      .post('/me/benachrichtigungen/verlauf/:id/gelesen', auth, profilBearbeiten, async (c) => {
        gefunden(
          await deps.benachrichtigungen.verlaufGelesen(c.get('user').sub, c.req.param('id')),
          'Benachrichtigung nicht gefunden',
        );
        return c.body(null, 204);
      })
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
