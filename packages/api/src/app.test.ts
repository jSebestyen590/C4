import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ausleihFehler,
  ausleiheTage,
  bodenNamenFehler,
  gebindeDoppelt,
  kinderArtNach,
  lagerortArtAenderungFehler,
  lagerortArtFehler,
  aktuellerStatus,
  heuteBerlin,
  type MitgliedHistorie,
  statusVerlaufSortieren,
  type StatusEintrag,
  type StatusEintragEingabe,
  tagNachher,
  tagVorher,
  type DurchgaengeSeiteDto,
  type BilderOrdnerDto,
  type EventDto,
  type PrivatpartyDetailDto,
  type TrichterUebersichtDto,
  type UmfrageDetailDto,
  type UmfrageListeDto,
  type AdminUser,
  type MitgliedStatus,
  type PostenRecht,
  ifcoPlatzHatIfcosFehler,
  ifcoPlatzHatWareFehler,
  halterGleich,
  SCHLUESSEL_VERLAUF_MAX,
  type Halter,
  type ProtokollDokument,
  type EventKategorieDto,
  type ProtokollAktionenAntwort,
  type ProtokollAktionenAusfuehrenAntwort,
  type ProtokollDto,
  type ProtokollStatusAntwort,
  type Todo,
  type ProtokollListeEintragDto,
  bausteinErzeugen,
  bausteinLeer,
  protokollKopfLeer,
  protokollLeer,
  type ProtokollKnoten,
} from '@c4/shared';
import { createApp } from './app';
import { createBenachrichtigungen, type PushErgebnis } from './benachrichtigungen';
import { createFakeBenachrichtigungenStore } from './benachrichtigungen.fake';
import { UsernameTakenError, type Konto } from './admin';
import { CodeUngueltig, EmailVergeben, NeuAnmeldungNoetig } from './emailaenderung';
import type { AuthUser } from './auth';
import type { MitgliedRow } from './db/schema';
import {
  LetzterStatusEintrag,
  StatusDatumDoppelt,
  vcardTokenHash,
  type MitgliedDaten,
} from './mitglieder';
import {
  GEBINDE_DOPPELT,
  verwendetMeldung,
  WarenKonflikt,
  WarenUngueltig,
  zyklusFehler,
  type GebindeDaten,
  type LagerortDaten,
  type WarenStore,
} from './waren';
import type { InventarStore } from './inventar';
import {
  EntfernungBestaetigen,
  KalenderKonflikt,
  VerfuegbarkeitBestaetigen,
  KalenderUngueltig,
  SerieBetroffen,
  tokenHash,
  type DienstInfo,
  type EventKurz,
  type KalenderStore,
} from './kalender';
import type { GebindeRow, LagerortRow } from './db/schema';
import {
  AblosungUngueltig,
  BesetzungUeberschneidung,
  ueberschneiden,
  type AktuellerPosten,
  type BesetzungDaten,
  type PostenDaten,
  type PostenDetails,
} from './posten';
import { UebergabeKonflikt, type SchluesselDetails, type SchluesselStore } from './schluessel';
import { createFakeOneDrive } from './onedrive.fake';
import {
  createMemoryFreigabenStore,
  createMemoryOrdnerCacheStore,
  freigabenNachziehen,
} from './onedrive';
import type { EingehendeMail } from './partymailTypen';
import { createFakePartyMail } from './partymail.fake';
import { createFakePrivatpartysStore } from './privatpartys.fake';
import { createFakeProtokolleStore } from './protokolle.fake';
import { createFakeSchluesselAnfragenStore } from './schluesselAnfragen.fake';
import { createFakeTodosStore } from './todos.fake';
import { createFakeTrichterStore } from './trichter.fake';
import { createFakeFinanzenStore } from './finanzen.fake';
import { createFakeUmfragenStore } from './umfragen.fake';

/** Map-backed fake of the key store with the same conflict and history rules as the real one. */
function makeSchluesselFake(beiUebergabe?: (id: string, an: Halter) => void) {
  const liste = new Map<string, SchluesselDetails>();
  const fake = {
    alle: vi.fn(async (mitArchiv: boolean) =>
      [...liste.values()].filter((s) => mitArchiv || !s.archiviert),
    ),
    holen: vi.fn(async (id: string) => liste.get(id)),
    anlegen: vi.fn(
      async (
        daten: { name: string; beschreibung: string | null; halter: Halter },
        akteur: string,
      ) => {
        const id = `s${liste.size + 1}`;
        const jetzt = new Date();
        liste.set(id, {
          id,
          ...daten,
          archiviert: false,
          halterSeit: daten.halter ? jetzt : null,
          uebergaben: daten.halter
            ? [{ id: 'u0', von: null, an: daten.halter, eingetragenVon: akteur, zeitpunkt: jetzt }]
            : [],
        });
        return id;
      },
    ),
    aktualisieren: vi.fn(
      async (id: string, daten: { name: string; beschreibung: string | null }) => {
        const s = liste.get(id);
        if (s) Object.assign(s, daten);
        return !!s;
      },
    ),
    archivieren: vi.fn(async (id: string, archiviert: boolean) => {
      const s = liste.get(id);
      if (s) s.archiviert = archiviert;
      return !!s;
    }),
    uebergeben: vi.fn(async (id: string, u: { von: Halter; an: Halter }, akteur: string) => {
      const s = liste.get(id);
      if (!s) return undefined;
      if (s.archiviert || !halterGleich(s.halter, u.von)) throw new UebergabeKonflikt();
      const jetzt = new Date();
      s.uebergaben = [
        {
          id: `u${s.uebergaben.length + 1}`,
          von: s.halter,
          an: u.an,
          eingetragenVon: akteur,
          zeitpunkt: jetzt,
        },
        ...s.uebergaben,
      ].slice(0, SCHLUESSEL_VERLAUF_MAX);
      s.halter = u.an;
      s.halterSeit = jetzt;
      beiUebergabe?.(id, u.an);
      return s;
    }),
  } satisfies SchluesselStore;
  return { fake, liste };
}

const users: Record<string, AuthUser> = {
  'admin-token': { sub: 'a', groups: ['admin'] },
  'reader-token': { sub: 'r', groups: [] },
  'vorstand-token': { sub: 'v', groups: [] },
  'member-token': { sub: 'm2', groups: [] },
};

/** Map-backed fake of the lagerorte/gebinde parts; the rest records its calls. */
function makeWarenFake() {
  const orte = new Map<string, LagerortRow>();
  const gebindeListe = new Map<string, GebindeRow>();
  const verwendet = new Set<string>();
  const fake = {
    lagerorte: vi.fn(async (mitArchiv: boolean) =>
      [...orte.values()].filter((l) => mitArchiv || !l.archiviert),
    ),
    lagerortAnlegen: vi.fn(async (daten: LagerortDaten, boeden: string[] = []) => {
      const art = daten.art ?? null;
      const fehler = lagerortArtFehler(art, orte.get(daten.parentId ?? '') ?? null);
      if (fehler) throw new WarenUngueltig(fehler);
      const neu = (name: string, parentId: string | null, a: LagerortRow['art']) => {
        const id = `l${orte.size + 1}`;
        orte.set(id, {
          id,
          name,
          beschreibung: null,
          parentId,
          art: a,
          position: orte.size,
          archiviert: false,
          ifcoHoeheCm: null,
          ifcoStellflaechen: null,
        });
        return id;
      };
      const id = neu(daten.name, daten.parentId, art);
      orte.get(id)!.beschreibung = daten.beschreibung;
      return { id, boedenIds: boeden.map((n) => neu(n, id, 'regalboden')) };
    }),
    boedenHinzufuegen: vi.fn(async (id: string, namen: string[]) => {
      const regal = orte.get(id);
      if (!regal) return undefined;
      if (regal.art !== 'regal') throw new WarenUngueltig('Kein Regal.');
      const fehler = bodenNamenFehler(
        namen,
        [...orte.values()].filter((o) => o.parentId === id).map((o) => o.name),
      ).find(Boolean);
      if (fehler) throw new WarenUngueltig(fehler);
      return namen.map((name) => {
        const neuId = `l${orte.size + 1}`;
        orte.set(neuId, {
          id: neuId,
          name,
          beschreibung: null,
          parentId: id,
          art: 'regalboden',
          position: orte.size,
          archiviert: false,
          ifcoHoeheCm: null,
          ifcoStellflaechen: null,
        });
        return neuId;
      });
    }),
    lagerortAktualisieren: vi.fn(async (id: string, daten: LagerortDaten) => {
      const l = orte.get(id);
      if (!l) return false;
      const fehler = zyklusFehler([...orte.values()], id, daten.parentId);
      if (fehler) throw new WarenUngueltig(fehler);
      const art = daten.art === undefined ? l.art : daten.art;
      const alle = [...orte.values()];
      const artFehler =
        lagerortArtAenderungFehler(l, art, alle) ??
        lagerortArtFehler(art, orte.get(daten.parentId ?? '') ?? null);
      if (artFehler) throw new WarenUngueltig(artFehler);
      const kinderArt = kinderArtNach(l.art, art);
      if (kinderArt !== undefined) {
        for (const k of alle.filter((o) => o.parentId === id))
          orte.set(k.id, { ...k, art: kinderArt });
      }
      orte.set(id, {
        ...l,
        name: daten.name,
        beschreibung: daten.beschreibung,
        parentId: daten.parentId,
        art,
      });
      return true;
    }),
    lagerortLoeschen: vi.fn(async (id: string) => {
      if (!orte.has(id)) return false;
      if (verwendet.has(id)) throw new WarenKonflikt(verwendetMeldung('Lagerort'));
      orte.delete(id);
      return true;
    }),
    lagerortArchivieren: vi.fn(async (id: string, archiviert: boolean) => {
      const l = orte.get(id);
      if (!l) return false;
      if (archiviert && verwendet.has(id)) throw new WarenKonflikt('Noch Bestand vorhanden.');
      orte.set(id, { ...l, archiviert });
      return true;
    }),
    lagerortReihenfolge: vi.fn<WarenStore['lagerortReihenfolge']>(async () => true),
    lagerortWaren: vi.fn(async (id: string) => (orte.has(id) ? ['w1'] : undefined)),
    lagerortWarenlisten: vi.fn<WarenStore['lagerortWarenlisten']>(async () => [
      { lagerortId: 'l1', wareIds: ['w1'] },
    ]),
    lagerortWarenSetzen: vi.fn<WarenStore['lagerortWarenSetzen']>(async (id) => orte.has(id)),
    warengruppen: vi.fn(async () => []),
    warengruppeAnlegen: vi.fn(async () => 'g1'),
    warengruppeAktualisieren: vi.fn(async () => true),
    warengruppeLoeschen: vi.fn(async () => true),
    warengruppeArchivieren: vi.fn(async () => true),
    gebinde: vi.fn(async () => [...gebindeListe.values()]),
    gebindeAnlegen: vi.fn(async (daten: GebindeDaten) => {
      if (gebindeDoppelt(daten, [...gebindeListe.values()])) {
        throw new WarenKonflikt(GEBINDE_DOPPELT);
      }
      const id = `gb${gebindeListe.size + 1}`;
      gebindeListe.set(id, { id, ...daten, archiviert: false });
      return id;
    }),
    gebindeAktualisieren: vi.fn(async () => true),
    gebindeLoeschen: vi.fn(async () => true),
    gebindeArchivieren: vi.fn(async () => true),
    waren: vi.fn(async () => []),
    wareHolen: vi.fn(async () => undefined),
    wareAnlegen: vi.fn(async () => 'w1'),
    wareAktualisieren: vi.fn(async () => true),
    wareLoeschen: vi.fn(async () => true),
    wareArchivieren: vi.fn(async () => true),
    wareBestand: vi.fn(async () => []),
    wareVerlauf: vi.fn(async () => undefined),
    wareVorgaenge: vi.fn(async () => undefined),
    einlagern: vi.fn<WarenStore['einlagern']>(async () => 'v1'),
    entnehmen: vi.fn<WarenStore['entnehmen']>(async () => 'v2'),
    einlagerungen: vi.fn<WarenStore['einlagerungen']>(async () => 'v4'),
    entnahmen: vi.fn<WarenStore['entnahmen']>(async () => ({
      entnahmeId: 'v5',
      umlagerungId: null,
    })),
    umlagerungen: vi.fn<WarenStore['umlagerungen']>(async () => 'v6'),
    lagerortBestand: vi.fn<WarenStore['lagerortBestand']>(async () => []),
    vorgangLoeschen: vi.fn(async (id: string) => id === 'v1'),
    inventuren: vi.fn(async () => []),
    inventurStarten: vi.fn<WarenStore['inventurStarten']>(async () => 'i1'),
    inventurHolen: vi.fn(async () => undefined),
    inventurKnotenSpeichern: vi.fn(async () => true),
    inventurZusammenfassung: vi.fn(async () => undefined),
    inventurAbschliessen: vi.fn(async (id: string) => (id === 'i1' ? 'v3' : undefined)),
    inventurVerwerfen: vi.fn(async () => true),
  } satisfies WarenStore;
  return { fake, orte, verwendet };
}

/** Records the calls; `bekannt` are the ids that exist, `verwendet` the ones that refuse deleting. */
function makeInventarFake() {
  const bekannt = new Set(['k1', 'g1', 'i1', 'a1', 't1']);
  const verwendet = new Set<string>();
  const finde = <T>(id: string, wert: T) => (bekannt.has(id) ? wert : undefined);
  const setze = (id: string) => bekannt.has(id);
  const fake = {
    kategorien: vi.fn(async () => []),
    kategorieAnlegen: vi.fn<InventarStore['kategorieAnlegen']>(async () => 'k2'),
    kategorieAktualisieren: vi.fn<InventarStore['kategorieAktualisieren']>(async (id) => setze(id)),
    kategorieLoeschen: vi.fn(async (id: string) => {
      if (!bekannt.has(id)) return false;
      if (verwendet.has(id)) throw new WarenKonflikt(verwendetMeldung('Kategorie'));
      return true;
    }),
    kategorieArchivieren: vi.fn<InventarStore['kategorieArchivieren']>(async (id) => setze(id)),
    gegenstaende: vi.fn<InventarStore['gegenstaende']>(async () => []),
    gegenstandHolen: vi.fn(async (id: string) =>
      finde(id, {
        id,
        name: 'Kabeltrommel',
        beschreibung: null,
        kategorieId: 'k1',
        anzahl: 10,
        archiviert: false,
        teilVon: null,
        virtuell: false,
        anzahlJe: null,
        plaetze: [],
        verbaut: [],
        verliehen: 0,
        vorgemerkt: 0,
      }),
    ),
    gegenstandAnlegen: vi.fn<InventarStore['gegenstandAnlegen']>(async () => 'g2'),
    gegenstandAktualisieren: vi.fn<InventarStore['gegenstandAktualisieren']>(async (id) =>
      setze(id),
    ),
    gegenstandLoeschen: vi.fn(async (id: string) => {
      if (!bekannt.has(id)) return false;
      if (verwendet.has(id)) throw new WarenKonflikt(verwendetMeldung('Gegenstand'));
      return true;
    }),
    gegenstandArchivieren: vi.fn<InventarStore['gegenstandArchivieren']>(async (id) => setze(id)),
    gegenstandPlaetzeSetzen: vi.fn<InventarStore['gegenstandPlaetzeSetzen']>(async (id) => {
      if (verwendet.has(id))
        throw new WarenKonflikt('Davon sind noch 3 verliehen oder vorgemerkt.');
      return setze(id);
    }),
    ifcoTypen: vi.fn<InventarStore['ifcoTypen']>(async () => []),
    ifcoTypAnlegen: vi.fn<InventarStore['ifcoTypAnlegen']>(async () => 't2'),
    ifcoTypAktualisieren: vi.fn<InventarStore['ifcoTypAktualisieren']>(async (id) => setze(id)),
    ifcoTypLoeschen: vi.fn(async (id: string) => {
      if (!bekannt.has(id)) return false;
      if (verwendet.has(id)) throw new WarenKonflikt(verwendetMeldung('IFCO-Typ'));
      return true;
    }),
    ifcoTypArchivieren: vi.fn<InventarStore['ifcoTypArchivieren']>(async (id) => setze(id)),
    ifcos: vi.fn<InventarStore['ifcos']>(async () => []),
    ifcoHolen: vi.fn(async (id: string) =>
      finde(id, {
        id,
        name: 'Spanngurtkiste',
        beschreibung: null,
        lagerortId: null,
        archiviert: false,
        typId: null,
        inhalt: [],
        ausleihe: null,
      }),
    ),
    ifcoAnlegen: vi.fn<InventarStore['ifcoAnlegen']>(async () => 'i2'),
    ifcoAktualisieren: vi.fn<InventarStore['ifcoAktualisieren']>(async (id) => setze(id)),
    ifcoLoeschen: vi.fn(async (id: string) => setze(id)),
    ifcoArchivieren: vi.fn<InventarStore['ifcoArchivieren']>(async (id) => setze(id)),
    ifcoPlatzSetzen: vi.fn<InventarStore['ifcoPlatzSetzen']>(async (id) => setze(id)),
    ifcoInhaltSetzen: vi.fn<InventarStore['ifcoInhaltSetzen']>(async (id) => setze(id)),
    ausleihen: vi.fn<InventarStore['ausleihen']>(async () => []),
    ausleiheHolen: vi.fn(async (id: string) =>
      finde(id, {
        id,
        an: 'Feuerwehr',
        ausgeliehenAm: new Date('2026-05-01T10:00:00.000Z'),
        rueckgabeGeplant: '2026-05-08',
        kommentar: null,
        erstelltVon: 'r',
        organisiertVon: 'r',
        erstelltAm: new Date('2026-05-01T10:00:00.000Z'),
        erledigt: false,
        status: 'verliehen' as const,
        positionen: [],
        gefaehrdetDurch: [],
        organisator: {
          sub: 'r',
          username: null,
          vorname: 'Rita',
          nachname: 'Reader',
          status: 'mitglied' as const,
          anrede: 'neutral' as const,
        },
      }),
    ),
    ausleiheAnlegen: vi.fn<InventarStore['ausleiheAnlegen']>(async (daten) => {
      if (daten.positionen.some((p) => p.anzahl > 5)) {
        throw new WarenUngueltig('Von „Kabeltrommel“ sind bei „Lager“ nur noch 5 verfügbar.');
      }
      // Seeded reservation of all 5 pieces from 25.10. to 27.10.2026 (the period rules are the shared ones).
      const fehler = ausleihFehler(
        [{ gegenstandId: 'g1', lagerortId: 'l1', ifcoId: null, anzahl: 5 }],
        [
          {
            gegenstandId: 'g1',
            lagerortId: 'l1',
            ifcoId: null,
            anzahl: 5,
            an: 'Jugendgruppe',
            ausleiheId: 'a9',
            ausgeliehenAm: '2026-10-25T08:00:00.000Z',
            rueckgabeGeplant: '2026-10-27',
          },
        ],
        daten.positionen.map((p) => ({ ...p, gegenstandId: p.gegenstandId })),
        ausleiheTage(daten.ausgeliehenAm, daten.rueckgabeGeplant),
        { jetzt: new Date('2026-10-22T10:00:00.000Z') },
      );
      if (fehler) throw new WarenUngueltig(fehler);
      return 'a2';
    }),
    ausleiheAktualisieren: vi.fn<InventarStore['ausleiheAktualisieren']>(async (id) => setze(id)),
    ausleiheRueckgabe: vi.fn<InventarStore['ausleiheRueckgabe']>(async (id, positionIds) => {
      if (positionIds.includes('bereits')) throw new WarenUngueltig('Schon zurückgegeben.');
      return setze(id);
    }),
    ausleiheLoeschen: vi.fn(async (id: string) => setze(id)),
    aufraeumen: vi.fn<InventarStore['aufraeumen']>(async () => ({
      id: 'x1',
      gestartetAm: new Date('2026-05-01T10:00:00Z'),
      gestartetVon: {
        sub: 'v',
        username: null,
        vorname: 'Vera',
        nachname: 'Vorstand',
        status: 'mitglied',
        anrede: 'neutral',
      },
      fertig: [{ ifcoId: 'i1', fertigAm: new Date('2026-05-01T11:00:00Z'), von: null }],
    })),
    aufraeumenStarten: vi.fn<InventarStore['aufraeumenStarten']>(async () => 'x2'),
    bewegungen: vi.fn<InventarStore['bewegungen']>(async (id) =>
      finde(id, [
        {
          id: 'b1',
          gegenstandId: id,
          art: 'zugang' as const,
          grund: 'gekauft',
          anzahl: 7,
          datum: '2026-10-10',
          kommentar: null,
          ort: null,
          erstelltVon: 'v',
          erstelltAm: new Date('2026-10-10T10:00:00Z'),
          ersteller: {
            sub: 'v',
            username: null,
            vorname: 'Vera',
            nachname: 'Vorstand',
            status: 'mitglied' as const,
            anrede: 'neutral' as const,
          },
        },
      ]),
    ),
    bewegungBuchen: vi.fn<InventarStore['bewegungBuchen']>(async (id) => finde(id, 'b2')),
    bewegungLoeschen: vi.fn<InventarStore['bewegungLoeschen']>(
      async (id, bid) => setze(id) && bid === 'b1',
    ),
    aufraeumenBeenden: vi.fn<InventarStore['aufraeumenBeenden']>(async () => true),
    aufraeumIfcoSetzen: vi.fn<InventarStore['aufraeumIfcoSetzen']>(async (id) => setze(id)),
  } satisfies InventarStore;
  return { fake, verwendet };
}

/** Fake of the Kalender store: records calls; Dienste can be seeded to test the removal rules. */
function makeKalenderFake() {
  const dienste = new Map<string, DienstInfo>();
  const tokenNachSub = new Map<string, string>();
  let tokenZaehler = 0;
  /** Event id -> linked OneDrive folder. */
  const bilder = new Map<string, { id: string; url: string }>();
  const fake = {
    events: vi.fn<KalenderStore['events']>(async () => []),
    event: vi.fn<KalenderStore['event']>(async () => undefined),
    eventAnlegen: vi.fn<KalenderStore['eventAnlegen']>(async () => 'e1'),
    eventAktualisieren: vi.fn<KalenderStore['eventAktualisieren']>(async () => ({
      zeitGeaendert: false,
      geaenderteSchichten: [],
      entfernteDienste: [],
      mitgliedSubs: [],
      teilnehmerSubs: [],
      verantwortlichNeu: null,
    })),
    eventLoeschen: vi.fn<KalenderStore['eventLoeschen']>(async () => true),
    eventsKurz: vi.fn<KalenderStore['eventsKurz']>(async () => []),
    sitzungen: vi.fn<KalenderStore['sitzungen']>(async () => []),
    kommendeSitzungen: vi.fn<KalenderStore['kommendeSitzungen']>(async () => []),
    teilnahmeAntworten: vi.fn<KalenderStore['teilnahmeAntworten']>(async () => ({})),
    bilderOrdner: vi.fn<KalenderStore['bilderOrdner']>(async (id) => bilder.get(id) ?? null),
    bilderOrdnerSetzen: vi.fn<KalenderStore['bilderOrdnerSetzen']>(async (id, ordner) => {
      if (ordner) bilder.set(id, ordner);
      else bilder.delete(id);
      return true;
    }),
    bilderOrdnerZuordnung: vi.fn<KalenderStore['bilderOrdnerZuordnung']>(async () =>
      [...bilder].map(([eventId, o]) => ({ eventId, ordnerId: o.id })),
    ),
    absageSetzen: vi.fn<KalenderStore['absageSetzen']>(async () => ({
      geaendert: true,
      mitgliedSubs: [],
      teilnehmerSubs: [],
    })),
    dienstEintragen: vi.fn<KalenderStore['dienstEintragen']>(async () => ({
      id: 'd-neu',
      absageAufgehoben: false,
    })),
    dienstHolen: vi.fn(async (id: string) => dienste.get(id)),
    dienstEntfernen: vi.fn(async (id: string) => dienste.delete(id)),
    externe: vi.fn<KalenderStore['externe']>(async () => []),
    externAnlegen: vi.fn<KalenderStore['externAnlegen']>(async () => 'x1'),
    externAktualisieren: vi.fn<KalenderStore['externAktualisieren']>(async (id) => id === 'x1'),
    externeZusammenfuehren: vi.fn<KalenderStore['externeZusammenfuehren']>(async (ziel) =>
      ziel === 'x1' ? { verschoben: 1, verworfen: 0 } : undefined,
    ),
    dienstformen: vi.fn<KalenderStore['dienstformen']>(async () => []),
    dienstformAnlegen: vi.fn<KalenderStore['dienstformAnlegen']>(async () => 'f1'),
    dienstformAktualisieren: vi.fn<KalenderStore['dienstformAktualisieren']>(
      async (id) => id === 'f1',
    ),
    kategorien: vi.fn<KalenderStore['kategorien']>(async () => []),
    kategorieAnlegen: vi.fn<KalenderStore['kategorieAnlegen']>(async () => 'k1'),
    kategorieAktualisieren: vi.fn<KalenderStore['kategorieAktualisieren']>(
      async (id) => id === 'k1',
    ),
    vorlagen: vi.fn<KalenderStore['vorlagen']>(async () => []),
    vorlageAnlegen: vi.fn<KalenderStore['vorlageAnlegen']>(async () => 'v1'),
    vorlageAktualisieren: vi.fn<KalenderStore['vorlageAktualisieren']>(async (id) => id === 'v1'),
    vorlageLoeschen: vi.fn<KalenderStore['vorlageLoeschen']>(async (id) => id === 'v1'),
    serien: vi.fn<KalenderStore['serien']>(async () => []),
    serienMitAnzahl: vi.fn<KalenderStore['serienMitAnzahl']>(async () => []),
    serieAnlegen: vi.fn<KalenderStore['serieAnlegen']>(async () => 'plenum'),
    serieAktualisieren: vi.fn<KalenderStore['serieAktualisieren']>(async (id) => id === 'plenum'),
    serieAktivSetzen: vi.fn<KalenderStore['serieAktivSetzen']>(async (id) => id === 'plenum'),
    serieLoeschen: vi.fn<KalenderStore['serieLoeschen']>(async (id) => id === 'plenum'),
    serienTage: vi.fn<KalenderStore['serienTage']>(async () => []),
    serienTerminAnlegen: vi.fn<KalenderStore['serienTerminAnlegen']>(async () => true),
    statistik: vi.fn<KalenderStore['statistik']>(async () => []),
    tokenErzeugen: vi.fn<KalenderStore['tokenErzeugen']>(async (sub) => {
      const token = `tok-${++tokenZaehler}`;
      tokenNachSub.set(sub, tokenHash(token));
      return token;
    }),
    tokenVorhanden: vi.fn<KalenderStore['tokenVorhanden']>(async (sub) => tokenNachSub.has(sub)),
    subPerTokenHash: vi.fn<KalenderStore['subPerTokenHash']>(
      async (hash) => [...tokenNachSub].find(([, h]) => h === hash)?.[0],
    ),
    meineDienste: vi.fn<KalenderStore['meineDienste']>(async () => []),
    meineEvents: vi.fn<KalenderStore['meineEvents']>(async () => []),
    teilnahmeSetzen: vi.fn<KalenderStore['teilnahmeSetzen']>(async () => true),
    verfuegbarkeitSetzen: vi.fn<KalenderStore['verfuegbarkeitSetzen']>(async () => true),
    eventAboSetzen: vi.fn<KalenderStore['eventAboSetzen']>(async () => true),
    erinnerungsTeilnahmen: vi.fn<KalenderStore['erinnerungsTeilnahmen']>(async () => []),
    erinnerungsDienste: vi.fn<KalenderStore['erinnerungsDienste']>(async () => []),
    erinnerungen: vi.fn<KalenderStore['erinnerungen']>(async () => [10080, 2880, 1440]),
    erinnerungenSetzen: vi.fn<KalenderStore['erinnerungenSetzen']>(async () => undefined),
  } satisfies KalenderStore;
  return { fake, dienste, bilder };
}

function makeApp(pingDb = async () => {}, appUrl?: string) {
  const userAdmin = {
    rollen: vi.fn(async () => new Map<string, string[]>()),
    konten: vi.fn(async () => new Map<string, Konto>()),
    getPreferredUsername: vi.fn(async (): Promise<string | undefined> => undefined),
    setPreferredUsername: vi.fn<(username: string, preferred: string) => Promise<void>>(
      async () => {},
    ),
    createUser: vi.fn(async (email: string, groups: string[]): Promise<AdminUser> => ({
      username: 'generated-uuid',
      email,
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
      groups,
    })),
    setGroups: vi.fn(async (_u: string, groups: string[]) => groups),
    setEnabled: vi.fn<(kontoName: string, enabled: boolean) => Promise<void>>(async () => {}),
  };
  const emailAenderung = {
    anfordern: vi.fn<(token: string, email: string) => Promise<void>>(async () => {}),
    bestaetigen: vi.fn<(token: string, code: string) => Promise<void>>(async () => {}),
  };
  const zeilen = new Map<string, MitgliedRow>();
  const verlauf = new Map<string, StatusEintrag[]>();
  let eintragNr = 0;
  /** Mirrors the store: the row status follows the newest entry. */
  const abgleichen = (sub: string) => {
    const row = zeilen.get(sub);
    const aktuell = aktuellerStatus(statusVerlaufSortieren(verlauf.get(sub) ?? []));
    if (row && aktuell) zeilen.set(sub, { ...row, status: aktuell.status });
  };
  const ersterEintrag = (sub: string, status: MitgliedStatus, ab = heuteBerlin()) =>
    verlauf.set(sub, [{ id: `s${++eintragNr}`, status, ab }]);
  const vcardTokens = new Map<string, { sub: string; ablauf: Date }>();
  const mitglieder = {
    vcardTokens,
    vcardTokenErzeugen: vi.fn(async (sub: string) => {
      for (const [h, e] of vcardTokens) if (e.sub === sub) vcardTokens.delete(h);
      const token = `vtok-${vcardTokens.size}-${sub}-${Math.random().toString(36).slice(2)}`;
      const ablauf = new Date(Date.now() + 24 * 3600 * 1000);
      vcardTokens.set(vcardTokenHash(token), { sub, ablauf });
      return { token, ablauf };
    }),
    vcardTokenSuchen: vi.fn(async (hash: string) => vcardTokens.get(hash)),
    holen: vi.fn(async (sub: string) => zeilen.get(sub)),
    alle: vi.fn(async () => [...zeilen.values()]),
    speichern: vi.fn(
      async (sub: string, daten: MitgliedDaten, statusNeu?: MitgliedStatus, ab?: string) => {
        const neu = !zeilen.has(sub);
        zeilen.set(sub, {
          sub,
          ...daten,
          status: zeilen.get(sub)?.status ?? statusNeu ?? 'anwaerter',
          deaktiviertAm: zeilen.get(sub)?.deaktiviertAm ?? null,
          aktualisiertAm: new Date(),
        });
        if (neu) ersterEintrag(sub, zeilen.get(sub)!.status, ab);
      },
    ),
    statusSetzen: vi.fn(async (sub: string, status: MitgliedStatus, ab: string = heuteBerlin()) => {
      if (!zeilen.has(sub)) return false;
      const liste = verlauf.get(sub) ?? [];
      const gleich = liste.find((e) => e.ab === ab);
      if (gleich) gleich.status = status;
      else liste.push({ id: `s${++eintragNr}`, status, ab });
      verlauf.set(sub, liste);
      abgleichen(sub);
      return true;
    }),
    statusVerlauf: vi.fn(async (sub: string) =>
      statusVerlaufSortieren(verlauf.get(sub) ?? []).map((e) => ({ ...e })),
    ),
    statusEintragAnlegen: vi.fn(async (sub: string, daten: StatusEintragEingabe) => {
      if (!zeilen.has(sub)) return undefined;
      const liste = verlauf.get(sub) ?? [];
      if (liste.some((e) => e.ab === daten.ab)) throw new StatusDatumDoppelt();
      const id = `s${++eintragNr}`;
      liste.push({ id, ...daten });
      verlauf.set(sub, liste);
      abgleichen(sub);
      return id;
    }),
    statusEintragAendern: vi.fn(async (sub: string, id: string, daten: StatusEintragEingabe) => {
      const liste = verlauf.get(sub) ?? [];
      const eintrag = liste.find((e) => e.id === id);
      if (!eintrag) return false;
      if (liste.some((e) => e.id !== id && e.ab === daten.ab)) throw new StatusDatumDoppelt();
      Object.assign(eintrag, daten);
      abgleichen(sub);
      return true;
    }),
    statusEintragLoeschen: vi.fn(async (sub: string, id: string) => {
      const liste = verlauf.get(sub) ?? [];
      if (!liste.some((e) => e.id === id)) return false;
      if (liste.length <= 1) throw new LetzterStatusEintrag();
      verlauf.set(
        sub,
        liste.filter((e) => e.id !== id),
      );
      abgleichen(sub);
      return true;
    }),
    deaktiviertSetzen: vi.fn(async (sub: string, deaktiviert: boolean) => {
      const deaktiviertAm = deaktiviert ? new Date() : null;
      const row = zeilen.get(sub);
      if (row) {
        zeilen.set(sub, { ...row, deaktiviertAm });
        return;
      }
      zeilen.set(sub, {
        sub,
        vorname: '',
        nachname: '',
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
        status: 'anwaerter',
        deaktiviertAm,
        aktualisiertAm: new Date(),
      });
      ersterEintrag(sub, 'anwaerter');
    }),
  };
  const postenListe = new Map<string, PostenDetails>();
  const posten = {
    alle: vi.fn(async (mitArchiv: boolean) =>
      [...postenListe.values()].filter((p) => mitArchiv || !p.archiviert),
    ),
    holen: vi.fn(async (id: string) => postenListe.get(id)),
    anlegen: vi.fn(async (daten: PostenDaten) => {
      const id = `p${postenListe.size + 1}`;
      postenListe.set(id, {
        id,
        ...daten,
        archiviert: false,
        aktualisiertAm: new Date(),
        rechte: [],
        besetzungen: [],
      });
      return id;
    }),
    aktualisieren: vi.fn(async (id: string, daten: PostenDaten) => {
      const p = postenListe.get(id);
      if (p) postenListe.set(id, { ...p, ...daten });
      return !!p;
    }),
    archivieren: vi.fn(async (id: string, archiviert: boolean) => {
      const p = postenListe.get(id);
      if (p) postenListe.set(id, { ...p, archiviert });
      return !!p;
    }),
    rechteSetzen: vi.fn(async (id: string, rechte: readonly PostenRecht[]) => {
      const p = postenListe.get(id);
      if (p) postenListe.set(id, { ...p, rechte: [...rechte] });
      return !!p;
    }),
    besetzungAnlegen: vi.fn(
      async (postenId: string, daten: BesetzungDaten, ablosung: readonly string[] = []) => {
        const p = postenListe.get(postenId);
        if (!p) return undefined;
        for (const bid of ablosung) {
          const alt = p.besetzungen.find((b) => b.id === bid && b.endDatum === null);
          if (!alt) throw new AblosungUngueltig();
          alt.endDatum = tagVorher(daten.start);
        }
        const neu = { startDatum: daten.start, endDatum: daten.ende };
        if (
          p.besetzungen.some((b) => b.mitgliedSub === daten.mitgliedSub && ueberschneiden(b, neu))
        ) {
          throw new BesetzungUeberschneidung();
        }
        const id = `b${p.besetzungen.length + 1}`;
        p.besetzungen.push({
          id,
          postenId,
          mitgliedSub: daten.mitgliedSub,
          startDatum: daten.start,
          endDatum: daten.ende,
        });
        return id;
      },
    ),
    besetzungAendern: vi.fn(async () => true),
    besetzungLoeschen: vi.fn(async (postenId: string, id: string) => {
      const p = postenListe.get(postenId);
      const vorher = p?.besetzungen.length ?? 0;
      if (p) p.besetzungen = p.besetzungen.filter((b) => b.id !== id);
      return (p?.besetzungen.length ?? 0) < vorher;
    }),
    besetzungenVon: vi.fn(async (sub: string) =>
      [...postenListe.values()]
        .flatMap((p) =>
          p.besetzungen
            .filter((b) => b.mitgliedSub === sub)
            .map((b) => ({ ...b, postenName: p.name })),
        )
        .sort((a, b) => a.startDatum.localeCompare(b.startDatum)),
    ),
    aktuelleNachMitglied: vi.fn(async () => new Map<string, AktuellerPosten[]>()),
    rechteVon: vi.fn(async (sub: string): Promise<PostenRecht[]> =>
      sub === 'v'
        ? [
            'posten:bearbeiten' as const,
            'waren:verwalten' as const,
            'inventar:verwalten' as const,
            'events:verwalten' as const,
            'kalender:einrichten' as const,
          ]
        : [],
    ),
    inhaberMitRecht: vi.fn(async (): Promise<string[]> => []),
  };
  const { fake: waren, orte, verwendet } = makeWarenFake();
  const { fake: inventar, verwendet: inventarVerwendet } = makeInventarFake();
  const { fake: kalender, dienste: kalenderDienste, bilder: kalenderBilder } = makeKalenderFake();
  const onedrive = createFakeOneDrive();
  const freigaben = createMemoryFreigabenStore();
  const ordnerCache = createMemoryOrdnerCacheStore();
  const anfragenFake = createFakeSchluesselAnfragenStore();
  const schluesselAnfragen = anfragenFake.store;
  const { fake: schluessel } = makeSchluesselFake(anfragenFake.planungVerbrauchen);
  const { store: umfragen, liste: umfragenListe } = createFakeUmfragenStore();
  const { store: trichter } = createFakeTrichterStore();
  const finanzenFake = createFakeFinanzenStore();
  const finanzen = finanzenFake.store;
  const { store: protokolle, liste: protokollListe } = createFakeProtokolleStore();
  const { store: todos, liste: todosListe } = createFakeTodosStore();
  const {
    store: privatpartys,
    personen: privatpartyPersonen,
    liste: privatpartyListe,
    nachrichtenListe: privatpartyNachrichten,
  } = createFakePrivatpartysStore();
  const partymail = createFakePartyMail();
  const profilbilder = {
    uploadVorbereiten: vi.fn(async (sub: string) => ({
      uploadUrl: 'https://s3.example/upload',
      kleinUploadUrl: 'https://s3.example/upload-klein',
      key: `profilbilder/${sub}/neu.png`,
    })),
    anzeigeUrl: vi.fn(async (key: string) => `https://s3.example/${key}`),
    lesen: vi.fn<(key: string) => Promise<Uint8Array>>(async () => new Uint8Array([1, 2, 3])),
    loeschen: vi.fn<(key: string) => Promise<void>>(async () => {}),
  };
  const protokollbilder = {
    uploadVorbereiten: vi.fn(async (protokollId: string, groesse: number) => ({
      uploadUrl: `https://s3.example/upload?size=${groesse}`,
      schluessel: `protokollbilder/${protokollId}/00000000-0000-4000-8000-000000000001.jpg`,
    })),
    anzeigeUrl: vi.fn(async (key: string) => `https://s3.example/${key}`),
    loeschen: vi.fn<(protokollId: string) => Promise<void>>(async () => {}),
  };
  const pushMitglieder: { sub: string; status: MitgliedStatus }[] = ['a', 'r', 'v', 'm2'].map(
    (sub) => ({ sub, status: 'mitglied' }),
  );
  const push = createFakeBenachrichtigungenStore(() => pushMitglieder);
  const pushErgebnis = { wert: 'ok' as PushErgebnis };
  const gesendet: { endpoint: string; titel: string; text: string; url: string }[] = [];
  const benachrichtigungen = createBenachrichtigungen({
    store: push.store,
    sender: async (abo, n) => {
      gesendet.push({ endpoint: abo.endpoint, titel: n.titel, text: n.text, url: n.url });
      return pushErgebnis.wert;
    },
  });
  const app = createApp({
    verifyToken: async (token) => {
      const user = users[token];
      if (!user) throw new Error('bad token');
      return user;
    },
    userAdmin,
    emailAenderung,
    mitglieder,
    posten,
    waren,
    inventar,
    kalender,
    schluessel,
    schluesselAnfragen,
    todos,
    umfragen,
    trichter,
    finanzen,
    protokolle,
    privatpartys,
    partymail: partymail.mail,
    benachrichtigungen,
    onedrive,
    freigaben,
    ordnerCache,
    ...(appUrl && { appUrl }),
    profilbilder,
    protokollbilder,
    pingDb,
  });
  return {
    app,
    userAdmin,
    emailAenderung,
    mitglieder,
    posten,
    profilbilder,
    protokollbilder,
    waren,
    inventar,
    inventarVerwendet,
    kalender,
    kalenderDienste,
    kalenderBilder,
    onedrive,
    freigaben,
    ordnerCache,
    schluessel,
    schluesselAnfragen,
    anfragenFake,
    todos,
    todosListe,
    umfragen,
    umfragenListe,
    trichter,
    finanzenFake,
    protokollListe,
    privatpartys,
    privatpartyPersonen,
    privatpartyListe,
    privatpartyNachrichten,
    partymail: partymail.zustand,
    push,
    pushMitglieder,
    gesendet,
    pushErgebnis,
    orte,
    verwendet,
  };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('api', () => {
  it('health is public and reports db status', async () => {
    const ok = await makeApp().app.request('/api/health');
    expect(await ok.json()).toEqual({ status: 'ok', db: 'ok' });
    const failing = makeApp(async () => {
      throw new Error('down');
    });
    const res = await failing.app.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'ok', db: 'error' });
  });

  it('maps database conflicts to 409 and unknown errors to 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, userAdmin } = makeApp();
    const post = () =>
      app.request('/api/admin/users', {
        method: 'POST',
        headers: { ...bearer('admin-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'x@example.de', groups: ['admin'] }),
      });
    userAdmin.createUser.mockRejectedValueOnce(Object.assign(new Error('x'), { code: '40001' }));
    const konflikt = await post();
    expect(konflikt.status).toBe(409);
    expect(await konflikt.json()).toEqual({
      error: 'Jemand anderes hat gerade dasselbe geändert. Bitte versuch es noch einmal.',
    });
    userAdmin.createUser.mockRejectedValueOnce(
      new Error('Failed query', { cause: Object.assign(new Error('dup'), { code: '23505' }) }),
    );
    const doppelt = await post();
    expect(doppelt.status).toBe(409);
    expect(await doppelt.json()).toEqual({
      error:
        'Das passt nicht mehr zum aktuellen Stand. Bitte lade die Seite neu und versuch es noch einmal.',
    });
    userAdmin.createUser.mockRejectedValueOnce(new Error('boom'));
    expect((await post()).status).toBe(500);
    vi.restoreAllMocks();
  });

  it('rejects missing and invalid tokens', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/me')).status).toBe(401);
    expect((await app.request('/api/me', { headers: bearer('nope') })).status).toBe(401);
  });

  it('returns identity and permissions', async () => {
    const res = await makeApp().app.request('/api/me', { headers: bearer('reader-token') });
    expect(await res.json()).toMatchObject({
      sub: 'r',
      permissions: [
        'content:read',
        'mitglieder:lesen',
        'profil:bearbeiten',
        'posten:lesen',
        'waren:lesen',
        'bestand:buchen',
        'inventar:lesen',
        'inventar:umraeumen',
        'kalender:lesen',
        'schluessel:lesen',
        'umfragen:lesen',
        'trichter:lesen',
        'bilder:lesen',
        'protokolle:lesen',
        'buch:lesen',
        'kasse:zaehlen',
        'belege:einreichen',
      ],
    });
  });

  it('forbids admin routes for readers', async () => {
    const res = await makeApp().app.request('/api/admin/mitglieder/x/rollen', {
      method: 'PUT',
      headers: { ...bearer('reader-token'), 'content-type': 'application/json' },
      body: JSON.stringify({ groups: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('shows roles only to admins and lets them change roles', async () => {
    const { app, userAdmin } = makeApp();
    userAdmin.konten.mockResolvedValue(
      new Map<string, Konto>([
        ['m1', { sub: 'm1', kontoName: 'uuid-1', aktiviert: true, enabled: true }],
      ]),
    );
    userAdmin.rollen.mockResolvedValue(new Map([['m1', ['admin']]]));
    const liste = async (token: string) =>
      (await app.request('/api/mitglieder', { headers: bearer(token) })).json();
    expect(await liste('admin-token')).toMatchObject([{ sub: 'm1', rollen: ['admin'] }]);
    expect((await liste('reader-token'))[0]).not.toHaveProperty('rollen');

    const put = (sub: string, groups: string[]) =>
      app.request(`/api/admin/mitglieder/${sub}/rollen`, {
        method: 'PUT',
        headers: { ...bearer('admin-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
    expect((await put('m1', ['admin'])).status).toBe(200);
    expect(userAdmin.setGroups).toHaveBeenCalledWith('uuid-1', ['admin']);
    expect((await put('unbekannt', [])).status).toBe(404);
    expect((await put('a', [])).status).toBe(400);
  });

  it('lets admins create users and validates input', async () => {
    const { app, userAdmin } = makeApp();
    const post = (body: unknown) =>
      app.request('/api/admin/users', {
        method: 'POST',
        headers: { ...bearer('admin-token'), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await post({ email: 'not-an-email' })).status).toBe(400);
    const ok = await post({ email: 'x@example.de', groups: ['admin'] });
    expect(ok.status).toBe(201);
    expect(userAdmin.createUser).toHaveBeenCalledWith('x@example.de', ['admin']);
  });

  it('lets users choose a username and reports conflicts', async () => {
    const { app, userAdmin } = makeApp();
    const put = (body: unknown) =>
      app.request('/api/me/username', {
        method: 'PUT',
        headers: { ...bearer('reader-token'), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await put({ username: 'a@b.de' })).status).toBe(400);
    expect((await put({ username: '123e4567-e89b-12d3-a456-426614174000' })).status).toBe(400);
    expect((await put({ username: 'ab' })).status).toBe(400);
    expect((await put({ username: 'reader_one' })).status).toBe(200);
    expect(userAdmin.setPreferredUsername).toHaveBeenCalledWith('r', 'reader_one');
    userAdmin.setPreferredUsername.mockRejectedValueOnce(new UsernameTakenError('taken'));
    expect((await put({ username: 'taken' })).status).toBe(409);
  });

  it('exposes the chosen username on /me', async () => {
    const { app, userAdmin } = makeApp();
    userAdmin.getPreferredUsername.mockResolvedValueOnce('reader_one');
    const res = await app.request('/api/me', { headers: bearer('reader-token') });
    expect(await res.json()).toMatchObject({ preferredUsername: 'reader_one' });
  });

  describe('mitglieder', () => {
    const json = (token: string, method: string, body?: unknown) => ({
      method,
      headers: { ...bearer(token), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const gueltig = { vorname: 'Erika', nachname: 'Muster' };

    it('requires authentication', async () => {
      const { app } = makeApp();
      expect((await app.request('/api/mitglieder')).status).toBe(401);
      expect((await app.request('/api/me/mitglied')).status).toBe(401);
    });

    it('returns 404 until the member saved a profile', async () => {
      const res = await makeApp().app.request('/api/me/mitglied', json('reader-token', 'GET'));
      expect(res.status).toBe(404);
    });

    it('validates required names and trims optional fields', async () => {
      const { app, mitglieder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      expect((await put({ vorname: '', nachname: 'Muster' })).status).toBe(400);
      expect((await put({ vorname: 'Erika' })).status).toBe(400);
      expect((await put({ ...gueltig, anrede: 'x' })).status).toBe(400);
      expect((await put({ ...gueltig, kontaktkanaele: ['fax'] })).status).toBe(400);
      const ok = await put({
        ...gueltig,
        anrede: 'weiblich',
        kontaktkanaele: ['mail', 'discord'],
        discordName: ' erika#1 ',
        telefon: '  ',
        ueberMich: 'Hallo',
      });
      expect(ok.status).toBe(200);
      expect(mitglieder.speichern).toHaveBeenCalledWith('r', {
        ...gueltig,
        anrede: 'weiblich',
        kontaktkanaele: 'discord,mail',
        discordName: 'erika#1',
        adresse: null,
        telefon: null,
        ueberMich: 'Hallo',
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: true,
        wohnheim: false,
      });
    });

    it('requires a readable phone number when WhatsApp, Signal or Telegram is chosen', async () => {
      const { app, mitglieder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      expect((await put({ ...gueltig, kontaktkanaele: ['whatsapp'] })).status).toBe(400);
      expect(
        (await put({ ...gueltig, kontaktkanaele: ['telegram'], telefon: '1234' })).status,
      ).toBe(400);
      expect(mitglieder.speichern).not.toHaveBeenCalled();
      expect(
        (await put({ ...gueltig, kontaktkanaele: ['whatsapp'], telefon: '0171 1234567' })).status,
      ).toBe(200);
    });

    it('saves and returns the birthday fields and validates the date', async () => {
      const { app, mitglieder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      expect((await put({ ...gueltig, geburtsdatum: '1990-02-30' })).status).toBe(400);
      expect((await put({ ...gueltig, geburtsdatum: '1899-12-31' })).status).toBe(400);
      expect((await put({ ...gueltig, geburtsdatum: '2999-01-01' })).status).toBe(400);
      expect((await put({ ...gueltig, geburtsdatum: '17.05.1990' })).status).toBe(400);
      const res = await put({
        ...gueltig,
        geburtsdatum: '1990-05-17',
        geburtstagImKalender: false,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        geburtsdatum: '1990-05-17',
        geburtstagImKalender: false,
      });
      expect(mitglieder.speichern).toHaveBeenCalledWith(
        'r',
        expect.objectContaining({ geburtsdatum: '1990-05-17', geburtstagImKalender: false }),
      );
      // The own profile always shows the date, even when it is hidden from others.
      const eigenes = await app.request('/api/me/mitglied', json('reader-token', 'GET'));
      expect(await eigenes.json()).toMatchObject({ geburtsdatum: '1990-05-17' });
    });

    it("shows other members' birthday only when they show it in the calendar", async () => {
      const { app, mitglieder } = makeApp();
      const basis = {
        vorname: 'V',
        nachname: 'N',
        anrede: null,
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
      };
      await mitglieder.speichern('m1', {
        ...basis,
        geburtsdatum: '1990-05-17',
        geburtstagImKalender: null,
        wohnheim: null,
      });
      await mitglieder.speichern('m3', {
        ...basis,
        geburtsdatum: '1991-06-18',
        geburtstagImKalender: false,
        wohnheim: null,
      });
      await mitglieder.speichern('r', {
        ...basis,
        geburtsdatum: '1992-07-19',
        geburtstagImKalender: false,
        wohnheim: null,
      });
      const liste = (await (
        await app.request('/api/mitglieder', json('reader-token', 'GET'))
      ).json()) as { sub: string; geburtsdatum: string | null; geburtstagImKalender: boolean }[];
      const nach = (sub: string) => liste.find((m) => m.sub === sub);
      expect(nach('m1')).toMatchObject({ geburtsdatum: '1990-05-17', geburtstagImKalender: true });
      expect(nach('m3')).toMatchObject({ geburtsdatum: '1991-06-18', geburtstagImKalender: false });
      expect(nach('r')).toMatchObject({ geburtsdatum: '1992-07-19' });
      const einzeln = await app.request('/api/mitglieder/m3', json('reader-token', 'GET'));
      expect(await einzeln.json()).toMatchObject({ geburtsdatum: '1991-06-18' });
    });

    it("only saves to the caller's own row and rejects foreign picture keys", async () => {
      const { app, mitglieder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      expect((await put({ ...gueltig, profilbildKey: 'profilbilder/a/x.png' })).status).toBe(400);
      expect((await put({ ...gueltig, profilbildKey: 'profilbilder/r/x.png' })).status).toBe(200);
      expect(mitglieder.speichern).toHaveBeenCalledTimes(1);
      expect(mitglieder.speichern.mock.calls[0]?.[0]).toBe('r');
    });

    it('deletes the previous picture when it is replaced', async () => {
      const { app, profilbilder } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/mitglied', json('reader-token', 'PUT', body));
      await put({ ...gueltig, profilbildKey: 'profilbilder/r/alt.png' });
      await put({ ...gueltig, profilbildKey: 'profilbilder/r/neu.png' });
      expect(profilbilder.loeschen).toHaveBeenCalledWith('profilbilder/r/alt.png');
    });

    it('issues upload URLs only for allowed types and sizes', async () => {
      const { app, profilbilder } = makeApp();
      const post = (body: unknown) =>
        app.request('/api/me/profilbild', json('reader-token', 'POST', body));
      expect(
        (await post({ contentType: 'image/gif', groesse: 100, kleinGroesse: 10 })).status,
      ).toBe(400);
      expect(
        (await post({ contentType: 'image/png', groesse: 21 * 1024 * 1024, kleinGroesse: 10 }))
          .status,
      ).toBe(400);
      expect((await post({ contentType: 'image/png', groesse: 1000 })).status).toBe(400);
      const ok = await post({ contentType: 'image/png', groesse: 1000, kleinGroesse: 200 });
      expect(ok.status).toBe(200);
      expect(profilbilder.uploadVorbereiten).toHaveBeenCalledWith('r', {
        contentType: 'image/png',
        groesse: 1000,
        kleinGroesse: 200,
      });
    });

    it('lists all members with picture URLs', async () => {
      const { app } = makeApp();
      await app.request(
        '/api/me/mitglied',
        json('reader-token', 'PUT', { ...gueltig, profilbildKey: 'profilbilder/r/a.png' }),
      );
      const res = await app.request('/api/mitglieder', json('admin-token', 'GET'));
      expect(await res.json()).toMatchObject([
        {
          sub: 'r',
          vorname: 'Erika',
          profilbildUrl: 'https://s3.example/profilbilder/r/a-klein.jpg',
          profilbildGrossUrl: 'https://s3.example/profilbilder/r/a.png',
        },
      ]);
    });

    it('merges Cognito accounts into the list, including users that are not activated', async () => {
      const { app, userAdmin } = makeApp();
      await app.request('/api/me/mitglied', json('reader-token', 'PUT', gueltig));
      userAdmin.konten.mockResolvedValue(
        new Map<string, Konto>([
          [
            'r',
            {
              sub: 'r',
              kontoName: 'ur',
              username: 'erika_m',
              email: 'e@example.de',
              aktiviert: true,
              enabled: true,
            },
          ],
          [
            'n',
            { sub: 'n', kontoName: 'un', email: 'neu@example.de', aktiviert: false, enabled: true },
          ],
          [
            'x',
            { sub: 'x', kontoName: 'ux', email: 'aus@example.de', aktiviert: true, enabled: false },
          ],
        ]),
      );
      const res = await app.request('/api/mitglieder', json('admin-token', 'GET'));
      expect(await res.json()).toMatchObject([
        { sub: 'r', username: 'erika_m', email: 'e@example.de', aktiviert: true },
        { sub: 'n', username: null, email: 'neu@example.de', aktiviert: false, vorname: '' },
      ]);
      const detail = await app.request('/api/mitglieder/n', json('admin-token', 'GET'));
      expect(detail.status).toBe(200);
      const nachName = await app.request('/api/mitglieder/Erika_M', json('admin-token', 'GET'));
      expect(await nachName.json()).toMatchObject({ sub: 'r', username: 'erika_m' });
      expect((await app.request('/api/mitglieder/x', json('admin-token', 'GET'))).status).toBe(404);
    });

    it('requests an email change with the caller token and maps errors', async () => {
      const { app, emailAenderung } = makeApp();
      const put = (body: unknown) =>
        app.request('/api/me/email', json('reader-token', 'PUT', body));
      expect((await put({ email: 'kein-mail' })).status).toBe(400);
      expect((await put({ email: ' Neu@Example.DE ' })).status).toBe(200);
      expect(emailAenderung.anfordern).toHaveBeenCalledWith('reader-token', 'neu@example.de');
      emailAenderung.anfordern.mockRejectedValueOnce(new EmailVergeben());
      expect((await put({ email: 'x@example.de' })).status).toBe(409);
      emailAenderung.anfordern.mockRejectedValueOnce(new NeuAnmeldungNoetig());
      expect((await put({ email: 'y@example.de' })).status).toBe(403);
      expect((await app.request('/api/me/email', json('', 'PUT', {}))).status).toBe(401);
    });

    it('confirms an email change with the code', async () => {
      const { app, emailAenderung } = makeApp();
      const post = (body: unknown) =>
        app.request('/api/me/email/bestaetigen', json('reader-token', 'POST', body));
      expect((await post({ code: '' })).status).toBe(400);
      expect((await post({ code: ' 123456 ' })).status).toBe(200);
      expect(emailAenderung.bestaetigen).toHaveBeenCalledWith('reader-token', '123456');
      emailAenderung.bestaetigen.mockRejectedValueOnce(new CodeUngueltig());
      expect((await post({ code: '000000' })).status).toBe(400);
    });

    it('lets only admins change the status, and never through the profile', async () => {
      const { app } = makeApp();
      await app.request('/api/me/mitglied', json('reader-token', 'PUT', gueltig));
      const setze = (token: string, sub: string, status: string) =>
        app.request(`/api/admin/mitglieder/${sub}/status`, json(token, 'PUT', { status }));
      expect((await setze('reader-token', 'r', 'em')).status).toBe(403);
      expect((await setze('admin-token', 'r', 'quatsch')).status).toBe(400);
      expect((await setze('admin-token', 'unbekannt', 'em')).status).toBe(404);
      expect((await setze('admin-token', 'r', 'mitglied')).status).toBe(200);
      const liste = await app.request('/api/mitglieder', json('admin-token', 'GET'));
      expect(await liste.json()).toMatchObject([{ sub: 'r', status: 'mitglied' }]);
      // a profile save by the member keeps the status, even when they send one
      await app.request(
        '/api/me/mitglied',
        json('reader-token', 'PUT', { ...gueltig, status: 'em' }),
      );
      const danach = await app.request('/api/me/mitglied', json('reader-token', 'GET'));
      expect(await danach.json()).toMatchObject({ status: 'mitglied' });
    });

    it('creates the member row right away when an admin invites', async () => {
      const { app, userAdmin, mitglieder } = makeApp();
      const einladen = (body: unknown, sub: string) => {
        userAdmin.createUser.mockResolvedValueOnce({
          username: 'u',
          email: 'x@example.de',
          sub,
          status: 'FORCE_CHANGE_PASSWORD',
          enabled: true,
          groups: [],
        });
        return app.request('/api/admin/users', json('admin-token', 'POST', body));
      };
      const mit = await einladen(
        { email: 'x@example.de', vorname: 'Max', nachname: 'Mustermann', status: 'em' },
        'sub-1',
      );
      expect(mit.status).toBe(201);
      expect(mitglieder.speichern).toHaveBeenLastCalledWith(
        'sub-1',
        expect.objectContaining({ vorname: 'Max', nachname: 'Mustermann' }),
        'em',
      );
      // without names: still a row, empty names, status defaults to Anwaerter
      const ohne = await einladen({ email: 'y@example.de' }, 'sub-2');
      expect(await ohne.json()).toMatchObject({ vorname: '', nachname: '', status: 'anwaerter' });
      expect(mitglieder.speichern).toHaveBeenLastCalledWith(
        'sub-2',
        expect.objectContaining({ vorname: '', nachname: '' }),
        'anwaerter',
      );
      expect((await einladen({ email: 'z@example.de', status: 'quatsch' }, 'sub-3')).status).toBe(
        400,
      );
    });
  });
});

describe('posten', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  it('lets every member read but only holders of posten:bearbeiten write', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/posten', { headers: bearer('reader-token') })).status).toBe(
      200,
    );
    const neu = { name: 'Kassenwart' };
    expect((await app.request('/api/posten', json('reader-token', 'POST', neu))).status).toBe(403);
    expect((await app.request('/api/posten', json('vorstand-token', 'POST', neu))).status).toBe(
      201,
    );
  });

  it('hides archived Posten from readers and lists them for editors on request', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/posten', json('vorstand-token', 'POST', { name: 'Alt' }));
    const { id } = (await res.json()) as { id: string };
    await app.request(
      `/api/posten/${id}/archiv`,
      json('vorstand-token', 'PUT', { archiviert: true }),
    );

    const liste = async (token: string, query = '') =>
      (await app.request(`/api/posten${query}`, { headers: bearer(token) })).json();
    expect(await liste('reader-token')).toEqual([]);
    expect(await liste('vorstand-token')).toEqual([]);
    expect(await liste('vorstand-token', '?archiv=1')).toHaveLength(1);
    expect(
      (await app.request('/api/posten?archiv=1', { headers: bearer('reader-token') })).status,
    ).toBe(403);
    expect(
      (await app.request(`/api/posten/${id}`, { headers: bearer('reader-token') })).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/posten/${id}`, { headers: bearer('vorstand-token') })).status,
    ).toBe(200);
  });

  it('only assigns members that have a profile row', async () => {
    const { app, mitglieder } = makeApp();
    const res = await app.request('/api/posten', json('vorstand-token', 'POST', { name: 'Kasse' }));
    const { id } = (await res.json()) as { id: string };
    const besetzung = { mitgliedSub: 'm1', start: '2026-01-01' };
    const post = () =>
      app.request(`/api/posten/${id}/besetzungen`, json('vorstand-token', 'POST', besetzung));
    expect((await post()).status).toBe(400);
    await mitglieder.speichern('m1', {
      vorname: 'A',
      nachname: 'B',
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
    });
    expect((await post()).status).toBe(201);
    const bad = { mitgliedSub: 'm1', start: '2026-02-01', ende: '2026-01-01' };
    expect(
      (await app.request(`/api/posten/${id}/besetzungen`, json('vorstand-token', 'POST', bad)))
        .status,
    ).toBe(400);
  });

  it('lets only admins attach rights to a Posten', async () => {
    const { app } = makeApp();
    const res = await app.request(
      '/api/posten',
      json('vorstand-token', 'POST', { name: 'Vorstand' }),
    );
    const { id } = (await res.json()) as { id: string };
    const rechte = { rechte: ['posten:bearbeiten'] };
    const put = (token: string) =>
      app.request(`/api/admin/posten/${id}/rechte`, json(token, 'PUT', rechte));
    expect((await put('vorstand-token')).status).toBe(403);
    expect((await put('admin-token')).status).toBe(200);
  });

  describe('Besetzung rules', () => {
    const profil = {
      vorname: 'A',
      nachname: 'B',
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
    };
    const aufbau = async (rechte: PostenRecht[]) => {
      const t = makeApp();
      await t.mitglieder.speichern('m1', profil);
      const res = await t.app.request(
        '/api/posten',
        json('vorstand-token', 'POST', { name: 'Mit Rechten' }),
      );
      const { id } = (await res.json()) as { id: string };
      await t.posten.rechteSetzen(id, rechte);
      return { ...t, id };
    };
    const besetzung = { mitgliedSub: 'm1', start: '2026-01-01' };

    it('refuses to staff a Posten that grants rights the editor lacks', async () => {
      const t = await aufbau(['users:manage']);
      const url = `/api/posten/${t.id}/besetzungen`;
      const neu = await t.app.request(url, json('vorstand-token', 'POST', besetzung));
      expect(neu.status).toBe(403);
      expect(await neu.json()).toEqual({
        error:
          'Diesen Posten kannst du nicht besetzen: Er gewährt Rechte, die du selbst nicht hast.',
      });
      const aendern = await t.app.request(
        `${url}/b1`,
        json('vorstand-token', 'PUT', { ...besetzung, ende: '2026-02-01' }),
      );
      expect(aendern.status).toBe(403);
      await t.app.request(
        `/api/posten/${t.id}/archiv`,
        json('admin-token', 'PUT', { archiviert: true }),
      );
      const aktivieren = await t.app.request(
        `/api/posten/${t.id}/archiv`,
        json('vorstand-token', 'PUT', { archiviert: false }),
      );
      expect(aktivieren.status).toBe(403);
      // Archiving stays possible.
      expect(
        (
          await t.app.request(
            `/api/posten/${t.id}/archiv`,
            json('vorstand-token', 'PUT', { archiviert: true }),
          )
        ).status,
      ).toBe(200);
      // Admins hold every right.
      expect((await t.app.request(url, json('admin-token', 'POST', besetzung))).status).toBe(201);
      expect(
        (
          await t.app.request(
            `/api/posten/${t.id}/archiv`,
            json('admin-token', 'PUT', { archiviert: false }),
          )
        ).status,
      ).toBe(200);
    });

    it('allows staffing a Posten without rights or with only rights the editor holds', async () => {
      for (const rechte of [[], ['waren:verwalten' as const]]) {
        const t = await aufbau(rechte);
        const url = `/api/posten/${t.id}/besetzungen`;
        expect((await t.app.request(url, json('vorstand-token', 'POST', besetzung))).status).toBe(
          201,
        );
        expect(
          (await t.app.request(`${url}/b1`, json('vorstand-token', 'PUT', besetzung))).status,
        ).toBe(200);
      }
    });

    it('lets an admin end the Besetzung of a deactivated member but not name one', async () => {
      const t = await aufbau([]);
      await t.mitglieder.speichern('m3', profil);
      await t.posten.besetzungAnlegen(t.id, { mitgliedSub: 'm1', start: '2026-01-01', ende: null });
      await t.mitglieder.deaktiviertSetzen('m1', true);
      await t.mitglieder.deaktiviertSetzen('m3', true);
      const put = (mitgliedSub: string) =>
        t.app.request(
          `/api/posten/${t.id}/besetzungen/b1`,
          json('admin-token', 'PUT', { mitgliedSub, start: '2026-01-01', ende: '2026-03-01' }),
        );
      expect((await put('m1')).status).toBe(200);
      expect((await put('m3')).status).toBe(400);
    });
  });

  it('adds the permissions of held Posten to /api/me', async () => {
    const res = await makeApp().app.request('/api/me', { headers: bearer('vorstand-token') });
    expect(((await res.json()) as { permissions: string[] }).permissions).toContain(
      'posten:bearbeiten',
    );
  });

  it('titles the holder in the list by their form of address', async () => {
    const { app, mitglieder, posten, userAdmin } = makeApp();
    for (const [sub, anrede] of [
      ['w1', 'weiblich'],
      ['m1', 'maennlich'],
    ] as const) {
      await mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede,
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
    }
    userAdmin.konten.mockResolvedValue(new Map());
    const chef = {
      id: 'p1',
      name: 'Vorstandsvorsitz',
      bezeichnungMaennlich: 'Chef',
      bezeichnungWeiblich: 'Chefin',
      bezeichnungNeutral: 'Chef:in',
    };
    posten.aktuelleNachMitglied.mockResolvedValue(
      new Map([
        ['w1', [chef]],
        ['m1', [chef]],
      ]),
    );
    const liste = (await (
      await app.request('/api/mitglieder', { headers: bearer('reader-token') })
    ).json()) as { sub: string; posten: { bezeichnung: string }[] }[];
    expect(liste.find((m) => m.sub === 'w1')?.posten[0]?.bezeichnung).toBe('Chefin');
    expect(liste.find((m) => m.sub === 'm1')?.posten[0]?.bezeichnung).toBe('Chef');
  });

  it('ends taken-over Besetzungen the day before the new start', async () => {
    const { app, mitglieder, posten } = makeApp();
    const leer = {
      vorname: 'A',
      nachname: 'B',
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
    };
    await mitglieder.speichern('m1', leer);
    await mitglieder.speichern('m2', leer);
    const res = await app.request('/api/posten', json('vorstand-token', 'POST', { name: 'Kasse' }));
    const { id } = (await res.json()) as { id: string };
    const alt = await posten.besetzungAnlegen(id, {
      mitgliedSub: 'm1',
      start: '2025-01-01',
      ende: null,
    });
    const neu = (ablosung: string[]) =>
      app.request(
        `/api/posten/${id}/besetzungen`,
        json('vorstand-token', 'POST', { mitgliedSub: 'm2', start: '2026-03-01', ablosung }),
      );
    expect((await neu(['gibt-es-nicht'])).status).toBe(400);
    expect((await neu([alt!])).status).toBe(201);
    expect((await posten.holen(id))?.besetzungen.find((b) => b.id === alt)?.endDatum).toBe(
      '2026-02-28',
    );
  });

  it('rejects overlapping Besetzungen of one member, but allows disjoint ones', async () => {
    const { app, mitglieder } = makeApp();
    await mitglieder.speichern('m1', {
      vorname: 'A',
      nachname: 'B',
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
    });
    const res = await app.request('/api/posten', json('vorstand-token', 'POST', { name: 'Kasse' }));
    const { id } = (await res.json()) as { id: string };
    const post = (start: string, ende: string | null) =>
      app.request(
        `/api/posten/${id}/besetzungen`,
        json('vorstand-token', 'POST', { mitgliedSub: 'm1', start, ende }),
      );
    expect((await post('2020-01-01', '2020-12-31')).status).toBe(201);
    expect((await post('2024-01-01', '2025-12-31')).status).toBe(201);
    expect((await post('2020-12-31', '2021-06-30')).status).toBe(409);
    expect((await post('2025-06-01', null)).status).toBe(409);
  });
  describe('waren', () => {
    const json = (token: string, method: string, body?: unknown) => ({
      method,
      headers: { ...bearer(token), 'content-type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const zeitpunkt = '2026-05-01T10:00:00.000Z';

    it('lets everyone read and book, but only Waren-Verwalter change master data', async () => {
      const { app, waren } = makeApp();
      expect((await app.request('/api/lagerorte', json('reader-token', 'GET'))).status).toBe(200);
      for (const [url, method] of [
        ['/api/lagerorte', 'POST'],
        ['/api/lagerorte/l1/boeden', 'POST'],
        ['/api/lagerorte/l1', 'PUT'],
        ['/api/lagerorte/l1', 'DELETE'],
        ['/api/lagerorte/l1/archiv', 'PUT'],
        ['/api/lagerorte/root/reihenfolge', 'PUT'],
        ['/api/lagerorte/l1/waren', 'PUT'],
        ['/api/warengruppen', 'POST'],
        ['/api/gebinde', 'POST'],
        ['/api/waren', 'POST'],
        ['/api/waren/w1', 'DELETE'],
        ['/api/waren/w1/archiv', 'PUT'],
      ] as const) {
        const res = await app.request(
          url,
          json('reader-token', method, method === 'PUT' || method === 'POST' ? {} : undefined),
        );
        expect(res.status, `${method} ${url}`).toBe(403);
      }
      expect(waren.lagerortAnlegen).not.toHaveBeenCalled();

      const einlagerung = {
        wareId: 'w1',
        lagerortId: 'l1',
        gebindeId: 'gb1',
        anzahl: 3,
        mhd: '2027-01-15',
        zeitpunkt,
      };
      const res = await app.request(
        '/api/bestand/einlagerung',
        json('reader-token', 'POST', einlagerung),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 'v1' });
      expect(waren.einlagern).toHaveBeenCalledWith(
        expect.objectContaining({ anzahl: 3, mhd: '2027-01-15', kommentar: null }),
        'r',
      );
    });

    it('manages Lagerorte: create, update, cycle, 404, conflict on delete, archive, order', async () => {
      const { app, verwendet, waren, orte } = makeApp();
      const post = async (body: unknown) =>
        app.request('/api/lagerorte', json('admin-token', 'POST', body));
      expect((await post({ name: '  ' })).status).toBe(400);
      const lager = (await (await post({ name: 'Lager' })).json()) as { id: string };
      const regal = (await (await post({ name: 'Regal', parentId: lager.id })).json()) as {
        id: string;
      };
      expect(regal.id).toBe('l2');
      expect(orte.get('l2')?.art).toBeNull();

      const put = (id: string, body: unknown) =>
        app.request(`/api/lagerorte/${id}`, json('vorstand-token', 'PUT', body));
      expect((await put(lager.id, { name: 'Lager', parentId: regal.id })).status).toBe(400);
      expect((await put(lager.id, { name: 'Lager', parentId: lager.id })).status).toBe(400);
      expect((await put('x', { name: 'X' })).status).toBe(404);
      expect((await put(regal.id, { name: 'Regal 2', parentId: lager.id })).status).toBe(200);

      verwendet.add(regal.id);
      const del = await app.request(`/api/lagerorte/${regal.id}`, json('admin-token', 'DELETE'));
      expect(del.status).toBe(409);
      expect((await del.json()) as { error: string }).toEqual({
        error: 'Der Lagerort wird noch verwendet, archiviere ihn stattdessen.',
      });
      const archiv = (id: string, archiviert: boolean) =>
        app.request(`/api/lagerorte/${id}/archiv`, json('admin-token', 'PUT', { archiviert }));
      expect((await archiv(regal.id, true)).status).toBe(409);
      verwendet.delete(regal.id);
      expect((await archiv(regal.id, true)).status).toBe(200);
      expect((await archiv('x', true)).status).toBe(404);

      const liste = async (query = '') =>
        (await (
          await app.request(`/api/lagerorte${query}`, json('reader-token', 'GET'))
        ).json()) as unknown[];
      expect(await liste()).toHaveLength(1);
      expect(await liste('?archiv=1')).toHaveLength(2);

      const reihenfolge = await app.request(
        '/api/lagerorte/root/reihenfolge',
        json('admin-token', 'PUT', { ids: [lager.id] }),
      );
      expect(reihenfolge.status).toBe(200);
      expect(waren.lagerortReihenfolge).toHaveBeenCalledWith(null, [lager.id]);
      expect(
        (
          await app.request(
            '/api/lagerorte/root/reihenfolge',
            json('admin-token', 'PUT', { ids: ['a', 'a'] }),
          )
        ).status,
      ).toBe(400);

      expect(
        (await app.request('/api/lagerorte/x/waren', json('reader-token', 'GET'))).status,
      ).toBe(404);
      const ware = await app.request(
        `/api/lagerorte/${lager.id}/waren`,
        json('admin-token', 'PUT', { wareIds: ['w1', 'w2'] }),
      );
      expect(ware.status).toBe(200);
      expect(waren.lagerortWarenSetzen).toHaveBeenCalledWith(lager.id, ['w1', 'w2']);
    });

    it('creates a Regal with its Regalböden in one request', async () => {
      const { app, waren, orte } = makeApp();
      const post = (url: string, body: unknown, token = 'admin-token') =>
        app.request(url, json(token, 'POST', body));
      const lager = (await (await post('/api/lagerorte', { name: 'Lager' })).json()) as {
        id: string;
      };
      const res = await post('/api/lagerorte', {
        name: 'Regal A',
        parentId: lager.id,
        art: 'regal',
        boeden: [' Boden 1 ', 'Boden 2'],
      });
      expect(res.status).toBe(201);
      const angelegt = (await res.json()) as { id: string; boedenIds: string[] };
      expect(angelegt.boedenIds).toHaveLength(2);
      expect(waren.lagerortAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'Regal A', art: 'regal' }),
        ['Boden 1', 'Boden 2'],
        null,
      );
      expect(angelegt.boedenIds.map((id) => orte.get(id))).toEqual([
        expect.objectContaining({ name: 'Boden 1', art: 'regalboden', parentId: angelegt.id }),
        expect.objectContaining({ name: 'Boden 2', art: 'regalboden', parentId: angelegt.id }),
      ]);

      const regal = { name: 'R', art: 'regal' };
      for (const body of [
        regal, // no Böden
        { ...regal, boeden: [] },
        { ...regal, boeden: ['a', 'a'] },
        { ...regal, boeden: ['a', '  '] },
        { ...regal, boeden: Array.from({ length: 51 }, (_, i) => `B${i}`) },
        { name: 'Normal', boeden: ['a'] }, // Böden only come with a Regal
        { name: 'R', art: 'sonstiges' },
        { ...regal, parentId: angelegt.id, boeden: ['a'] }, // Regal inside a Regal
        { name: 'X', parentId: angelegt.id }, // normal below a Regal
        { name: 'B', art: 'regalboden' }, // Regalboden without a Regal
      ]) {
        expect((await post('/api/lagerorte', body)).status, JSON.stringify(body)).toBe(400);
      }
      expect(
        (await post('/api/lagerorte', { ...regal, boeden: ['a'] }, 'reader-token')).status,
      ).toBe(403);
      expect((await post('/api/lagerorte', { ...regal, boeden: ['a'] })).status).toBe(201);
    });

    it('appends Regalböden to a Regal', async () => {
      const { app, waren } = makeApp();
      const post = (url: string, body: unknown, token = 'admin-token') =>
        app.request(url, json(token, 'POST', body));
      const regal = (await (
        await post('/api/lagerorte', { name: 'Regal', art: 'regal', boeden: ['Boden 1'] })
      ).json()) as { id: string };
      const lager = (await (await post('/api/lagerorte', { name: 'Lager' })).json()) as {
        id: string;
      };
      const res = await post(`/api/lagerorte/${regal.id}/boeden`, {
        namen: ['Boden 2', 'Boden 3'],
      });
      expect(res.status).toBe(201);
      expect(((await res.json()) as { boedenIds: string[] }).boedenIds).toHaveLength(2);
      expect(waren.boedenHinzufuegen).toHaveBeenCalledWith(regal.id, ['Boden 2', 'Boden 3'], null);
      expect((await post(`/api/lagerorte/${lager.id}/boeden`, { namen: ['x'] })).status).toBe(400);
      // names already used in the Regal (case-insensitive) are rejected
      expect((await post(`/api/lagerorte/${regal.id}/boeden`, { namen: ['boden 1'] })).status).toBe(
        400,
      );
      expect((await post(`/api/lagerorte/${regal.id}/boeden`, { namen: ['A', 'a'] })).status).toBe(
        400,
      );
      expect((await post('/api/lagerorte/x/boeden', { namen: ['x'] })).status).toBe(404);
      expect((await post(`/api/lagerorte/${regal.id}/boeden`, { namen: [] })).status).toBe(400);
      expect((await post(`/api/lagerorte/${regal.id}/boeden`, { namen: ['a', 'a'] })).status).toBe(
        400,
      );
      expect(
        (await post(`/api/lagerorte/${regal.id}/boeden`, { namen: ['x'] }, 'reader-token')).status,
      ).toBe(403);
    });

    it('keeps the Regal rules when the kind changes or a Lagerort moves', async () => {
      const { app, orte } = makeApp();
      const post = async (body: unknown) =>
        (await (await app.request('/api/lagerorte', json('admin-token', 'POST', body))).json()) as {
          id: string;
          boedenIds: string[];
        };
      const put = (id: string, body: unknown) =>
        app.request(`/api/lagerorte/${id}`, json('admin-token', 'PUT', body));
      const lager = await post({ name: 'Lager' });
      const tief = await post({ name: 'Tief', parentId: lager.id });
      await post({ name: 'Enkel', parentId: tief.id });
      const flach = await post({ name: 'Flach', parentId: lager.id });
      const blatt = await post({ name: 'Blatt', parentId: flach.id });

      // children with children of their own: no Regal
      expect((await put(lager.id, { name: 'Lager', art: 'regal' })).status).toBe(400);
      // otherwise the children become Regalböden
      expect(
        (await put(flach.id, { name: 'Flach', parentId: lager.id, art: 'regal' })).status,
      ).toBe(200);
      expect(orte.get(flach.id)?.art).toBe('regal');
      expect(orte.get(blatt.id)?.art).toBe('regalboden');
      // omitted art keeps the kind
      expect((await put(flach.id, { name: 'Flach 2', parentId: lager.id })).status).toBe(200);
      expect(orte.get(flach.id)?.art).toBe('regal');
      // a Regalboden keeps its kind and stays below a Regal
      expect((await put(blatt.id, { name: 'Blatt', parentId: flach.id, art: null })).status).toBe(
        400,
      );
      expect((await put(blatt.id, { name: 'Blatt', parentId: lager.id })).status).toBe(400);
      // no Regal below a Regal, no normal Lagerort below a Regal
      expect((await put(flach.id, { name: 'Flach', parentId: flach.id })).status).toBe(400);
      expect((await put(tief.id, { name: 'Tief', parentId: flach.id })).status).toBe(400);
      // back to a normal Lagerort: the Böden become normal
      expect((await put(flach.id, { name: 'Flach', parentId: lager.id, art: null })).status).toBe(
        200,
      );
      expect(orte.get(blatt.id)?.art).toBeNull();
    });

    it('validates and passes the IFCO-Lagerplatz dimensions', async () => {
      const { app, waren } = makeApp();
      const send = (url: string, method: string, body: unknown) =>
        app.request(url, json('admin-token', method, body));
      const platz = { hoeheCm: 20, stellflaechen: 1.5 };
      expect(
        (await send('/api/lagerorte', 'POST', { name: 'HR11', ifcoPlatz: platz })).status,
      ).toBe(201);
      expect(waren.lagerortAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'HR11', ifcoPlatz: platz }),
        undefined,
        null,
      );
      const regal = { name: 'Regal', art: 'regal', boeden: ['Boden 1'], boedenIfcoPlatz: platz };
      expect((await send('/api/lagerorte', 'POST', regal)).status).toBe(201);
      expect(waren.lagerortAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'Regal' }),
        ['Boden 1'],
        platz,
      );
      for (const ungueltig of [
        { hoeheCm: 0, stellflaechen: 1 },
        { hoeheCm: 20, stellflaechen: 0 },
        { hoeheCm: 20, stellflaechen: 0.25 },
        { hoeheCm: 20 },
      ]) {
        expect(
          (await send('/api/lagerorte', 'POST', { name: 'X', ifcoPlatz: ungueltig })).status,
        ).toBe(400);
      }
      // Update: undefined keeps, null unmarks.
      const angelegt = (await (await send('/api/lagerorte', 'POST', { name: 'Platz' })).json()) as {
        id: string;
      };
      expect(
        (await send(`/api/lagerorte/${angelegt.id}`, 'PUT', { name: 'Platz', ifcoPlatz: platz }))
          .status,
      ).toBe(200);
      expect(waren.lagerortAktualisieren).toHaveBeenLastCalledWith(
        angelegt.id,
        expect.objectContaining({ ifcoPlatz: platz }),
      );
      await send(`/api/lagerorte/${angelegt.id}`, 'PUT', { name: 'Platz', ifcoPlatz: null });
      expect(waren.lagerortAktualisieren).toHaveBeenLastCalledWith(
        angelegt.id,
        expect.objectContaining({ ifcoPlatz: null }),
      );
      await send(`/api/lagerorte/${angelegt.id}`, 'PUT', { name: 'Platz' });
      expect(waren.lagerortAktualisieren.mock.lastCall?.[1].ifcoPlatz).toBeUndefined();
      // New Böden of a Regal.
      const regalRes = (await (await send('/api/lagerorte', 'POST', regal)).json()) as {
        id: string;
      };
      expect(
        (
          await send(`/api/lagerorte/${regalRes.id}/boeden`, 'POST', {
            namen: ['B2'],
            ifcoPlatz: platz,
          })
        ).status,
      ).toBe(201);
      expect(waren.boedenHinzufuegen).toHaveBeenLastCalledWith(regalRes.id, ['B2'], platz);
    });

    it('accepts one IFCO-Lagerplatz per Boden and rejects a wrong count', async () => {
      const { app, waren } = makeApp();
      const send = (url: string, body: unknown) =>
        app.request(url, json('admin-token', 'POST', body));
      const a = { hoeheCm: 20, stellflaechen: 1 };
      const b = { hoeheCm: 30, stellflaechen: 1 };
      const regal = { name: 'Regal', art: 'regal', boeden: ['R1', 'R2'] };
      expect((await send('/api/lagerorte', { ...regal, boedenIfcoPlatz: [a, b] })).status).toBe(
        201,
      );
      expect(waren.lagerortAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'Regal' }),
        ['R1', 'R2'],
        [a, b],
      );
      expect((await send('/api/lagerorte', { ...regal, boedenIfcoPlatz: [a] })).status).toBe(400);
      const id = ((await (await send('/api/lagerorte', regal)).json()) as { id: string }).id;
      expect(
        (await send(`/api/lagerorte/${id}/boeden`, { namen: ['B3', 'B4'], ifcoPlatz: [a, b] }))
          .status,
      ).toBe(201);
      expect(waren.boedenHinzufuegen).toHaveBeenLastCalledWith(id, ['B3', 'B4'], [a, b]);
      expect(
        (await send(`/api/lagerorte/${id}/boeden`, { namen: ['B5'], ifcoPlatz: [a, b] })).status,
      ).toBe(400);
    });

    it('rejects reordering the Regalböden of a Regal', async () => {
      const { app, waren } = makeApp();
      waren.lagerortReihenfolge.mockRejectedValueOnce(
        new WarenUngueltig('Regalböden lassen sich nicht verschieben.'),
      );
      const res = await app.request(
        '/api/lagerorte/l1/reihenfolge',
        json('admin-token', 'PUT', { ids: ['a', 'b'] }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Regalböden lassen sich nicht verschieben.' });
    });

    it('lets IFCO-Lagerplätze be marked with stock, but keeps Waren and IFCOs apart', async () => {
      const { app, waren, inventar } = makeApp();
      const send = (url: string, method: string, body: unknown) =>
        app.request(url, json('admin-token', method, body));
      // marking a place that holds Waren is no longer rejected by the API layer
      const id = (
        (await (await send('/api/lagerorte', 'POST', { name: 'HR11' })).json()) as {
          id: string;
        }
      ).id;
      const platz = { hoeheCm: 20, stellflaechen: 1 };
      expect(
        (await send(`/api/lagerorte/${id}`, 'PUT', { name: 'HR11', ifcoPlatz: platz })).status,
      ).toBe(200);
      // booking Waren onto a place that holds IFCOs is a 400
      waren.einlagern.mockRejectedValueOnce(new WarenUngueltig(ifcoPlatzHatIfcosFehler('HR11')));
      const buchung = await send('/api/bestand/einlagerung', 'POST', {
        wareId: 'w1',
        lagerortId: id,
        gebindeId: 'gb1',
        anzahl: 1,
        zeitpunkt: '2026-05-01T10:00:00.000Z',
      });
      expect(buchung.status).toBe(400);
      expect(await buchung.json()).toEqual({
        error: 'Auf „HR11“ stehen IFCOs; dort kann gerade keine Ware liegen.',
      });
      // placing an IFCO onto a place that holds Waren is a 400
      inventar.ifcoAnlegen.mockRejectedValueOnce(
        new WarenUngueltig(ifcoPlatzHatWareFehler('HR11')),
      );
      const ifco = await send('/api/inventar/ifcos', 'POST', { name: 'Kiste', lagerortId: id });
      expect(ifco.status).toBe(400);
      expect(await ifco.json()).toEqual({
        error: 'Auf „HR11“ liegt Ware; dort kann keine IFCO stehen.',
      });
    });

    it('validates Gebinde and Waren input', async () => {
      const { app, waren } = makeApp();
      const gebinde = (body: unknown) =>
        app.request('/api/gebinde', json('admin-token', 'POST', body));
      const flasche = { menge: 0.5, einheit: 'l', verpackungseinheit: 'flasche', pfandCent: 8 };
      expect((await gebinde({ ...flasche, pfandCent: -1 })).status).toBe(400);
      expect((await gebinde({ name: 'Flasche', pfandCent: 8 })).status).toBe(400);
      // Basisgebinde without menge/einheit, Obergebinde without count or with its own menge
      expect((await gebinde({ verpackungseinheit: 'dose' })).status).toBe(400);
      expect((await gebinde({ verpackungseinheit: 'kasten', unterGebindeId: 'gb1' })).status).toBe(
        400,
      );
      expect(
        (
          await gebinde({
            verpackungseinheit: 'kasten',
            unterGebindeId: 'gb1',
            unterAnzahl: 20,
            menge: 1,
            einheit: 'l',
          })
        ).status,
      ).toBe(400);
      expect((await gebinde({ ...flasche, einheit: 'oz' })).status).toBe(400);
      expect((await gebinde(flasche)).status).toBe(201);
      const doppelt = await gebinde(flasche);
      expect(doppelt.status).toBe(409);
      expect(await doppelt.json()).toEqual({ error: 'Dieses Gebinde gibt es schon.' });
      // Same bottle with a different deposit is a different Gebinde
      expect((await gebinde({ ...flasche, pfandCent: 15 })).status).toBe(201);
      expect(
        (
          await gebinde({
            verpackungseinheit: 'kasten',
            pfandCent: 150,
            unterGebindeId: 'gb1',
            unterAnzahl: 20,
          })
        ).status,
      ).toBe(201);

      waren.wareAnlegen.mockRejectedValueOnce(
        new WarenUngueltig('Die Warengruppe existiert nicht.'),
      );
      const ware = (body: unknown) => app.request('/api/waren', json('admin-token', 'POST', body));
      expect(
        (await ware({ name: 'Cola', warengruppeId: 'g', mhdArt: 'x', gebindeIds: ['gb1'] })).status,
      ).toBe(400);
      expect(
        (await ware({ name: 'Cola', warengruppeId: 'g', mhdArt: 'tag', gebindeIds: [] })).status,
      ).toBe(400);
      const res = await ware({
        name: 'Cola',
        warengruppeId: 'g',
        mhdArt: 'tag',
        gebindeIds: ['gb1'],
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Die Warengruppe existiert nicht.' });
      expect(
        (await ware({ name: 'Cola', warengruppeId: 'g', mhdArt: 'tag', gebindeIds: ['gb1'] }))
          .status,
      ).toBe(201);

      expect((await app.request('/api/waren/nope', json('reader-token', 'GET'))).status).toBe(404);
      expect(
        (await app.request('/api/waren/nope/verlauf', json('reader-token', 'GET'))).status,
      ).toBe(404);
    });

    it('validates bookings and maps store errors', async () => {
      const { app, waren } = makeApp();
      const basis = { wareId: 'w1', lagerortId: 'l1', gebindeId: 'gb1', zeitpunkt };
      const entnahme = (body: unknown) =>
        app.request('/api/bestand/entnahme', json('reader-token', 'POST', body));
      expect((await entnahme({ ...basis, anzahl: 0 })).status).toBe(400);
      expect((await entnahme({ ...basis, anzahl: 1.5 })).status).toBe(400);
      expect((await entnahme({ ...basis, anzahl: 1, zeitpunkt: 'gestern' })).status).toBe(400);
      const ok = await entnahme({ ...basis, anzahl: 2, kommentar: ' Fest ' });
      expect(ok.status).toBe(201);
      expect(waren.entnehmen).toHaveBeenCalledWith(
        expect.objectContaining({ anzahl: 2, kommentar: 'Fest' }),
        'r',
      );
      waren.entnehmen.mockRejectedValueOnce(new WarenUngueltig('Die Ware ist archiviert.'));
      expect((await entnahme({ ...basis, anzahl: 1 })).status).toBe(400);

      const einlagerung = (body: unknown) =>
        app.request('/api/bestand/einlagerung', json('reader-token', 'POST', body));
      waren.einlagern.mockRejectedValueOnce(new WarenUngueltig('Bitte gib ein MHD an.'));
      const res = await einlagerung({ ...basis, anzahl: 1 });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Bitte gib ein MHD an.' });

      const loeschen = (id: string) =>
        app.request(`/api/bestand/vorgaenge/${id}`, json('reader-token', 'DELETE'));
      expect((await loeschen('v1')).status).toBe(200);
      expect((await loeschen('nope')).status).toBe(404);
    });

    it('rejects booking timestamps in the future but allows backdating and a small clock skew', async () => {
      const { app, waren } = makeApp();
      const post = async (url: string, body: unknown) =>
        app.request(url, json('reader-token', 'POST', body));
      const zukunft = new Date(Date.now() + 86_400_000).toISOString();
      const leichtVoraus = new Date(Date.now() + 60_000).toISOString();
      const pos = { wareId: 'w1', lagerortId: 'l1', gebindeId: 'gb1', anzahl: 2 };
      const umlagerung = { wareId: 'w1', gebindeId: 'gb1', anzahl: 2, vonId: 'l1', nachId: 'l2' };
      const faelle: [string, (zeitpunkt: string) => unknown][] = [
        ['/api/bestand/einlagerung', (z) => ({ ...pos, mhd: '2027-01-15', zeitpunkt: z })],
        ['/api/bestand/entnahme', (z) => ({ ...pos, zeitpunkt: z })],
        ['/api/bestand/einlagerungen', (z) => ({ zeitpunkt: z, positionen: [pos] })],
        ['/api/bestand/entnahmen', (z) => ({ zeitpunkt: z, positionen: [pos] })],
        ['/api/bestand/umlagerungen', (z) => ({ zeitpunkt: z, positionen: [umlagerung] })],
        ['/api/inventuren/i1/abschluss', (z) => ({ zeitpunkt: z })],
      ];
      for (const [url, body] of faelle) {
        const res = await post(url, body(zukunft));
        expect(res.status, url).toBe(400);
        expect(JSON.stringify(await res.json()), url).toContain(
          'Der Zeitpunkt darf nicht in der Zukunft liegen.',
        );
        expect((await post(url, body(leichtVoraus))).status, url).not.toBe(400);
        expect((await post(url, body(zeitpunkt))).status, url).not.toBe(400);
      }
      expect(waren.entnehmen).toHaveBeenCalled();
    });

    it('books several positions at once (Einlagerungen, Entnahmen, Umlagerungen)', async () => {
      const { app, waren } = makeApp();
      const post = (url: string, body: unknown) =>
        app.request(url, json('reader-token', 'POST', body));
      const pos = { wareId: 'w1', lagerortId: 'l1', gebindeId: 'gb1', anzahl: 2 };

      expect((await post('/api/bestand/einlagerungen', { zeitpunkt, positionen: [] })).status).toBe(
        400,
      );
      const einlagerung = await post('/api/bestand/einlagerungen', {
        zeitpunkt,
        kommentar: ' Lieferung ',
        positionen: [{ ...pos, mhd: '2027-01-15' }],
      });
      expect(einlagerung.status).toBe(201);
      expect(await einlagerung.json()).toEqual({ id: 'v4' });
      expect(waren.einlagerungen).toHaveBeenCalledWith(
        expect.objectContaining({ kommentar: 'Lieferung' }),
        'r',
      );
      waren.einlagerungen.mockRejectedValueOnce(new WarenUngueltig('Bitte gib ein MHD an.'));
      expect(
        (await post('/api/bestand/einlagerungen', { zeitpunkt, positionen: [pos] })).status,
      ).toBe(400);

      const gleich = { lagerortId: 'l1', quelleId: 'l1' };
      expect(
        (
          await post('/api/bestand/entnahmen', {
            zeitpunkt,
            positionen: [pos],
            nachfuellen: [gleich],
          })
        ).status,
      ).toBe(400);
      expect(
        (await post('/api/bestand/entnahmen', { zeitpunkt, positionen: [{ ...pos, anzahl: 0 }] }))
          .status,
      ).toBe(400);
      const entnahme = await post('/api/bestand/entnahmen', { zeitpunkt, positionen: [pos] });
      expect(entnahme.status).toBe(201);
      expect(await entnahme.json()).toEqual({ entnahmeId: 'v5', umlagerungId: null });
      expect(waren.entnahmen).toHaveBeenCalledWith(
        expect.objectContaining({ nachfuellen: [] }),
        'r',
      );
      waren.entnahmen.mockResolvedValueOnce({ entnahmeId: 'v7', umlagerungId: 'v8' });
      const mit = await post('/api/bestand/entnahmen', {
        zeitpunkt,
        positionen: [pos],
        nachfuellen: [{ lagerortId: 'l1', quelleId: 'l2' }],
      });
      expect(await mit.json()).toEqual({ entnahmeId: 'v7', umlagerungId: 'v8' });

      const umlagerung = { wareId: 'w1', gebindeId: 'gb1', anzahl: 1, vonId: 'l1', nachId: 'l2' };
      expect(
        (
          await post('/api/bestand/umlagerungen', {
            zeitpunkt,
            positionen: [{ ...umlagerung, nachId: 'l1' }],
          })
        ).status,
      ).toBe(400);
      const ok = await post('/api/bestand/umlagerungen', { zeitpunkt, positionen: [umlagerung] });
      expect(ok.status).toBe(201);
      expect(await ok.json()).toEqual({ id: 'v6' });

      waren.lagerortBestand.mockResolvedValueOnce([
        { lagerortId: 'l1', wareId: 'w1', gebindeId: 'gb1', menge: 3, fruehestesMhd: null },
      ]);
      const bestand = await app.request('/api/lagerorte/bestand', json('reader-token', 'GET'));
      expect(bestand.status).toBe(200);
      expect(await bestand.json()).toHaveLength(1);
      expect((await app.request('/api/lagerorte/bestand')).status).toBe(401);

      const listen = await app.request('/api/lagerorte/warenlisten', json('reader-token', 'GET'));
      expect(listen.status).toBe(200);
      expect(await listen.json()).toEqual([{ lagerortId: 'l1', wareIds: ['w1'] }]);
      expect((await app.request('/api/lagerorte/warenlisten')).status).toBe(401);
    });

    it('runs the Inventur flow and maps conflicts', async () => {
      const { app, waren } = makeApp();
      const start = (body: unknown) =>
        app.request('/api/inventuren', json('reader-token', 'POST', body));
      expect((await start({})).status).toBe(400);
      const ok = await start({ lagerortId: 'l1' });
      expect(ok.status).toBe(201);
      expect(waren.inventurStarten).toHaveBeenCalledWith('l1', 'r');
      waren.inventurStarten.mockRejectedValueOnce(
        new WarenKonflikt('Für diesen Lagerort läuft bereits eine Inventur.'),
      );
      expect((await start({ lagerortId: 'l1' })).status).toBe(409);

      expect(
        (await app.request('/api/inventuren?status=offen', json('reader-token', 'GET'))).status,
      ).toBe(200);
      expect(waren.inventuren).toHaveBeenCalledWith('offen');
      expect(
        (await app.request('/api/inventuren?status=x', json('reader-token', 'GET'))).status,
      ).toBe(400);
      expect((await app.request('/api/inventuren/nope', json('reader-token', 'GET'))).status).toBe(
        404,
      );

      const knoten = (body: unknown) =>
        app.request('/api/inventuren/i1/knoten/l1', json('reader-token', 'PUT', body));
      expect(
        (await knoten({ zaehlungen: [{ wareId: 'w1', gebindeId: 'gb1', anzahl: -1 }] })).status,
      ).toBe(400);
      const gespeichert = await knoten({
        zaehlungen: [{ wareId: 'w1', gebindeId: 'gb1', mhd: '2027-01-01', anzahl: 0 }],
        inListeAufnehmen: ['w2'],
      });
      expect(gespeichert.status).toBe(200);
      expect(waren.inventurKnotenSpeichern).toHaveBeenCalledWith(
        'i1',
        'l1',
        [{ wareId: 'w1', gebindeId: 'gb1', mhd: '2027-01-01', anzahl: 0 }],
        ['w2'],
      );

      expect(
        (
          await app.request(
            '/api/inventuren/i1/zusammenfassung?zeitpunkt=gestern',
            json('reader-token', 'GET'),
          )
        ).status,
      ).toBe(400);
      expect(
        (await app.request('/api/inventuren/i1/zusammenfassung', json('reader-token', 'GET')))
          .status,
      ).toBe(404);

      const abschluss = (id: string, body: unknown) =>
        app.request(`/api/inventuren/${id}/abschluss`, json('reader-token', 'POST', body));
      expect((await abschluss('i1', { zeitpunkt: 'bald' })).status).toBe(400);
      const fertig = await abschluss('i1', { zeitpunkt });
      expect(await fertig.json()).toEqual({ vorgangId: 'v3' });
      expect((await abschluss('nope', { zeitpunkt })).status).toBe(404);
      waren.inventurAbschliessen.mockRejectedValueOnce(new WarenKonflikt('Bereits abgeschlossen.'));
      expect((await abschluss('i1', { zeitpunkt })).status).toBe(409);

      expect((await app.request('/api/inventuren/i1', json('reader-token', 'DELETE'))).status).toBe(
        200,
      );
    });
  });
});

describe('inventar', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const zeitpunkt = '2026-05-01T10:00:00.000Z';

  it('lets everyone read and rearrange, but only Inventar-Verwalter change master data', async () => {
    const { app, inventar } = makeApp();
    for (const url of [
      '/api/inventar/kategorien',
      '/api/inventar/gegenstaende',
      '/api/inventar/gegenstaende/g1',
      '/api/inventar/ifcos',
      '/api/inventar/ifcos/i1',
      '/api/inventar/ifco-typen',
      '/api/inventar/ausleihen',
      '/api/inventar/ausleihen/a1',
    ]) {
      expect((await app.request(url, json('reader-token', 'GET'))).status, url).toBe(200);
    }
    for (const [url, method] of [
      ['/api/inventar/kategorien', 'POST'],
      ['/api/inventar/kategorien/k1', 'PUT'],
      ['/api/inventar/kategorien/k1', 'DELETE'],
      ['/api/inventar/kategorien/k1/archiv', 'PUT'],
      ['/api/inventar/gegenstaende', 'POST'],
      ['/api/inventar/gegenstaende/g1', 'PUT'],
      ['/api/inventar/gegenstaende/g1', 'DELETE'],
      ['/api/inventar/gegenstaende/g1/archiv', 'PUT'],
      ['/api/inventar/ifcos', 'POST'],
      ['/api/inventar/ifcos/i1', 'PUT'],
      ['/api/inventar/ifcos/i1', 'DELETE'],
      ['/api/inventar/ifcos/i1/archiv', 'PUT'],
      ['/api/inventar/ifco-typen', 'POST'],
      ['/api/inventar/ifco-typen/t1', 'PUT'],
      ['/api/inventar/ifco-typen/t1', 'DELETE'],
      ['/api/inventar/ifco-typen/t1/archiv', 'PUT'],
    ] as const) {
      const res = await app.request(url, json('reader-token', method, {}));
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect(inventar.kategorieAnlegen).not.toHaveBeenCalled();
    expect(inventar.gegenstandAnlegen).not.toHaveBeenCalled();
    expect(inventar.ifcoAnlegen).not.toHaveBeenCalled();

    const ok = await app.request(
      '/api/inventar/kategorien',
      json('vorstand-token', 'POST', { name: 'Technik' }),
    );
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ id: 'k2' });
    expect(inventar.kategorieAnlegen).toHaveBeenCalledWith({ name: 'Technik', parentId: null });
    const admin = await app.request(
      '/api/inventar/ifcos',
      json('admin-token', 'POST', { name: 'Spanngurtkiste' }),
    );
    expect(admin.status).toBe(201);
    expect(inventar.ifcoAnlegen).toHaveBeenCalledWith({
      name: 'Spanngurtkiste',
      beschreibung: null,
      lagerortId: null,
      typId: null,
      inhalt: [],
    });
  });

  it('manages IFCO-Typen: validates, deletes only unused ones, archives', async () => {
    const { app, inventar, inventarVerwendet } = makeApp();
    const typ = { name: ' 6410 ', grundflaeche: 'gross', hoeheCm: 10 };
    const send = (url: string, method: string, body?: unknown) =>
      app.request(url, json('vorstand-token', method, body));
    const res = await send('/api/inventar/ifco-typen', 'POST', typ);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 't2' });
    expect(inventar.ifcoTypAnlegen).toHaveBeenCalledWith({
      name: '6410',
      grundflaeche: 'gross',
      hoeheCm: 10,
    });
    for (const ungueltig of [
      { ...typ, hoeheCm: 0 },
      { ...typ, hoeheCm: 10.25 },
      { ...typ, grundflaeche: 'mittel' },
      { ...typ, name: ' ' },
      { name: 'x' },
    ]) {
      expect((await send('/api/inventar/ifco-typen', 'POST', ungueltig)).status).toBe(400);
    }
    expect((await send('/api/inventar/ifco-typen/t1', 'PUT', typ)).status).toBe(200);
    expect((await send('/api/inventar/ifco-typen/nix', 'PUT', typ)).status).toBe(404);
    expect((await send('/api/inventar/ifco-typen/nix', 'DELETE')).status).toBe(404);
    expect((await send('/api/inventar/ifco-typen/t1', 'DELETE')).status).toBe(200);
    inventarVerwendet.add('t1');
    const used = await send('/api/inventar/ifco-typen/t1', 'DELETE');
    expect(used.status).toBe(409);
    expect(await used.json()).toEqual({ error: verwendetMeldung('IFCO-Typ') });
    const archiv = await send('/api/inventar/ifco-typen/t1/archiv', 'PUT', { archiviert: true });
    expect(archiv.status).toBe(200);
    expect(inventar.ifcoTypArchivieren).toHaveBeenCalledWith('t1', true);
  });

  it('passes the IFCO type and maps a capacity error to 400', async () => {
    const { app, inventar } = makeApp();
    const meldung =
      'Passt nicht auf „HR11“ (20 cm hoch, 1 Stellfläche): „X“ (6416, 16 cm) hat keinen Platz.';
    inventar.ifcoPlatzSetzen.mockRejectedValueOnce(new WarenUngueltig(meldung));
    const res = await app.request(
      '/api/inventar/ifcos/i1/platz',
      json('reader-token', 'PUT', { lagerortId: 'l1' }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: meldung });
    await app.request(
      '/api/inventar/ifcos',
      json('admin-token', 'POST', { name: 'Kiste', typId: 't1', lagerortId: 'l1' }),
    );
    expect(inventar.ifcoAnlegen).toHaveBeenCalledWith({
      name: 'Kiste',
      beschreibung: null,
      lagerortId: 'l1',
      typId: 't1',
      inhalt: [],
    });
  });

  it('requires authentication', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/inventar/gegenstaende')).status).toBe(401);
  });

  it('creates a Gegenstand with its first Zugang (Anzahl 1, gekauft by default)', async () => {
    const { app, inventar } = makeApp();
    const datum = '2026-10-10';
    const post = (body: unknown) =>
      app.request('/api/inventar/gegenstaende', json('admin-token', 'POST', body));
    expect((await post({ name: 'Beamer', datum })).status).toBe(400);
    expect((await post({ name: 'Beamer', kategorieId: 'k1', anzahl: 0, datum })).status).toBe(400);
    expect((await post({ name: ' ', kategorieId: 'k1', datum })).status).toBe(400);
    expect((await post({ name: 'Beamer', kategorieId: 'k1' })).status).toBe(400);
    expect((await post({ name: 'Beamer', kategorieId: 'k1', datum })).status).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenCalledWith(
      {
        name: 'Beamer',
        beschreibung: null,
        kategorieId: 'k1',
        anzahl: 1,
        grund: 'gekauft',
        datum,
        platz: null,
        teilVon: null,
        virtuell: false,
        anzahlJe: null,
        teile: [],
      },
      'a',
    );
    const platz = { lagerortId: 'l1', ifcoId: null, anzahl: 3 };
    expect(
      (await post({ name: 'Zelt', kategorieId: 'k1', anzahl: 3, datum, grund: 'geschenkt', platz }))
        .status,
    ).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ platz, grund: 'geschenkt' }),
      'a',
    );
    const zwei = { lagerortId: 'l1', ifcoId: 'i1', anzahl: 1 };
    expect((await post({ name: 'Zelt', kategorieId: 'k1', datum, platz: zwei })).status).toBe(400);
  });

  it('validates parts and virtual Gegenstände when creating', async () => {
    const { app, inventar } = makeApp();
    const datum = '2026-10-10';
    const post = (body: unknown) =>
      app.request('/api/inventar/gegenstaende', json('admin-token', 'POST', body));
    const basis = { name: 'Winkel', kategorieId: 'k1', datum };
    // A part needs pieces per parent, and cannot be virtual.
    expect((await post({ ...basis, teilVon: 'g1' })).status).toBe(400);
    expect((await post({ ...basis, teilVon: 'g1', anzahlJe: 0 })).status).toBe(400);
    expect((await post({ ...basis, teilVon: 'g1', anzahlJe: 4, virtuell: true })).status).toBe(400);
    expect((await post({ ...basis, teilVon: 'g1', anzahlJe: 12 })).status).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ teilVon: 'g1', anzahlJe: 12, virtuell: false }),
      'a',
    );
    // anzahlJe without a parent is dropped.
    expect((await post({ ...basis, anzahlJe: 3 })).status).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ teilVon: null, anzahlJe: null }),
      'a',
    );
    // A virtual Gegenstand has no Platz of its own.
    const platz = { lagerortId: 'l1', ifcoId: null, anzahl: 1 };
    expect((await post({ ...basis, virtuell: true, platz })).status).toBe(400);
    expect((await post({ ...basis, virtuell: true })).status).toBe(201);
  });

  it('creates parts without category, reason and day, and parts together with their parent', async () => {
    const { app, inventar } = makeApp();
    const datum = '2026-10-10';
    const post = (body: unknown) =>
      app.request('/api/inventar/gegenstaende', json('admin-token', 'POST', body));
    // A part needs no category, reason or day.
    expect((await post({ name: 'Winkel', teilVon: 'g1', anzahlJe: 12, anzahl: 5 })).status).toBe(
      201,
    );
    const teilDaten = inventar.gegenstandAnlegen.mock.lastCall?.[0];
    expect(teilDaten).toMatchObject({ kategorieId: null, teilVon: 'g1', anzahl: 5 });
    expect(teilDaten?.grund).toBeUndefined();
    expect(teilDaten?.datum).toBeUndefined();
    // Everything else still does.
    expect((await post({ name: 'Zelt', datum })).status).toBe(400);
    expect((await post({ name: 'Zelt', kategorieId: 'k1' })).status).toBe(400);
    // Parts together with the parent.
    const teile = [
      { name: 'Plane', anzahlJe: 1 },
      { name: 'Winkel', anzahlJe: 12, platz: { lagerortId: 'l1' } },
    ];
    const zelt = { name: 'Pavillon', kategorieId: 'k1', datum, anzahl: 3 };
    expect((await post({ ...zelt, teile })).status).toBe(201);
    expect(inventar.gegenstandAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        teile: [
          { name: 'Plane', anzahlJe: 1, platz: null },
          { name: 'Winkel', anzahlJe: 12, platz: { lagerortId: 'l1', ifcoId: null } },
        ],
      }),
      'a',
    );
    expect((await post({ ...zelt, teile: [{ name: 'Plane' }] })).status).toBe(400);
    expect((await post({ ...zelt, teile: [{ name: ' ', anzahlJe: 1 }] })).status).toBe(400);
    expect(
      (
        await post({
          ...zelt,
          teile: [{ name: 'Plane', anzahlJe: 1, platz: { lagerortId: 'l1', ifcoId: 'i1' } }],
        })
      ).status,
    ).toBe(400);
    const doppelt = [
      { name: 'Plane', anzahlJe: 1 },
      { name: 'plane ', anzahlJe: 2 },
    ];
    expect((await post({ ...zelt, teile: doppelt })).status).toBe(400);
    // A part cannot have parts.
    expect((await post({ ...zelt, teilVon: 'g1', anzahlJe: 1, teile })).status).toBe(400);
  });

  it('lists, books and deletes Zugänge and Abgänge', async () => {
    const { app, inventar, userAdmin } = makeApp();
    userAdmin.konten.mockResolvedValue(new Map([['v', { username: 'vera' } as Konto]]));
    const liste = await app.request(
      '/api/inventar/gegenstaende/g1/bewegungen',
      json('reader-token', 'GET'),
    );
    expect(liste.status).toBe(200);
    expect(
      ((await liste.json()) as { ersteller: { username: string } }[])[0]!.ersteller.username,
    ).toBe('vera');
    expect(
      (await app.request('/api/inventar/gegenstaende/nix/bewegungen', json('reader-token', 'GET')))
        .status,
    ).toBe(404);
    const abgang = {
      art: 'abgang',
      grund: 'verloren',
      anzahl: 3,
      datum: '2026-10-11',
      von: { art: 'platz', lagerortId: 'l1' },
    };
    const post = (token: string, body: unknown) =>
      app.request('/api/inventar/gegenstaende/g1/bewegungen', json(token, 'POST', body));
    expect((await post('reader-token', abgang)).status).toBe(403);
    expect((await post('admin-token', abgang)).status).toBe(201);
    expect(inventar.bewegungBuchen).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({
        art: 'abgang',
        von: { art: 'platz', lagerortId: 'l1', ifcoId: null },
      }),
      'a',
    );
    expect((await post('admin-token', { ...abgang, grund: 'gekauft' })).status).toBe(400);
    const loeschen = (token: string, id: string) =>
      app.request(`/api/inventar/gegenstaende/g1/bewegungen/${id}`, json(token, 'DELETE'));
    expect((await loeschen('reader-token', 'b1')).status).toBe(403);
    expect((await loeschen('admin-token', 'b1')).status).toBe(200);
    expect((await loeschen('admin-token', 'nix')).status).toBe(404);
  });

  it('maps unknown ids to 404 and used entries to 409', async () => {
    const { app, inventarVerwendet } = makeApp();
    expect(
      (await app.request('/api/inventar/gegenstaende/nix', json('reader-token', 'GET'))).status,
    ).toBe(404);
    expect((await app.request('/api/inventar/ifcos/nix', json('reader-token', 'GET'))).status).toBe(
      404,
    );
    expect(
      (await app.request('/api/inventar/ausleihen/nix', json('reader-token', 'GET'))).status,
    ).toBe(404);
    expect(
      (await app.request('/api/inventar/kategorien/nix', json('admin-token', 'DELETE'))).status,
    ).toBe(404);
    inventarVerwendet.add('g1');
    const res = await app.request('/api/inventar/gegenstaende/g1', json('admin-token', 'DELETE'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: verwendetMeldung('Gegenstand') });
  });

  it('archives with the flag from the body', async () => {
    const { app, inventar } = makeApp();
    const res = await app.request(
      '/api/inventar/kategorien/k1/archiv',
      json('admin-token', 'PUT', { archiviert: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ archiviert: true });
    expect(inventar.kategorieArchivieren).toHaveBeenCalledWith('k1', true);
  });

  it('replaces Plätze, IFCO-Platz and IFCO-Inhalt for every member', async () => {
    const { app, inventar, inventarVerwendet } = makeApp();
    const plaetze = {
      plaetze: [
        { lagerortId: 'l1', anzahl: 6 },
        { ifcoId: 'i1', anzahl: 4 },
      ],
    };
    const put = (url: string, body: unknown, token = 'reader-token') =>
      app.request(url, json(token, 'PUT', body));
    expect((await put('/api/inventar/gegenstaende/g1/plaetze', plaetze)).status).toBe(200);
    expect(inventar.gegenstandPlaetzeSetzen).toHaveBeenCalledWith(
      'g1',
      [
        { lagerortId: 'l1', ifcoId: null, anzahl: 6 },
        { lagerortId: null, ifcoId: 'i1', anzahl: 4 },
      ],
      undefined,
    );
    expect(
      (
        await put('/api/inventar/gegenstaende/g1/plaetze', {
          plaetze: [],
          verbaut: [{ ort: ' unter der Bar ', anzahl: 3 }],
        })
      ).status,
    ).toBe(200);
    expect(inventar.gegenstandPlaetzeSetzen).toHaveBeenLastCalledWith(
      'g1',
      [],
      [{ ort: 'unter der Bar', anzahl: 3 }],
    );
    expect((await put('/api/inventar/gegenstaende/nix/plaetze', plaetze)).status).toBe(404);
    // Invalid: both targets, no target, zero amount, duplicate target.
    for (const ungueltig of [
      [{ lagerortId: 'l1', ifcoId: 'i1', anzahl: 1 }],
      [{ anzahl: 1 }],
      [{ lagerortId: 'l1', anzahl: 0 }],
      [
        { lagerortId: 'l1', anzahl: 1 },
        { lagerortId: 'l1', anzahl: 2 },
      ],
    ]) {
      expect(
        (await put('/api/inventar/gegenstaende/g1/plaetze', { plaetze: ungueltig })).status,
      ).toBe(400);
    }
    inventarVerwendet.add('g1');
    const konflikt = await put('/api/inventar/gegenstaende/g1/plaetze', { plaetze: [] });
    expect(konflikt.status).toBe(409);
    expect(await konflikt.json()).toEqual({
      error: 'Davon sind noch 3 verliehen oder vorgemerkt.',
    });

    expect((await put('/api/inventar/ifcos/i1/platz', { lagerortId: 'l1' })).status).toBe(200);
    expect(inventar.ifcoPlatzSetzen).toHaveBeenCalledWith('i1', 'l1');
    expect((await put('/api/inventar/ifcos/i1/platz', { lagerortId: null })).status).toBe(200);
    expect(inventar.ifcoPlatzSetzen).toHaveBeenLastCalledWith('i1', null);
    expect((await put('/api/inventar/ifcos/nix/platz', {})).status).toBe(404);

    const inhalt = { positionen: [{ gegenstandId: 'g1', anzahl: 6 }] };
    expect((await put('/api/inventar/ifcos/i1/inhalt', inhalt)).status).toBe(200);
    expect(inventar.ifcoInhaltSetzen).toHaveBeenCalledWith(
      'i1',
      inhalt.positionen.map((p) => ({ ...p, andere: [] })),
    );
    const andere = [{ lagerortId: 'l1', ifcoId: null, anzahl: 0 }];
    await put('/api/inventar/ifcos/i1/inhalt', {
      positionen: [{ gegenstandId: 'g1', anzahl: 2, andere }],
    });
    expect(inventar.ifcoInhaltSetzen).toHaveBeenLastCalledWith('i1', [
      { gegenstandId: 'g1', anzahl: 2, andere },
    ]);
    expect(
      (
        await put('/api/inventar/ifcos/i1/inhalt', {
          positionen: [
            { gegenstandId: 'g1', anzahl: 1 },
            { gegenstandId: 'g1', anzahl: 2 },
          ],
        })
      ).status,
    ).toBe(400);
  });

  describe('ausleihen', () => {
    const position = { gegenstandId: 'g1', lagerortId: 'l1', anzahl: 3 };
    const ausleihe = {
      an: 'Feuerwehr Musterdorf',
      organisiertVon: 'r',
      ausgeliehenAm: zeitpunkt,
      rueckgabeGeplant: '2026-05-08',
      positionen: [position],
    };

    it('creates an Ausleihe for the caller and returns its id', async () => {
      const { app, inventar } = makeApp();
      const res = await app.request(
        '/api/inventar/ausleihen',
        json('reader-token', 'POST', ausleihe),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 'a2' });
      expect(inventar.ausleiheAnlegen).toHaveBeenCalledWith(
        {
          an: 'Feuerwehr Musterdorf',
          organisiertVon: 'r',
          ausgeliehenAm: zeitpunkt,
          rueckgabeGeplant: '2026-05-08',
          kommentar: null,
          positionen: [{ gegenstandId: 'g1', lagerortId: 'l1', ifcoId: null, anzahl: 3 }],
        },
        'r',
      );
    });

    it('rejects invalid Ausleihen with 400 and too large amounts with the store message', async () => {
      const { app } = makeApp();
      const post = (body: unknown) =>
        app.request('/api/inventar/ausleihen', json('reader-token', 'POST', body));
      expect((await post({ ...ausleihe, positionen: [] })).status).toBe(400);
      expect((await post({ ...ausleihe, an: ' ' })).status).toBe(400);
      expect((await post({ ...ausleihe, organisiertVon: undefined })).status).toBe(400);
      expect(
        (await post({ ...ausleihe, positionen: [{ ...position, ganzeIfco: true }] })).status,
      ).toBe(400);
      expect(
        (await post({ ...ausleihe, positionen: [{ ...position, ifcoId: 'i1' }] })).status,
      ).toBe(400);
      expect((await post({ ...ausleihe, positionen: [position, position] })).status).toBe(400);
      expect((await post({ ...ausleihe, ausgeliehenAm: 'gestern' })).status).toBe(400);
      expect((await post({ ...ausleihe, rueckgabeGeplant: '2026-04-30' })).status).toBe(400);
      const zuViel = await post({ ...ausleihe, positionen: [{ ...position, anzahl: 6 }] });
      expect(zuViel.status).toBe(400);
      expect(await zuViel.json()).toEqual({
        error: 'Von „Kabeltrommel“ sind bei „Lager“ nur noch 5 verfügbar.',
      });
    });

    it('requires a planned return day on create and edit', async () => {
      const { app, inventar } = makeApp();
      const ohne = { ...ausleihe, rueckgabeGeplant: undefined };
      for (const body of [ohne, { ...ohne, rueckgabeGeplant: null }]) {
        const res = await app.request(
          '/api/inventar/ausleihen',
          json('reader-token', 'POST', body),
        );
        expect(res.status).toBe(400);
        expect(JSON.stringify(await res.json())).toContain('Bitte gib an, wann es zurückkommt.');
      }
      const kopf = { ...ohne, positionen: undefined };
      const put = await app.request(
        '/api/inventar/ausleihen/a1',
        json('reader-token', 'PUT', kopf),
      );
      expect(put.status).toBe(400);
      expect(JSON.stringify(await put.json())).toContain('Bitte gib an, wann es zurückkommt.');
      expect(inventar.ausleiheAnlegen).not.toHaveBeenCalled();
      expect(inventar.ausleiheAktualisieren).not.toHaveBeenCalled();
    });

    it('accepts a reservation next to an existing one and rejects an overlapping one', async () => {
      const { app } = makeApp();
      const post = (von: string, bis: string) =>
        app.request(
          '/api/inventar/ausleihen',
          json('reader-token', 'POST', {
            ...ausleihe,
            ausgeliehenAm: `${von}T08:00:00.000Z`,
            rueckgabeGeplant: bis,
            positionen: [{ ...position, anzahl: 5 }],
          }),
        );
      expect((await post('2026-10-22', '2026-10-25')).status).toBe(201);
      expect((await post('2026-10-27', '2026-10-29')).status).toBe(201);
      const belegt = await post('2026-10-24', '2026-10-26');
      expect(belegt.status).toBe(400);
      expect(((await belegt.json()) as { error: string }).error).toContain(
        '5 an Jugendgruppe vorgemerkt (25.10.–27.10.2026)',
      );
    });

    it('shows the organiser with the Cognito username', async () => {
      const { app, userAdmin } = makeApp();
      userAdmin.konten.mockResolvedValue(
        new Map([['r', { sub: 'r', kontoName: 'u1', username: 'rita', aktiviert: true } as Konto]]),
      );
      const res = await app.request('/api/inventar/ausleihen/a1', json('reader-token', 'GET'));
      expect(
        ((await res.json()) as { organisator: { username: string } }).organisator.username,
      ).toBe('rita');
    });

    it('returns positions, edits the header and deletes', async () => {
      const { app, inventar } = makeApp();
      const rueckgabe = (id: string, body: unknown) =>
        app.request(`/api/inventar/ausleihen/${id}/rueckgabe`, json('reader-token', 'POST', body));
      expect((await rueckgabe('a1', { positionIds: ['p1'], zurueckAm: zeitpunkt })).status).toBe(
        200,
      );
      expect(inventar.ausleiheRueckgabe).toHaveBeenCalledWith('a1', ['p1'], zeitpunkt);
      expect((await rueckgabe('nix', { positionIds: ['p1'], zurueckAm: zeitpunkt })).status).toBe(
        404,
      );
      expect((await rueckgabe('a1', { positionIds: [], zurueckAm: zeitpunkt })).status).toBe(400);
      expect((await rueckgabe('a1', { positionIds: ['p1'] })).status).toBe(400);
      const morgenIso = new Date(Date.now() + 2 * 86_400_000).toISOString();
      expect((await rueckgabe('a1', { positionIds: ['p1'], zurueckAm: morgenIso })).status).toBe(
        400,
      );
      expect(
        (await rueckgabe('a1', { positionIds: ['bereits'], zurueckAm: zeitpunkt })).status,
      ).toBe(400);

      const kopf = {
        an: 'Verein',
        organisiertVon: 'r',
        ausgeliehenAm: zeitpunkt,
        rueckgabeGeplant: '2026-05-08',
      };
      expect(
        (await app.request('/api/inventar/ausleihen/a1', json('reader-token', 'PUT', kopf))).status,
      ).toBe(200);
      expect(inventar.ausleiheAktualisieren).toHaveBeenCalledWith('a1', {
        ...kopf,
        kommentar: null,
      });
      // The open Positionen can be replaced together with the header.
      const position = { gegenstandId: 'g1', lagerortId: 'l1', anzahl: 2 };
      const mitPositionen = (positionen: unknown) =>
        app.request(
          '/api/inventar/ausleihen/a1',
          json('reader-token', 'PUT', { ...kopf, positionen }),
        );
      expect((await mitPositionen([position])).status).toBe(200);
      expect(inventar.ausleiheAktualisieren).toHaveBeenLastCalledWith('a1', {
        ...kopf,
        kommentar: null,
        positionen: [{ ...position, ifcoId: null }],
      });
      expect((await mitPositionen([position, position])).status).toBe(400);
      expect((await mitPositionen([{ ...position, lagerortId: null }])).status).toBe(400);
      expect(
        (await app.request('/api/inventar/ausleihen/nix', json('reader-token', 'PUT', kopf)))
          .status,
      ).toBe(404);
      expect(
        (await app.request('/api/inventar/ausleihen/a1', json('reader-token', 'DELETE'))).status,
      ).toBe(200);
      expect(
        (await app.request('/api/inventar/ausleihen/nix', json('reader-token', 'DELETE'))).status,
      ).toBe(404);
    });

    it('lists only open Ausleihen with ?status=offen', async () => {
      const { app, inventar } = makeApp();
      await app.request('/api/inventar/ausleihen?status=offen', json('reader-token', 'GET'));
      expect(inventar.ausleihen).toHaveBeenLastCalledWith(true);
      await app.request('/api/inventar/ausleihen', json('reader-token', 'GET'));
      expect(inventar.ausleihen).toHaveBeenLastCalledWith(false);
    });
  });

  describe('aufraeumen', () => {
    it('shows the running Aufräumaktion with usernames', async () => {
      const { app, userAdmin } = makeApp();
      userAdmin.konten.mockResolvedValue(new Map([['v', { username: 'vera' } as Konto]]));
      const res = await app.request('/api/inventar/aufraeumen', json('reader-token', 'GET'));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        aktion: { gestartetVon: { username: string }; fertig: { ifcoId: string }[] };
      };
      expect(body.aktion.gestartetVon.username).toBe('vera');
      expect(body.aktion.fertig.map((f) => f.ifcoId)).toEqual(['i1']);
    });

    it('lets everyone start, end and mark IFCOs as the caller', async () => {
      const { app, inventar } = makeApp();
      const start = await app.request('/api/inventar/aufraeumen', json('reader-token', 'POST'));
      expect(start.status).toBe(201);
      expect(inventar.aufraeumenStarten).toHaveBeenCalledWith('r');
      const put = (id: string, body: unknown) =>
        app.request(`/api/inventar/aufraeumen/ifcos/${id}`, json('reader-token', 'PUT', body));
      expect((await put('i1', { fertig: true })).status).toBe(200);
      expect(inventar.aufraeumIfcoSetzen).toHaveBeenCalledWith('i1', true, 'r');
      expect((await put('i1', {})).status).toBe(400);
      expect((await put('nix', { fertig: false })).status).toBe(404);
      const ende = await app.request(
        '/api/inventar/aufraeumen/beenden',
        json('reader-token', 'POST'),
      );
      expect(ende.status).toBe(200);
      expect(inventar.aufraeumenBeenden).toHaveBeenCalledWith('r');
    });

    it('maps a second start to 409 and ending without one to 404', async () => {
      const { app, inventar } = makeApp();
      inventar.aufraeumenStarten.mockRejectedValueOnce(new WarenKonflikt('läuft schon'));
      expect(
        (await app.request('/api/inventar/aufraeumen', json('reader-token', 'POST'))).status,
      ).toBe(409);
      inventar.aufraeumenBeenden.mockResolvedValueOnce(false);
      expect(
        (await app.request('/api/inventar/aufraeumen/beenden', json('reader-token', 'POST')))
          .status,
      ).toBe(404);
    });
  });
});

describe('kalender', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const eventBody = {
    titel: 'Offener Abend',
    kategorieId: 'k1',
    beginn: '2026-06-05T17:00:00.000Z',
    ende: '2026-06-05T23:00:00.000Z',
    schichten: [],
  };
  const dienstInfo = (patch: Partial<DienstInfo>): DienstInfo => ({
    id: 'd1',
    schichtId: 's1',
    schichtArt: 'betrieb',
    schichtBeginn: '2026-06-05T17:00:00.000Z',
    schichtEnde: '2026-06-05T21:00:00.000Z',
    eventId: 'e1',
    eventTitel: 'Offener Abend',
    eventBeginn: '2026-06-05T17:00:00.000Z',
    abgesagt: false,
    dienstformId: 'f1',
    mitgliedSub: null,
    externId: null,
    eingetragenVon: 'm2',
    ...patch,
  });
  /** Gives every caller a profile row, which entering Dienste and Externe requires. */
  const mitProfil = (app: ReturnType<typeof makeApp>) =>
    app.mitglieder.holen.mockImplementation(
      async (sub: string) =>
        ({ sub, vorname: 'A', nachname: 'B', status: 'mitglied' }) as MitgliedRow,
    );

  it('lets everyone read, but only Verwalter and Einrichter write', async () => {
    const t = makeApp();
    for (const url of [
      '/api/kalender/events?von=2026-06-01&bis=2026-06-30',
      '/api/kalender/externe',
      '/api/kalender/dienstformen',
      '/api/kalender/kategorien',
      '/api/kalender/vorlagen',
      '/api/kalender/serien',
      '/api/kalender/erinnerungen',
      '/api/kalender/statistik?jahr=2026',
    ]) {
      expect((await t.app.request(url, json('reader-token', 'GET'))).status, url).toBe(200);
    }
    expect(
      (await t.app.request('/api/kalender/events/e1', json('reader-token', 'GET'))).status,
    ).toBe(404);
    for (const [url, method] of [
      ['/api/kalender/events', 'POST'],
      ['/api/kalender/events/e1', 'PUT'],
      ['/api/kalender/events/e1', 'DELETE'],
      ['/api/kalender/events/e1/absage', 'PUT'],
      ['/api/kalender/externe/x1', 'PUT'],
      ['/api/kalender/externe/zusammenfuehren', 'POST'],
      ['/api/kalender/dienstformen', 'POST'],
      ['/api/kalender/dienstformen/f1', 'PUT'],
      ['/api/kalender/kategorien', 'POST'],
      ['/api/kalender/kategorien/k1', 'PUT'],
      ['/api/kalender/vorlagen', 'POST'],
      ['/api/kalender/vorlagen/v1', 'PUT'],
      ['/api/kalender/vorlagen/v1', 'DELETE'],
      ['/api/kalender/serien', 'POST'],
      ['/api/kalender/serien/plenum', 'PUT'],
      ['/api/kalender/serien/plenum/aktiv', 'PUT'],
      ['/api/kalender/serien/plenum', 'DELETE'],
      ['/api/kalender/erinnerungen', 'PUT'],
    ] as const) {
      const res = await t.app.request(url, json('reader-token', method, {}));
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect(t.kalender.eventAnlegen).not.toHaveBeenCalled();
    expect(t.kalender.dienstformAnlegen).not.toHaveBeenCalled();
    expect((await t.app.request('/api/kalender/events')).status).toBe(401);
  });

  it('creates events for Verwalter and rejects invalid input', async () => {
    const t = makeApp();
    const post = (token: string, body: unknown) =>
      t.app.request('/api/kalender/events', json(token, 'POST', body));
    const ok = await post('vorstand-token', eventBody);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ id: 'e1' });
    expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Offener Abend', kategorieId: 'k1' }),
      'v',
    );
    expect((await post('admin-token', eventBody)).status).toBe(201);
    expect((await post('admin-token', { ...eventBody, ende: eventBody.beginn })).status).toBe(400);
    const betrieb = {
      art: 'betrieb',
      beginn: eventBody.beginn,
      ende: eventBody.ende,
      bedarfe: [{ dienstformId: 'f1', minimum: 1, wunsch: 2 }],
    };
    const aufbau = { art: 'aufbau', beginn: eventBody.beginn, ende: eventBody.ende };
    const mitSchicht = (schicht: unknown) => ({ ...eventBody, schichten: [schicht] });
    expect((await post('admin-token', mitSchicht(betrieb))).status).toBe(201);
    expect(
      (await post('admin-token', mitSchicht({ ...aufbau, minimum: 0, wunsch: 2 }))).status,
    ).toBe(201);
    // Betrieb without Dienstform or with minimum 0, Aufbau without wish
    expect((await post('admin-token', mitSchicht({ ...betrieb, bedarfe: [] }))).status).toBe(400);
    expect(
      (
        await post(
          'admin-token',
          mitSchicht({ ...betrieb, bedarfe: [{ dienstformId: 'f1', minimum: 0, wunsch: 1 }] }),
        )
      ).status,
    ).toBe(400);
    const ohneWunsch = await post('admin-token', mitSchicht({ ...aufbau, minimum: 0 }));
    expect(ohneWunsch.status).toBe(400);
    t.kalender.eventAnlegen.mockRejectedValueOnce(
      new KalenderUngueltig('Die Kategorie gibt es nicht.'),
    );
    const res = await post('admin-token', eventBody);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Die Kategorie gibt es nicht.' });
  });

  it('requires a Kategorie for events', async () => {
    const t = makeApp();
    const ohne: Record<string, unknown> = { ...eventBody };
    delete ohne.kategorieId;
    for (const body of [ohne, { ...eventBody, kategorieId: '' }]) {
      expect(
        (await t.app.request('/api/kalender/events', json('admin-token', 'POST', body))).status,
      ).toBe(400);
    }
  });

  it('answers 409 with the affected participations when the kind changes', async () => {
    const t = makeApp();
    t.kalender.eventAktualisieren.mockRejectedValueOnce(
      new EntfernungBestaetigen(
        [],
        [
          {
            zustand: 'teilnahme',
            eingeladen: true,
            person: {
              art: 'mitglied',
              sub: 'm2',
              username: null,
              vorname: 'Max',
              nachname: 'Muster',
              status: 'mitglied',
              anrede: 'neutral',
            },
          },
        ],
      ),
    );
    t.userAdmin.konten.mockResolvedValue(new Map([['m2', { username: 'max' } as Konto]]));
    const res = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', eventBody),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      betroffene: [],
      teilnahmen: [{ zustand: 'teilnahme', person: { username: 'max' } }],
    });
  });

  it('answers 409 with the affected Dienste when an update needs confirmation', async () => {
    const t = makeApp();
    t.kalender.eventAktualisieren.mockRejectedValueOnce(
      new EntfernungBestaetigen([
        {
          dienstId: 'd1',
          schichtId: 's1',
          schichtArt: 'betrieb',
          schichtBeginn: '2026-06-05T17:00:00.000Z',
          schichtEnde: '2026-06-05T21:00:00.000Z',
          dienstformId: 'f1',
          grund: 'schicht',
          person: {
            art: 'mitglied',
            sub: 'm2',
            username: null,
            vorname: 'Max',
            nachname: 'Muster',
            status: 'mitglied',
            anrede: 'neutral',
          },
        },
      ]),
    );
    t.userAdmin.konten.mockResolvedValue(new Map([['m2', { username: 'max' } as Konto]]));
    const res = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', eventBody),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      betroffene: [{ dienstId: 'd1', schichtArt: 'betrieb', person: { username: 'max' } }],
    });
    // Confirmed updates pass `bestaetigt` on to the store.
    const ok = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', { ...eventBody, bestaetigt: true }),
    );
    expect(ok.status).toBe(200);
    expect(t.kalender.eventAktualisieren).toHaveBeenLastCalledWith(
      'e1',
      expect.objectContaining({ bestaetigt: true }),
    );
    t.kalender.eventAktualisieren.mockResolvedValueOnce(undefined);
    expect(
      (await t.app.request('/api/kalender/events/nope', json('admin-token', 'PUT', eventBody)))
        .status,
    ).toBe(404);
  });

  it('passes ersetzeSerie on to the store when updating', async () => {
    const t = makeApp();
    const res = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', { ...eventBody, ersetzeSerie: true }),
    );
    expect(res.status).toBe(200);
    expect(t.kalender.eventAktualisieren).toHaveBeenLastCalledWith(
      'e1',
      expect.objectContaining({ ersetzeSerie: true }),
    );
    const falsch = await t.app.request(
      '/api/kalender/events/e1',
      json('admin-token', 'PUT', { ...eventBody, ersetzeSerie: 'ja' }),
    );
    expect(falsch.status).toBe(400);
  });

  it('refuses to delete events with Dienste and cancels instead', async () => {
    const t = makeApp();
    t.kalender.eventLoeschen.mockRejectedValueOnce(new KalenderKonflikt('Das Event hat Dienste.'));
    expect(
      (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
    ).toBe(409);
    expect(
      (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
    ).toBe(200);
    t.kalender.eventLoeschen.mockResolvedValueOnce(false);
    expect(
      (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
    ).toBe(404);

    const absage = await t.app.request(
      '/api/kalender/events/e1/absage',
      json('vorstand-token', 'PUT', { abgesagt: true }),
    );
    expect(absage.status).toBe(200);
    expect(t.kalender.absageSetzen).toHaveBeenCalledWith('e1', true);
    expect(
      (await t.app.request('/api/kalender/events/e1/absage', json('admin-token', 'PUT', {})))
        .status,
    ).toBe(400);
  });

  it('lets every member enter themselves, Externe and other members with a profile', async () => {
    const t = makeApp();
    mitProfil(t);
    const post = (token: string, body: unknown) =>
      t.app.request('/api/kalender/schichten/s1/dienste', json(token, 'POST', body));

    expect((await post('member-token', { dienstformId: 'f1' })).status).toBe(201);
    expect(t.kalender.dienstEintragen).toHaveBeenLastCalledWith(
      's1',
      { dienstformId: 'f1', kommentar: null },
      'm2',
    );
    // Entering oneself explicitly is the same as the default.
    expect((await post('member-token', { dienstformId: 'f1', mitgliedSub: 'm2' })).status).toBe(
      201,
    );
    expect((await post('member-token', { dienstformId: 'f1', externId: 'x1' })).status).toBe(201);

    // Others may be entered by anybody (formerly only Verwalter).
    const fremd = await post('member-token', { dienstformId: 'f1', mitgliedSub: 'r' });
    expect(fremd.status).toBe(201);
    expect(t.kalender.dienstEintragen).toHaveBeenLastCalledWith(
      's1',
      { dienstformId: 'f1', kommentar: null, mitgliedSub: 'r' },
      'm2',
    );
    expect(t.kalender.dienstEintragen).toHaveBeenCalledTimes(4);
    // Entering a member who had declared themselves unavailable tells the UI the absage is gone.
    t.kalender.dienstEintragen.mockResolvedValueOnce({ id: 'd-neu', absageAufgehoben: true });
    const aufgehoben = await post('member-token', { dienstformId: 'f1' });
    expect(await aufgehoben.json()).toEqual({ id: 'd-neu', absageAufgehoben: true });
    t.kalender.dienstEintragen.mockResolvedValueOnce({ id: 'd-neu', absageAufgehoben: true });
    const fremdAufgehoben = await post('member-token', { dienstformId: 'f1', mitgliedSub: 'r' });
    expect(await fremdAufgehoben.json()).toEqual({ id: 'd-neu', absageAufgehoben: true });

    expect((await post('vorstand-token', { dienstformId: 'f1', mitgliedSub: 'r' })).status).toBe(
      201,
    );
    expect(t.kalender.dienstEintragen).toHaveBeenLastCalledWith(
      's1',
      { dienstformId: 'f1', kommentar: null, mitgliedSub: 'r' },
      'v',
    );
    expect(
      (await post('admin-token', { dienstformId: 'f1', mitgliedSub: 'r', externId: 'x1' })).status,
    ).toBe(400);
  });

  it('rejects entering a member without a profile row and callers without kalender:lesen', async () => {
    const t = makeApp();
    mitProfil(t);
    t.mitglieder.holen.mockImplementation(async (sub: string) =>
      sub === 'ohne'
        ? undefined
        : ({ sub, vorname: 'A', nachname: 'B', status: 'mitglied' } as MitgliedRow),
    );
    const res = await t.app.request(
      '/api/kalender/schichten/s1/dienste',
      json('member-token', 'POST', { dienstformId: 'f1', mitgliedSub: 'ohne' }),
    );
    expect(res.status).toBe(400);
    expect(t.kalender.dienstEintragen).not.toHaveBeenCalled();
    const ohneToken = await t.app.request('/api/kalender/schichten/s1/dienste', {
      method: 'POST',
    });
    expect(ohneToken.status).toBe(401);
  });

  it('maps the store rules of entering a Dienst to statuses', async () => {
    const t = makeApp();
    mitProfil(t);
    const post = () =>
      t.app.request(
        '/api/kalender/schichten/s1/dienste',
        json('member-token', 'POST', { dienstformId: 'f1' }),
      );
    t.kalender.dienstEintragen.mockRejectedValueOnce(
      new KalenderKonflikt('Das Event ist abgesagt.'),
    );
    expect((await post()).status).toBe(409);
    t.kalender.dienstEintragen.mockRejectedValueOnce(new KalenderUngueltig('Kein Bedarf.'));
    expect((await post()).status).toBe(400);
    t.kalender.dienstEintragen.mockResolvedValueOnce(undefined);
    expect((await post()).status).toBe(404);
  });

  it('requires a profile to enter Dienste or create Externe', async () => {
    const t = makeApp();
    const dienst = await t.app.request(
      '/api/kalender/schichten/s1/dienste',
      json('member-token', 'POST', { dienstformId: 'f1' }),
    );
    expect(dienst.status).toBe(400);
    const extern = await t.app.request(
      '/api/kalender/externe',
      json('member-token', 'POST', { name: 'Eva' }),
    );
    expect(extern.status).toBe(400);
    expect(t.kalender.dienstEintragen).not.toHaveBeenCalled();
    expect(t.kalender.externAnlegen).not.toHaveBeenCalled();
  });

  it('lets everyone create Externe, but archiving needs Einrichten', async () => {
    const t = makeApp();
    mitProfil(t);
    const res = await t.app.request(
      '/api/kalender/externe',
      json('member-token', 'POST', { name: 'Eva', quelle: 'StuK', archiviert: true }),
    );
    expect(res.status).toBe(201);
    expect(t.kalender.externAnlegen).toHaveBeenCalledWith(
      { name: 'Eva', quelle: 'StuK', kontakt: null, archiviert: false },
      'm2',
    );
    const merge = (token: string, body: unknown) =>
      t.app.request('/api/kalender/externe/zusammenfuehren', json(token, 'POST', body));
    expect((await merge('member-token', { zielId: 'x1', quelleIds: ['x2'] })).status).toBe(403);
    const ok = await merge('vorstand-token', { zielId: 'x1', quelleIds: ['x2'] });
    expect(await ok.json()).toEqual({ verschoben: 1, verworfen: 0 });
    expect((await merge('vorstand-token', { zielId: 'x1', quelleIds: ['x1'] })).status).toBe(400);
    expect((await merge('vorstand-token', { zielId: 'x9', quelleIds: ['x2'] })).status).toBe(404);
  });

  it('lets every member remove members, but Externe only the enterer or Verwalter', async () => {
    const t = makeApp();
    const entfernen = (token: string, id: string) =>
      t.app.request(`/api/kalender/dienste/${id}`, json(token, 'DELETE'));
    t.kalenderDienste.set(
      'eigen',
      dienstInfo({ id: 'eigen', mitgliedSub: 'm2', eingetragenVon: 'm2' }),
    );
    t.kalenderDienste.set(
      'fremd',
      dienstInfo({ id: 'fremd', mitgliedSub: 'r', eingetragenVon: 'r' }),
    );
    t.kalenderDienste.set(
      'von-mir',
      dienstInfo({ id: 'von-mir', mitgliedSub: 'r', eingetragenVon: 'm2' }),
    );
    t.kalenderDienste.set(
      'extern',
      dienstInfo({ id: 'extern', externId: 'x1', eingetragenVon: 'm2' }),
    );
    t.kalenderDienste.set(
      'extern2',
      dienstInfo({ id: 'extern2', externId: 'x1', eingetragenVon: 'm2' }),
    );

    expect((await entfernen('reader-token', 'extern')).status).toBe(403);
    expect((await entfernen('member-token', 'fremd')).status).toBe(200);
    expect((await entfernen('member-token', 'von-mir')).status).toBe(200);
    expect((await entfernen('member-token', 'eigen')).status).toBe(200);
    expect((await entfernen('member-token', 'extern')).status).toBe(200);
    expect((await entfernen('vorstand-token', 'extern2')).status).toBe(200);
    expect((await entfernen('vorstand-token', 'fremd')).status).toBe(404);
    expect(t.kalender.dienstEntfernen).toHaveBeenCalledTimes(5);
  });

  it('adds Cognito usernames to events and the Statistik', async () => {
    const t = makeApp();
    const person = {
      art: 'mitglied' as const,
      sub: 'm2',
      username: null,
      vorname: 'Max',
      nachname: 'Muster',
      status: 'mitglied' as const,
      anrede: 'neutral' as const,
    };
    t.userAdmin.konten.mockResolvedValue(new Map([['m2', { username: 'max' } as Konto]]));
    t.kalender.event.mockResolvedValueOnce({
      id: 'e1',
      titel: 'Offener Abend',
      anzeigeTitel: 'Offener Abend',
      beschreibung: null,
      kategorie: null,
      art: 'dienste' as const,
      dauer: 'eintaegig' as const,
      beginn: eventBody.beginn,
      ende: eventBody.ende,
      abgesagt: false,
      serie: null,
      bewertung: 'gruen',
      teilnahmeStatus: null,
      teilnahmen: [],
      ichNehmeTeil: null,
      meineTeilnahme: null,
      nichtVerfuegbar: [],
      ichBinNichtVerfuegbar: false,
      verantwortlich: person,
      imAbo: false,
      bilderOrdnerUrl: null,
      bilderOrdnerId: null,
      schichten: [
        {
          id: 's1',
          art: 'betrieb',
          beginn: eventBody.beginn,
          ende: eventBody.ende,
          bedarfe: [],
          minimum: null,
          wunsch: null,
          dienste: [
            { id: 'd1', dienstformId: 'f1', kommentar: null, eingetragenVon: 'm2', person },
            {
              id: 'd2',
              dienstformId: 'f1',
              kommentar: null,
              eingetragenVon: 'm2',
              person: { art: 'extern', id: 'x1', name: 'Eva', quelle: null },
            },
          ],
        },
      ],
    });
    const res = await t.app.request('/api/kalender/events/e1', json('reader-token', 'GET'));
    const body = (await res.json()) as {
      verantwortlich: unknown;
      schichten: { dienste: { person: unknown }[] }[];
    };
    expect(body.schichten[0]!.dienste[0]!.person).toMatchObject({ username: 'max' });
    expect(body.schichten[0]!.dienste[1]!.person).toMatchObject({ art: 'extern', name: 'Eva' });
    expect(body).toMatchObject({ verantwortlich: { sub: 'm2', username: 'max' } });

    t.kalender.statistik.mockResolvedValueOnce([{ person, gesamt: 2, nachSpalte: { f1: 2 } }]);
    const stat = await t.app.request(
      '/api/kalender/statistik?jahr=2026',
      json('reader-token', 'GET'),
    );
    expect(await stat.json()).toMatchObject({
      jahr: 2026,
      zeilen: [{ person: { username: 'max' } }],
    });
    expect(
      (await t.app.request('/api/kalender/statistik?jahr=abc', json('reader-token', 'GET'))).status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          '/api/kalender/events?von=2026-07-01&bis=2026-06-01',
          json('reader-token', 'GET'),
        )
      ).status,
    ).toBe(400);
  });

  it('manages Stammdaten for Einrichter', async () => {
    const t = makeApp();
    const form = await t.app.request(
      '/api/kalender/dienstformen',
      json('vorstand-token', 'POST', { name: 'Bar' }),
    );
    expect(form.status).toBe(201);
    expect(t.kalender.dienstformAnlegen).toHaveBeenCalledWith({ name: 'Bar' });
    expect(
      (
        await t.app.request(
          '/api/kalender/dienstformen/f9',
          json('vorstand-token', 'PUT', { name: 'X' }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await t.app.request(
          '/api/kalender/kategorien',
          json('vorstand-token', 'POST', { name: 'Konzert', farbe: 'red', art: 'dienste' }),
        )
      ).status,
    ).toBe(201);
    // Without a kind, or a Teilnahme Kategorie without default circle
    for (const body of [
      { name: 'Konzert', farbe: 'red' },
      { name: 'Plenum', farbe: 'red', art: 'teilnahme' },
    ]) {
      expect(
        (await t.app.request('/api/kalender/kategorien', json('vorstand-token', 'POST', body)))
          .status,
      ).toBe(400);
    }
    const plenum = {
      name: 'Plenum',
      farbe: 'red',
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
    };
    expect(
      (await t.app.request('/api/kalender/kategorien', json('vorstand-token', 'POST', plenum)))
        .status,
    ).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ art: 'teilnahme', teilnahmeStatus: ['mitglied'] }),
    );
    expect(
      (
        await t.app.request(
          '/api/kalender/kategorien',
          json('vorstand-token', 'POST', { name: 'Konzert' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await t.app.request('/api/kalender/vorlagen/v9', json('vorstand-token', 'DELETE'))).status,
    ).toBe(404);
    expect(
      (await t.app.request('/api/kalender/vorlagen/v1', json('vorstand-token', 'DELETE'))).status,
    ).toBe(200);
  });

  describe('Serien', () => {
    const serie = {
      name: 'Plenum',
      vorlageId: 'v1',
      regel: 'monatlich',
      wochentage: [2],
      wochen: [1],
      startDatum: '2026-11-01',
      endDatum: null,
    };

    it('creates a series and rejects invalid rules', async () => {
      const t = makeApp();
      const post = (body: unknown) =>
        t.app.request('/api/kalender/serien', json('vorstand-token', 'POST', body));
      expect((await post(serie)).status).toBe(201);
      expect(t.kalender.serieAnlegen).toHaveBeenCalledOnce();
      expect((await post({ ...serie, wochen: [] })).status).toBe(400);
      expect((await post({ ...serie, wochentage: [] })).status).toBe(400);
      expect((await post({ ...serie, endDatum: '2026-10-01' })).status).toBe(400);
      expect(t.kalender.serieAnlegen).toHaveBeenCalledOnce();
    });

    it('creates the due events right away and never fails the save because of it', async () => {
      const t = makeApp();
      t.kalender.serien.mockResolvedValue([
        {
          id: 'plenum',
          name: 'Plenum',
          vorlageId: 'v1',
          regel: 'woechentlich',
          wochentage: [0, 1, 2, 3, 4, 5, 6],
          wochen: [],
          startDatum: '2020-01-01',
          endDatum: null,
          aktiv: true,
        },
      ]);
      t.kalender.vorlagen.mockResolvedValue([
        {
          id: 'v1',
          titel: 'Plenum',
          beschreibung: null,
          kategorieId: 'k1',
          beginnZeit: '20:00',
          endeZeit: '22:00',
          teilnahmeStatus: null,
          tage: 1,
          bilderOrdner: false,
          archiviert: false,
          schichten: [],
        },
      ]);
      const post = await t.app.request(
        '/api/kalender/serien',
        json('vorstand-token', 'POST', serie),
      );
      expect(post.status).toBe(201);
      expect(await post.json()).toEqual({ id: 'plenum', erzeugt: 40 });
      expect(t.kalender.serienTerminAnlegen).toHaveBeenCalledTimes(40);
      const put = await t.app.request(
        '/api/kalender/serien/plenum',
        json('vorstand-token', 'PUT', serie),
      );
      expect(await put.json()).toMatchObject({ ok: true, erzeugt: 40 });
      const an = await t.app.request(
        '/api/kalender/serien/plenum/aktiv',
        json('vorstand-token', 'PUT', { aktiv: true }),
      );
      expect(await an.json()).toEqual({ aktiv: true, erzeugt: 40 });
      const aus = await t.app.request(
        '/api/kalender/serien/plenum/aktiv',
        json('vorstand-token', 'PUT', { aktiv: false }),
      );
      expect(await aus.json()).toEqual({ aktiv: false, erzeugt: 0 });
      // A failing generation is logged and the save still succeeds.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      t.kalender.serien.mockRejectedValue(new Error('db down'));
      const kaputt = await t.app.request(
        '/api/kalender/serien',
        json('vorstand-token', 'POST', serie),
      );
      expect(kaputt.status).toBe(201);
      expect(await kaputt.json()).toEqual({ id: 'plenum', erzeugt: 0 });
    });

    it('asks (409 with counts) before changing, then applies either variant', async () => {
      const t = makeApp();
      t.kalender.serieAktualisieren.mockRejectedValueOnce(new SerieBetroffen(5, 2));
      const put = (body: unknown, id = 'plenum') =>
        t.app.request(`/api/kalender/serien/${id}`, json('vorstand-token', 'PUT', body));
      const res = await put(serie);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ unveraendert: 5, angepasst: 2 });
      expect((await put({ ...serie, bestehende: 'anpassen' })).status).toBe(200);
      expect(t.kalender.serieAktualisieren).toHaveBeenLastCalledWith(
        'plenum',
        expect.objectContaining({ name: 'Plenum', wochen: [1] }),
        'anpassen',
      );
      expect((await put({ ...serie, bestehende: 'behalten' })).status).toBe(200);
      expect(t.kalender.serieAktualisieren).toHaveBeenLastCalledWith(
        'plenum',
        expect.anything(),
        'behalten',
      );
      expect((await put({ ...serie, bestehende: 'alles' })).status).toBe(400);
      expect((await put(serie, 'x')).status).toBe(404);
    });

    it('asks before turning off or deleting, with both variants', async () => {
      const t = makeApp();
      t.kalender.serieAktivSetzen.mockRejectedValueOnce(new SerieBetroffen(3, 0));
      t.kalender.serieLoeschen.mockRejectedValueOnce(new SerieBetroffen(3, 1));
      const aktiv = (body: unknown) =>
        t.app.request('/api/kalender/serien/plenum/aktiv', json('vorstand-token', 'PUT', body));
      const loeschen = (query = '') =>
        t.app.request(`/api/kalender/serien/plenum${query}`, json('vorstand-token', 'DELETE'));
      expect((await aktiv({ aktiv: false })).status).toBe(409);
      expect((await aktiv({ aktiv: false, bestehende: 'anpassen' })).status).toBe(200);
      expect(t.kalender.serieAktivSetzen).toHaveBeenLastCalledWith('plenum', false, 'anpassen');
      expect((await loeschen()).status).toBe(409);
      expect((await loeschen('?bestehende=behalten')).status).toBe(200);
      expect(t.kalender.serieLoeschen).toHaveBeenLastCalledWith('plenum', 'behalten');
      expect((await loeschen('?bestehende=anpassen')).status).toBe(200);
      expect(t.kalender.serieLoeschen).toHaveBeenLastCalledWith('plenum', 'anpassen');
      expect((await loeschen('?bestehende=x')).status).toBe(400);
    });
  });

  it('reads and replaces the global reminders', async () => {
    const t = makeApp();
    const put = (body: unknown) =>
      t.app.request('/api/kalender/erinnerungen', json('vorstand-token', 'PUT', body));
    expect(
      await (await t.app.request('/api/kalender/erinnerungen', json('reader-token', 'GET'))).json(),
    ).toEqual({ minutenVorher: [10080, 2880, 1440] });
    for (const bad of [[], [14], [43201], [60, 60], Array.from({ length: 21 }, (_, i) => 15 + i)]) {
      expect((await put({ minutenVorher: bad })).status).toBe(400);
    }
    expect(t.kalender.erinnerungenSetzen).not.toHaveBeenCalled();
    expect((await put({ minutenVorher: [180, 2880] })).status).toBe(200);
    expect(t.kalender.erinnerungenSetzen).toHaveBeenCalledWith([180, 2880]);
  });

  it('manages the feed token: lesen right, profile row needed, only the hash is stored', async () => {
    const t = makeApp();
    mitProfil(t);
    const get = () => t.app.request('/api/me/kalender-token', json('reader-token', 'GET'));
    expect(await (await get()).json()).toEqual({ vorhanden: false });
    const res = await t.app.request('/api/me/kalender-token', json('reader-token', 'POST'));
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(token).toBe('tok-1');
    expect(await (await get()).json()).toEqual({ vorhanden: true });
    // A new token replaces the old one.
    const neu = (await (
      await t.app.request('/api/me/kalender-token', json('reader-token', 'POST'))
    ).json()) as { token: string };
    expect(neu.token).not.toBe(token);
    expect(await t.kalender.subPerTokenHash(tokenHash(token))).toBeUndefined();
    expect(await t.kalender.subPerTokenHash(tokenHash(neu.token))).toBe('r');
    expect((await t.app.request('/api/me/kalender-token')).status).toBe(401);
    // Without a profile row there is nothing to attach the token to.
    const ohne = makeApp();
    expect(
      (await ohne.app.request('/api/me/kalender-token', json('reader-token', 'POST'))).status,
    ).toBe(404);
  });

  it('serves the feed without authorization and 404s for unknown tokens', async () => {
    const t = makeApp(undefined, 'https://c4.example');
    t.kalender.meineDienste.mockResolvedValue([
      {
        id: 'd1',
        eventId: 'e1',
        eventTitel: 'Offener Abend',
        schichtArt: 'betrieb',
        dienstformName: 'Bardienst',
        beginn: '2026-06-05T17:00:00.000Z',
        ende: '2026-06-05T21:00:00.000Z',
        abgesagt: true,
      },
    ]);
    const token = await t.kalender.tokenErzeugen('r');
    for (const url of [`/api/kalender/feed/${token}`, `/api/kalender/feed/${token}.ics`]) {
      const res = await t.app.request(url);
      expect(res.status, url).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
      expect(res.headers.get('cache-control')).toBe('no-store');
      const ics = await res.text();
      expect(ics).toContain('SUMMARY:Bardienst · Offener Abend');
      expect(ics).toContain('STATUS:CANCELLED');
      expect(ics).toContain('X-WR-CALNAME:C4 – Mein Kalender');
      expect(ics).toContain('https://c4.example/app/kalender/events/e1');
    }
    const [sub, ab] = t.kalender.meineDienste.mock.calls[0]!;
    expect(sub).toBe('r');
    const tage = (Date.now() - ab.getTime()) / 86_400_000;
    expect(tage).toBeGreaterThan(89.9);
    expect(tage).toBeLessThan(90.1);
    expect((await t.app.request('/api/kalender/feed/unbekannt.ics')).status).toBe(404);
  });

  it('404s the feed for a deactivated member or one without the calendar right', async () => {
    const t = makeApp();
    const token = await t.kalender.tokenErzeugen('r');
    expect((await t.app.request(`/api/kalender/feed/${token}`)).status).toBe(200);
    await t.mitglieder.speichern('r', {
      vorname: 'A',
      nachname: 'B',
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
    });
    expect((await t.app.request(`/api/kalender/feed/${token}`)).status).toBe(200);
    await t.mitglieder.deaktiviertSetzen('r', true);
    const res = await t.app.request(`/api/kalender/feed/${token}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Kalender nicht gefunden' });
    await t.mitglieder.deaktiviertSetzen('r', false);
    expect((await t.app.request(`/api/kalender/feed/${token}`)).status).toBe(200);
  });

  it('puts participation and subscribed events into the feed next to the Dienste', async () => {
    const t = makeApp(undefined, 'https://c4.example');
    t.kalender.meineEvents.mockResolvedValue([
      {
        id: 'e2',
        titel: 'Plenum',
        beschreibung: null,
        beginn: '2026-06-06T17:00:00.000Z',
        ende: '2026-06-06T19:00:00.000Z',
        abgesagt: false,
      },
    ]);
    const token = await t.kalender.tokenErzeugen('r');
    const ics = await (await t.app.request(`/api/kalender/feed/${token}`)).text();
    expect(ics).toContain('UID:event-e2@c4-leipzig.de');
    expect(ics).toContain('DTSTART:20260606T170000Z');
    expect(ics).toContain('SUMMARY:Plenum');
    expect(t.kalender.meineEvents).toHaveBeenCalledWith('r', expect.any(Date));
  });

  it('removes the one-off Dienste download route', async () => {
    const t = makeApp();
    expect((await t.app.request('/api/me/dienste', json('reader-token', 'GET'))).status).toBe(404);
  });

  describe('Teilnahme und Event-Abo', () => {
    it('lets everyone change only their own participation, with a profile row', async () => {
      const t = makeApp();
      const put = (token: string, body: unknown) =>
        t.app.request('/api/kalender/events/e1/teilnahme', json(token, 'PUT', body));
      expect((await put('reader-token', { teilnahme: false })).status).toBe(400);
      mitProfil(t);
      const res = await put('reader-token', { teilnahme: false });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ teilnahme: false });
      expect(t.kalender.teilnahmeSetzen).toHaveBeenCalledWith('e1', 'r', false);
      expect((await put('reader-token', { teilnahme: 'ja' })).status).toBe(400);
      expect(
        (await t.app.request('/api/kalender/events/e1/teilnahme', { method: 'PUT' })).status,
      ).toBe(401);
    });

    it('maps missing events and conflicts', async () => {
      const t = makeApp();
      mitProfil(t);
      const put = () =>
        t.app.request(
          '/api/kalender/events/e1/teilnahme',
          json('reader-token', 'PUT', { teilnahme: true }),
        );
      t.kalender.teilnahmeSetzen.mockResolvedValueOnce(undefined);
      expect((await put()).status).toBe(404);
      t.kalender.teilnahmeSetzen.mockRejectedValueOnce(
        new KalenderKonflikt('Das Event ist abgesagt.'),
      );
      expect((await put()).status).toBe(409);
    });

    it('stores an absage for a Teilnahme event even outside the circle', async () => {
      const t = makeApp();
      mitProfil(t);
      const res = await t.app.request(
        '/api/kalender/events/e1/teilnahme',
        json('reader-token', 'PUT', { teilnahme: false }),
      );
      expect(res.status).toBe(200);
      expect(t.kalender.teilnahmeSetzen).toHaveBeenCalledWith('e1', 'r', false);
    });

    it('lets everyone set only their own availability, with a profile row', async () => {
      const t = makeApp();
      const put = (token: string, body: unknown) =>
        t.app.request('/api/kalender/events/e1/verfuegbarkeit', json(token, 'PUT', body));
      expect((await put('reader-token', { verfuegbar: false })).status).toBe(400);
      mitProfil(t);
      const res = await put('reader-token', { verfuegbar: false });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ verfuegbar: false });
      expect(t.kalender.verfuegbarkeitSetzen).toHaveBeenLastCalledWith('e1', 'r', false, false);
      await put('reader-token', { verfuegbar: false, bestaetigt: true });
      expect(t.kalender.verfuegbarkeitSetzen).toHaveBeenLastCalledWith('e1', 'r', false, true);
      await put('reader-token', { verfuegbar: true });
      expect(t.kalender.verfuegbarkeitSetzen).toHaveBeenLastCalledWith('e1', 'r', true, false);
      expect((await put('reader-token', { verfuegbar: 'ja' })).status).toBe(400);
      expect((await put('reader-token', {})).status).toBe(400);
      expect(
        (await t.app.request('/api/kalender/events/e1/verfuegbarkeit', { method: 'PUT' })).status,
      ).toBe(401);
    });

    it('asks for confirmation when the absage would remove own Dienste', async () => {
      const t = makeApp();
      mitProfil(t);
      const put = (body: unknown) =>
        t.app.request('/api/kalender/events/e1/verfuegbarkeit', json('reader-token', 'PUT', body));
      t.kalender.verfuegbarkeitSetzen.mockRejectedValueOnce(new VerfuegbarkeitBestaetigen(2));
      const res = await put({ verfuegbar: false });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error:
          'Du bist für 2 Dienste eingetragen. Wenn du dich als nicht verfügbar meldest, wirst du ausgetragen.',
        dienste: 2,
      });
      // Confirmed: the store removes the Dienste and stores the absage.
      expect((await put({ verfuegbar: false, bestaetigt: true })).status).toBe(200);
    });

    it('maps missing events and conflicts of the availability', async () => {
      const t = makeApp();
      mitProfil(t);
      const put = () =>
        t.app.request(
          '/api/kalender/events/e1/verfuegbarkeit',
          json('reader-token', 'PUT', { verfuegbar: false }),
        );
      t.kalender.verfuegbarkeitSetzen.mockResolvedValueOnce(undefined);
      expect((await put()).status).toBe(404);
      t.kalender.verfuegbarkeitSetzen.mockRejectedValueOnce(
        new KalenderKonflikt('Das Event ist abgesagt.'),
      );
      expect((await put()).status).toBe(409);
      t.kalender.verfuegbarkeitSetzen.mockRejectedValueOnce(
        new KalenderKonflikt('Bei Events mit Teilnahme …'),
      );
      expect((await put()).status).toBe(409);
    });

    it('adds and removes an event in the own feed', async () => {
      const t = makeApp();
      mitProfil(t);
      const put = await t.app.request('/api/kalender/events/e1/abo', json('reader-token', 'PUT'));
      expect(await put.json()).toEqual({ imAbo: true });
      expect(t.kalender.eventAboSetzen).toHaveBeenLastCalledWith('e1', 'r', true);
      const del = await t.app.request(
        '/api/kalender/events/e1/abo',
        json('reader-token', 'DELETE'),
      );
      expect(await del.json()).toEqual({ imAbo: false });
      expect(t.kalender.eventAboSetzen).toHaveBeenLastCalledWith('e1', 'r', false);
      t.kalender.eventAboSetzen.mockResolvedValueOnce(false);
      expect(
        (await t.app.request('/api/kalender/events/x/abo', json('reader-token', 'DELETE'))).status,
      ).toBe(404);
    });

    it('passes the caller to the event reads and adds usernames to the list', async () => {
      const t = makeApp();
      t.userAdmin.konten.mockResolvedValue(new Map([['m2', { username: 'max' } as Konto]]));
      const einEvent = {
        id: 'e1',
        titel: 'Plenum',
        anzeigeTitel: 'Plenum',
        beschreibung: null,
        kategorie: null,
        art: 'dienste' as const,
        dauer: 'eintaegig' as const,
        beginn: eventBody.beginn,
        ende: eventBody.ende,
        abgesagt: false,
        serie: null,
        bewertung: 'gruen' as const,
        schichten: [],
        teilnahmeStatus: ['mitglied' as const],
        teilnahmen: [
          {
            person: {
              art: 'mitglied' as const,
              sub: 'm2',
              username: null,
              vorname: 'Max',
              nachname: 'Muster',
              status: 'mitglied' as const,
              anrede: 'neutral' as const,
            },
            zustand: 'teilnahme' as const,
            eingeladen: false,
          },
        ],
        ichNehmeTeil: true,
        meineTeilnahme: 'teilnahme' as const,
        nichtVerfuegbar: [],
        ichBinNichtVerfuegbar: false,
        verantwortlich: null,
        imAbo: false,
        bilderOrdnerUrl: null,
        bilderOrdnerId: null,
      };
      t.kalender.event.mockResolvedValueOnce(einEvent);
      const res = await t.app.request('/api/kalender/events/e1', json('reader-token', 'GET'));
      expect(t.kalender.event).toHaveBeenCalledWith('e1', 'r');
      expect(((await res.json()) as typeof einEvent).teilnahmen[0]!.person.username).toBe('max');
      await t.app.request(
        '/api/kalender/events?von=2026-06-01&bis=2026-06-30',
        json('reader-token', 'GET'),
      );
      expect(t.kalender.events).toHaveBeenCalledWith('2026-06-01', '2026-06-30', 'r');
    });

    it('accepts the circle and invitations on create', async () => {
      const t = makeApp();
      const res = await t.app.request(
        '/api/kalender/events',
        json('vorstand-token', 'POST', {
          ...eventBody,
          teilnahmeStatus: ['em'],
          eingeladen: ['m2'],
        }),
      );
      expect(res.status).toBe(201);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({ teilnahmeStatus: ['em'], eingeladen: ['m2'] }),
        expect.any(String),
      );
      expect(
        (
          await t.app.request(
            '/api/kalender/events',
            json('vorstand-token', 'POST', { ...eventBody, teilnahmeStatus: ['chef'] }),
          )
        ).status,
      ).toBe(400);
    });
  });

  describe('push notifications', () => {
    const abo = (endpoint: string) => ({
      endpoint,
      keys: { p256dh: 'p', auth: 'a' },
    });
    const ereignis = (id: string, beginn: string) => ({
      id,
      titel: 'Offener Abend',
      anzeigeTitel: 'Offener Abend',
      beschreibung: null,
      kategorie: null,
      art: 'dienste' as const,
      dauer: 'eintaegig' as const,
      beginn,
      ende: '2026-10-23T22:00:00.000Z',
      abgesagt: false,
      serie: null,
      bewertung: 'gruen' as const,
      schichten: [],
      teilnahmeStatus: null,
      teilnahmen: [],
      ichNehmeTeil: null,
      meineTeilnahme: null,
      nichtVerfuegbar: [],
      ichBinNichtVerfuegbar: false,
      verantwortlich: null,
      imAbo: false,
      bilderOrdnerUrl: null,
      bilderOrdnerId: null,
    });

    it("serves the public key and manages the caller's subscriptions", async () => {
      const t = makeApp();
      mitProfil(t);
      expect((await t.app.request('/api/push/schluessel')).status).toBe(401);
      const key = await t.app.request('/api/push/schluessel', json('member-token', 'GET'));
      expect(await key.json()).toEqual({ publicKey: 'public-key' });

      const post = (body: unknown) =>
        t.app.request('/api/push/abos', json('member-token', 'POST', body));
      expect((await post({ endpoint: 'kaputt', keys: { p256dh: 'p', auth: 'a' } })).status).toBe(
        400,
      );
      expect((await post(abo('https://push.example/1'))).status).toBe(201);
      expect((await post(abo('https://push.example/1'))).status).toBe(201);
      expect(t.push.abos).toHaveLength(1);
      expect(t.push.abos[0]).toMatchObject({
        mitgliedSub: 'm2',
        endpoint: 'https://push.example/1',
      });

      const del = (token: string) =>
        t.app.request(
          '/api/push/abos',
          json(token, 'DELETE', { endpoint: 'https://push.example/1' }),
        );
      await del('reader-token');
      expect(t.push.abos).toHaveLength(1);
      expect((await del('member-token')).status).toBe(200);
      expect(t.push.abos).toHaveLength(0);
    });

    it('reports whether an endpoint is registered for the caller', async () => {
      const t = makeApp();
      mitProfil(t);
      const url = 'https://push.example/1';
      const status = (token: string) =>
        t.app.request(
          `/api/push/abos/status?endpoint=${encodeURIComponent(url)}`,
          json(token, 'GET'),
        );
      expect((await status('member-token')).status).toBe(200);
      expect(await (await status('member-token')).json()).toEqual({ registriert: false });
      await t.push.store.aboSpeichern('m2', abo(url));
      expect(await (await status('member-token')).json()).toEqual({ registriert: true });
      // Another member's endpoint does not count.
      expect(await (await status('reader-token')).json()).toEqual({ registriert: false });
      expect(
        (await t.app.request('/api/push/abos/status', json('member-token', 'GET'))).status,
      ).toBe(400);
    });

    it('sends a test message to the own devices and reports the result', async () => {
      const t = makeApp();
      mitProfil(t);
      const test = (token: string) => t.app.request('/api/push/test', json(token, 'POST'));
      expect((await t.app.request('/api/push/test', { method: 'POST' })).status).toBe(401);
      expect(await (await test('member-token')).json()).toEqual({ geraete: 0, ok: 0, fehler: 0 });
      await t.push.store.aboSpeichern('m2', abo('https://push.example/1'));
      expect(await (await test('member-token')).json()).toEqual({ geraete: 1, ok: 1, fehler: 0 });
    });

    it('needs a profile for subscriptions and settings', async () => {
      const t = makeApp();
      const res = await t.app.request(
        '/api/push/abos',
        json('member-token', 'POST', abo('https://push.example/1')),
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(t.push.abos).toHaveLength(0);
    });

    it('lists all types with defaults and stores changes', async () => {
      const t = makeApp();
      t.pushMitglieder.find((m) => m.sub === 'm2')!.status = 'em';
      const lesen = async () =>
        (await (
          await t.app.request('/api/me/benachrichtigungen', json('member-token', 'GET'))
        ).json()) as {
          art: string;
          aktiv: boolean;
          minuten: number | null;
          minutenOptionen: number[] | null;
        }[];
      const anfang = await lesen();
      expect(anfang.map((e) => e.art)).toEqual([
        'kalender.erinnerung',
        'kalender.fehlende_dienste',
        'kalender.aenderung',
        'kalender.teilnahme_erinnerung',
        'geburtstag.erinnerung',
        'schluessel.uebergabe',
        'schluessel.bedarf',
        'schluessel.abgabe',
        'schluessel.antwort',
        'schluessel.planung',
        'umfrage.neu',
        'umfrage.erinnerung',
        'umfrage.termin',
        'umfrage.erneut_abstimmen',
        'todo.frist',
        'privatpartys.anfrage',
        'privatpartys.nachricht',
      ]);
      expect(anfang[5]).toMatchObject({ aktiv: true, abschaltbar: false });
      expect(
        (
          await t.app.request(
            '/api/me/benachrichtigungen',
            json('member-token', 'PUT', { art: 'schluessel.uebergabe', aktiv: false }),
          )
        ).status,
      ).toBe(400);
      expect(anfang[4]).toMatchObject({
        aktiv: true,
        minuten: 0,
        minutenOptionen: [0, 1440, 2880, 4320, 7200, 10080],
      });
      // 0 (on the day) is a valid, storable lead time.
      expect(
        (
          await t.app.request(
            '/api/me/benachrichtigungen',
            json('member-token', 'PUT', {
              art: 'geburtstag.erinnerung',
              aktiv: true,
              minuten: 1440,
            }),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await t.app.request(
            '/api/me/benachrichtigungen',
            json('member-token', 'PUT', { art: 'geburtstag.erinnerung', aktiv: true, minuten: 0 }),
          )
        ).status,
      ).toBe(200);
      expect((await lesen())[4]).toMatchObject({ aktiv: true, minuten: 0 });
      expect(anfang[0]).toMatchObject({
        aktiv: true,
        minuten: 30,
        minutenOptionen: [15, 30, 60, 120, 1440],
      });
      expect(anfang[1]).toMatchObject({ aktiv: false, minuten: null, minutenOptionen: null });

      const put = (body: unknown) =>
        t.app.request('/api/me/benachrichtigungen', json('member-token', 'PUT', body));
      expect((await put({ art: 'kalender.erinnerung', aktiv: true, minuten: 60 })).status).toBe(
        200,
      );
      expect((await put({ art: 'kalender.fehlende_dienste', aktiv: true })).status).toBe(200);
      // Switching off keeps the chosen minutes.
      expect((await put({ art: 'kalender.erinnerung', aktiv: false })).status).toBe(200);
      const danach = await lesen();
      expect(danach[0]).toMatchObject({ aktiv: false, minuten: 60 });
      expect(danach[1]).toMatchObject({ aktiv: true });

      expect((await put({ art: 'kalender.erinnerung', aktiv: true, minuten: 7 })).status).toBe(400);
      expect((await put({ art: 'kalender.aenderung', aktiv: true, minuten: 15 })).status).toBe(400);
      expect((await put({ art: 'gibt.es.nicht', aktiv: true })).status).toBe(400);
      expect((await t.app.request('/api/me/benachrichtigungen', { method: 'GET' })).status).toBe(
        401,
      );
    });

    describe('notification history', () => {
      const base = '/api/me/benachrichtigungen/verlauf';
      const eintragen = (t: ReturnType<typeof makeApp>, sub: string, art: string, titel: string) =>
        t.push.store.verlaufEintragen([
          { sub, art, titel, text: 'x', url: '/app/x', schluessel: null },
        ]);

      it('lists with filters and pagination, newest first', async () => {
        const t = makeApp();
        mitProfil(t);
        for (let i = 1; i <= 31; i++) await eintragen(t, 'm2', 'umfrage.neu', `U${i}`);
        await eintragen(t, 'm2', 'kalender.aenderung', 'K1');
        await eintragen(t, 'a', 'umfrage.neu', 'fremd');
        const get = async (query = '') =>
          (await t.app.request(`${base}${query}`, json('member-token', 'GET'))).json() as Promise<{
            eintraege: { id: string; titel: string; gelesen: boolean }[];
            weiter: string | null;
          }>;
        const seite1 = await get();
        expect(seite1.eintraege).toHaveLength(30);
        expect(seite1.eintraege[0]!.titel).toBe('K1');
        expect(seite1.weiter).not.toBeNull();
        const seite2 = await get(`?vor=${encodeURIComponent(seite1.weiter!)}`);
        expect(seite2.eintraege.map((e) => e.titel)).toEqual(['U2', 'U1']);
        expect(seite2.weiter).toBeNull();

        expect((await get('?art=kalender.aenderung')).eintraege).toHaveLength(1);
        expect((await get('?bereich=umfrage')).eintraege).toHaveLength(30);
        const res = await t.app.request(`${base}?art=gibt.es.nicht`, json('member-token', 'GET'));
        expect(res.status).toBe(400);

        const erste = seite1.eintraege[0]!.id;
        await t.app.request(`${base}/${erste}/gelesen`, json('member-token', 'POST'));
        const ungelesen = await get('?ungelesen=true&bereich=kalender');
        expect(ungelesen.eintraege).toHaveLength(0);
        expect((await t.app.request(base, { method: 'GET' })).status).toBe(401);
      });

      it('returns 404 for a foreign or unknown id and 204 for an own one', async () => {
        const t = makeApp();
        mitProfil(t);
        const fremd = (await eintragen(t, 'a', 'umfrage.neu', 'fremd')).get('a')!;
        const eigen = (await eintragen(t, 'm2', 'umfrage.neu', 'eigen')).get('m2')!;
        const post = (id: string) =>
          t.app.request(`${base}/${id}/gelesen`, json('member-token', 'POST'));
        expect((await post(fremd)).status).toBe(404);
        expect((await post('unbekannt')).status).toBe(404);
        expect((await post(eigen)).status).toBe(204);
        expect(await t.push.store.verlaufUngelesen('a')).toBe(1);
      });

      it('counts unread entries and marks all matching the filter as read', async () => {
        const t = makeApp();
        mitProfil(t);
        await eintragen(t, 'm2', 'umfrage.neu', 'U1');
        await eintragen(t, 'm2', 'umfrage.erinnerung', 'U2');
        await eintragen(t, 'm2', 'kalender.aenderung', 'K1');
        const anzahl = async () =>
          (
            (await (
              await t.app.request(`${base}/ungelesen`, json('member-token', 'GET'))
            ).json()) as { anzahl: number }
          ).anzahl;
        expect(await anzahl()).toBe(3);
        const alle = (body: unknown) =>
          t.app.request(`${base}/gelesen`, json('member-token', 'POST', body));
        expect((await alle({ bereich: 'umfrage' })).status).toBe(204);
        expect(await anzahl()).toBe(1);
        expect((await alle({ art: 'gibt.es.nicht' })).status).toBe(400);
        expect((await alle({})).status).toBe(204);
        expect(await anzahl()).toBe(0);
      });
    });

    it('notifies a removed member, but not the person who removed themself', async () => {
      const t = makeApp();
      mitProfil(t);
      t.userAdmin.konten.mockResolvedValue(new Map([['v', { username: 'leonard' } as Konto]]));
      await t.push.store.aboSpeichern('r', {
        endpoint: 'https://push.example/r',
        keys: { p256dh: 'p', auth: 'a' },
      });
      t.kalenderDienste.set(
        'd-r',
        dienstInfo({ id: 'd-r', mitgliedSub: 'r', eingetragenVon: 'r' }),
      );
      t.kalenderDienste.set(
        'd-r2',
        dienstInfo({ id: 'd-r2', mitgliedSub: 'r', eingetragenVon: 'r' }),
      );

      expect(
        (await t.app.request('/api/kalender/dienste/d-r', json('reader-token', 'DELETE'))).status,
      ).toBe(200);
      expect(t.gesendet).toHaveLength(0);

      expect(
        (await t.app.request('/api/kalender/dienste/d-r2', json('vorstand-token', 'DELETE')))
          .status,
      ).toBe(200);
      expect(t.gesendet).toEqual([
        {
          endpoint: 'https://push.example/r',
          titel: 'Du wurdest ausgetragen',
          text: 'leonard hat dich aus der 19-Uhr-Schicht bei „Offener Abend“ am 05.06. ausgetragen.',
          url: '/app/kalender/events/e1',
        },
      ]);
    });

    it('notifies a member entered by somebody else (username, else Vorname), not oneself', async () => {
      const t = makeApp();
      mitProfil(t);
      await t.push.store.aboSpeichern('r', {
        endpoint: 'https://push.example/r',
        keys: { p256dh: 'p', auth: 'a' },
      });
      const eintragen = (token: string, body: unknown) =>
        t.app.request('/api/kalender/schichten/s1/dienste', json(token, 'POST', body));
      t.kalenderDienste.set(
        'd-neu',
        dienstInfo({ id: 'd-neu', mitgliedSub: 'r', schichtArt: 'aufbau', dienstformId: null }),
      );

      // Without a username the actor's Vorname is used.
      expect(
        (await eintragen('member-token', { dienstformId: 'f1', mitgliedSub: 'r' })).status,
      ).toBe(201);
      expect(t.gesendet).toEqual([
        {
          endpoint: 'https://push.example/r',
          titel: 'Du wurdest eingetragen',
          text: 'A hat dich für den Aufbau bei „Offener Abend“ am 05.06. eingetragen.',
          url: '/app/kalender/events/e1',
        },
      ]);

      // Entering oneself or an Externe sends nothing.
      t.gesendet.length = 0;
      await eintragen('reader-token', { dienstformId: 'f1', mitgliedSub: 'r' });
      await eintragen('reader-token', { dienstformId: 'f1' });
      await eintragen('reader-token', { dienstformId: 'f1', externId: 'x1' });
      expect(t.gesendet).toHaveLength(0);
    });

    it('notifies Dienst holders about a cancellation, except the actor', async () => {
      const t = makeApp();
      for (const sub of ['r', 'v']) {
        await t.push.store.aboSpeichern(sub, {
          endpoint: `https://push.example/${sub}`,
          keys: { p256dh: 'p', auth: 'a' },
        });
      }
      t.kalender.absageSetzen.mockResolvedValueOnce({
        geaendert: true,
        mitgliedSubs: ['r', 'v'],
        teilnehmerSubs: [],
      });
      t.kalender.event.mockResolvedValueOnce(ereignis('e1', '2026-10-23T18:00:00.000Z'));
      const res = await t.app.request(
        '/api/kalender/events/e1/absage',
        json('vorstand-token', 'PUT', { abgesagt: true }),
      );
      expect(res.status).toBe(200);
      expect(t.gesendet.map((g) => g.endpoint)).toEqual(['https://push.example/r']);
      expect(t.gesendet[0]).toMatchObject({ titel: 'Event abgesagt' });
      expect(t.gesendet[0]!.text).toContain('Fr, 23.10.');

      // Unchanged state: nothing is sent.
      t.gesendet.length = 0;
      t.kalender.absageSetzen.mockResolvedValueOnce({
        geaendert: false,
        mitgliedSubs: ['r'],
        teilnehmerSubs: [],
      });
      await t.app.request(
        '/api/kalender/events/e1/absage',
        json('vorstand-token', 'PUT', { abgesagt: true }),
      );
      expect(t.gesendet).toHaveLength(0);
    });

    it('notifies about a moved event and survives push failures', async () => {
      const t = makeApp();
      await t.push.store.aboSpeichern('r', {
        endpoint: 'https://push.example/r',
        keys: { p256dh: 'p', auth: 'a' },
      });
      t.kalender.eventAktualisieren.mockResolvedValueOnce({
        zeitGeaendert: true,
        geaenderteSchichten: [],
        entfernteDienste: [],
        mitgliedSubs: ['r', 'v'],
        teilnehmerSubs: [],
        verantwortlichNeu: null,
      });
      t.kalender.event.mockResolvedValueOnce(ereignis('e1', '2026-10-23T18:00:00.000Z'));
      t.pushErgebnis.wert = 'fehler';
      const res = await t.app.request(
        '/api/kalender/events/e1',
        json('vorstand-token', 'PUT', eventBody),
      );
      expect(res.status).toBe(200);
      expect(t.gesendet).toHaveLength(1);
      expect(t.gesendet[0]).toMatchObject({ titel: 'Event verschoben' });
      expect(t.gesendet[0]!.text).toContain('um 20:00 Uhr');
    });
  });
});

describe('kalender: Geburtstage', () => {
  const get = (app: ReturnType<typeof makeApp>['app'], query: string, token = 'reader-token') =>
    app.request(`/api/kalender/geburtstage${query}`, { headers: bearer(token) });
  const profil = (extra: Partial<MitgliedDaten>): MitgliedDaten => ({
    vorname: 'Eva',
    nachname: 'Muster',
    anrede: 'weiblich',
    kontaktkanaele: null,
    discordName: null,
    adresse: null,
    telefon: null,
    ueberMich: null,
    profilbildKey: null,
    geburtsdatum: null,
    geburtstagImKalender: null,
    wohnheim: null,
    ...extra,
  });

  it('requires authentication', async () => {
    expect((await makeApp().app.request('/api/kalender/geburtstage')).status).toBe(401);
  });

  it('lists visible birthdays in the range with age and username', async () => {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map([['m1', { sub: 'm1', username: 'eva' } as Konto]]),
    );
    await t.mitglieder.speichern('m1', profil({ geburtsdatum: '1990-06-20' }));
    await t.mitglieder.speichern(
      'm3',
      profil({ vorname: 'Max', geburtsdatum: '1985-06-10', geburtstagImKalender: true }),
    );
    await t.mitglieder.speichern(
      'm4',
      profil({ vorname: 'Hidden', geburtsdatum: '1985-06-12', geburtstagImKalender: false }),
    );
    await t.mitglieder.speichern('m5', profil({ vorname: 'Ohne' }));
    const res = await get(t.app, '?von=2026-06-01&bis=2026-06-30');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        datum: '2026-06-10',
        alter: 41,
        mitglied: {
          sub: 'm3',
          username: null,
          vorname: 'Max',
          nachname: 'Muster',
          status: 'anwaerter',
          anrede: 'weiblich',
        },
      },
      {
        datum: '2026-06-20',
        alter: 36,
        mitglied: {
          sub: 'm1',
          username: 'eva',
          vorname: 'Eva',
          nachname: 'Muster',
          status: 'anwaerter',
          anrede: 'weiblich',
        },
      },
    ]);
  });

  it('includes the own hidden birthday never: hidden from the calendar even though the profile shows it', async () => {
    const t = makeApp();
    await t.mitglieder.speichern(
      'r',
      profil({ geburtsdatum: '1990-06-20', geburtstagImKalender: false }),
    );
    expect(await (await get(t.app, '?von=2026-06-01&bis=2026-06-30')).json()).toEqual([]);
  });

  it('validates the range', async () => {
    const { app } = makeApp();
    expect((await get(app, '')).status).toBe(400);
    expect((await get(app, '?von=2026-06-01&bis=2026-06-31')).status).toBe(400);
    expect((await get(app, '?von=2026-06-10&bis=2026-06-01')).status).toBe(400);
    expect((await get(app, '?von=2026-01-01&bis=2027-02-05')).status).toBe(200);
    expect((await get(app, '?von=2026-01-01&bis=2027-02-06')).status).toBe(400);
  });
});

describe('schluessel', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const mitglied = (sub: string) => ({ art: 'mitglied', sub }) as const;

  /** App with profiles for a, r, v, m2 (usernames = sub), push devices for all and one key at `r`. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
      await t.push.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      });
    }
    const res = await t.app.request(
      '/api/schluessel',
      json('admin-token', 'POST', { name: 'Haupttür', halter: mitglied('r') }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    t.gesendet.length = 0;
    const uebergeben = (token: string, body: unknown) =>
      t.app.request(`/api/schluessel/${id}/uebergaben`, json(token, 'POST', body));
    return { ...t, id, uebergeben };
  }

  it('lets every member read but only the key management write', async () => {
    const t = await setup();
    const liste = await t.app.request('/api/schluessel', json('member-token', 'GET'));
    expect(liste.status).toBe(200);
    expect(await liste.json()).toEqual([
      expect.objectContaining({
        name: 'Haupttür',
        halter: expect.objectContaining({ art: 'mitglied', sub: 'r', username: 'user-r' }),
      }),
    ]);
    expect(
      (await t.app.request('/api/schluessel', json('member-token', 'POST', { name: 'X' }))).status,
    ).toBe(403);
    expect(
      (
        await t.app.request(
          `/api/schluessel/${t.id}/archiv`,
          json('member-token', 'PUT', { archiviert: true }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await t.app.request('/api/schluessel?archiv=1', json('member-token', 'GET'))).status,
    ).toBe(403);
    expect(
      (
        await t.app.request(
          `/api/schluessel/${t.id}`,
          json('admin-token', 'PUT', { name: 'Hinten' }),
        )
      ).status,
    ).toBe(200);
  });

  it('lets only the key management enter the first holder', async () => {
    const t = await setup();
    const res = await t.app.request(
      '/api/schluessel',
      json('admin-token', 'POST', { name: 'Keller', halter: null }),
    );
    const { id } = (await res.json()) as { id: string };
    const uebergeben = (token: string) =>
      t.app.request(
        `/api/schluessel/${id}/uebergaben`,
        json(token, 'POST', { von: null, an: mitglied('m2') }),
      );
    const nein = await uebergeben('member-token');
    expect(nein.status).toBe(403);
    expect(await nein.json()).toEqual({
      error: 'Den ersten Halter trägt die Schlüsselverwaltung ein.',
    });
    const ja = await uebergeben('admin-token');
    expect(ja.status).toBe(200);
    expect(await ja.json()).toMatchObject({ halter: { art: 'mitglied', sub: 'm2' } });
  });

  it('tells the receiver when the holder hands the key over', async () => {
    const t = await setup();
    const res = await t.uebergeben('reader-token', { von: mitglied('r'), an: mitglied('m2') });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ halter: { art: 'mitglied', sub: 'm2' } });
    expect(t.gesendet).toEqual([
      {
        endpoint: 'https://push.example/m2',
        titel: 'Schlüssel „Haupttür“',
        text: 'user-r hat dir den Schlüssel übergeben.',
        url: `/app/schluessel/${t.id}`,
      },
    ]);
  });

  it('tells the previous holder when someone records receiving the key, even if switched off', async () => {
    const t = await setup();
    await t.push.store.einstellungSetzen('r', 'schluessel.uebergabe', false, null);
    const res = await t.uebergeben('member-token', { von: mitglied('r'), an: mitglied('m2') });
    expect(res.status).toBe(200);
    expect(t.gesendet).toEqual([
      expect.objectContaining({
        endpoint: 'https://push.example/r',
        text: 'user-m2 hat den Schlüssel von dir bekommen.',
      }),
    ]);
  });

  it('tells both parties when a third member records the Übergabe', async () => {
    const t = await setup();
    const res = await t.uebergeben('vorstand-token', { von: mitglied('r'), an: mitglied('m2') });
    expect(res.status).toBe(200);
    expect(t.gesendet.map((g) => [g.endpoint, g.text])).toEqual([
      [
        'https://push.example/m2',
        'user-v hat eingetragen, dass du den Schlüssel von user-r bekommen hast.',
      ],
      [
        'https://push.example/r',
        'user-v hat eingetragen, dass du den Schlüssel an user-m2 weitergegeben hast.',
      ],
    ]);
  });

  it('allows persons without the app, but nobody as holder only for the key management', async () => {
    const t = await setup();
    const res = await t.uebergeben('reader-token', {
      von: mitglied('r'),
      an: { art: 'person', name: 'Ute' },
    });
    expect(res.status).toBe(200);
    expect(t.gesendet).toHaveLength(0);
    expect(
      (await t.uebergeben('member-token', { von: { art: 'person', name: 'ute' }, an: null }))
        .status,
    ).toBe(403);
    expect(
      (await t.uebergeben('admin-token', { von: { art: 'person', name: 'ute' }, an: null })).status,
    ).toBe(200);
  });

  it('refuses an Übergabe from a holder that is no longer current', async () => {
    const t = await setup();
    expect(
      (await t.uebergeben('member-token', { von: mitglied('v'), an: mitglied('m2') })).status,
    ).toBe(409);
    expect(
      (await t.uebergeben('member-token', { von: mitglied('r'), an: mitglied('r') })).status,
    ).toBe(400);
    expect(
      (await t.uebergeben('member-token', { von: mitglied('r'), an: mitglied('unbekannt') }))
        .status,
    ).toBe(400);
    expect(t.gesendet).toHaveLength(0);
  });

  it('keeps only the newest Übergaben', async () => {
    const t = await setup();
    let von = 'r';
    for (let i = 0; i < 12; i++) {
      const an = von === 'r' ? 'm2' : 'r';
      expect(
        (await t.uebergeben('admin-token', { von: mitglied(von), an: mitglied(an) })).status,
      ).toBe(200);
      von = an;
    }
    const detail = (await (
      await t.app.request(`/api/schluessel/${t.id}`, json('member-token', 'GET'))
    ).json()) as { uebergaben: { eingetragenVon: { username: string } }[] };
    expect(detail.uebergaben).toHaveLength(SCHLUESSEL_VERLAUF_MAX);
    expect(detail.uebergaben[0]!.eingetragenVon).toMatchObject({ username: 'user-a' });
  });
});

describe('schluessel anfragen und planungen', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const mitglied = (sub: string) => ({ art: 'mitglied', sub }) as const;
  const heute = heuteBerlin();
  const morgen = tagNachher(heute, 1);

  /** Profiles for a, r, v, m2 (v and m2 live in the Wohnheim), push for all, key "Haupttür" at r. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: sub === 'v' || sub === 'm2' ? true : null,
      });
      await t.push.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      });
    }
    const res = await t.app.request(
      '/api/schluessel',
      json('admin-token', 'POST', { name: 'Haupttür', halter: mitglied('r') }),
    );
    const { id } = (await res.json()) as { id: string };
    t.gesendet.length = 0;
    const anfrage = async (token: string, body: unknown) => {
      const r = await t.app.request('/api/schluessel/anfragen', json(token, 'POST', body));
      return { status: r.status, id: ((await r.json()) as { id?: string }).id ?? '' };
    };
    const antwort = (token: string, anfrageId: string, body: unknown) =>
      t.app.request(`/api/schluessel/anfragen/${anfrageId}/antwort`, json(token, 'PUT', body));
    const planungen = async () =>
      (await (
        await t.app.request(`/api/schluessel/${id}`, json('member-token', 'GET'))
      ).json()) as { planungen: { an: { sub: string }; zeitfenster: { datum: string } }[] };
    const empfaenger = () => t.gesendet.map((g) => g.endpoint.split('/').pop()).sort();
    return { ...t, id, anfrage, antwort, planungen, empfaenger };
  }

  const bedarf = (extra: Record<string, unknown> = {}) => ({
    art: 'bedarf',
    datum: heute,
    ab: '18:00',
    ...extra,
  });

  it('asks the holder of the named key, or the holders of all keys, for a Bedarf', async () => {
    const t = await setup();
    const r1 = await t.anfrage('member-token', bedarf({ schluesselId: t.id }));
    expect(r1.status).toBe(201);
    expect(t.empfaenger()).toEqual(['r']);
    expect(t.gesendet[0]).toMatchObject({
      text: 'user-m2 braucht den Schlüssel „Haupttür“ heute ab 18:00.',
      url: `/app/schluessel/anfragen/${r1.id}`,
    });
    t.gesendet.length = 0;
    await t.anfrage('member-token', bedarf());
    expect(t.empfaenger()).toEqual(['r']);
    expect(t.gesendet[0]!.text).toContain('einen Schlüssel');
  });

  it('asks the expected holder at the request time and never the creator', async () => {
    const t = await setup();
    const plan = await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: heute, ab: '20:00' }),
    );
    expect(plan.status).toBe(201);
    expect(t.empfaenger()).toEqual(['v']);
    // The plan is after the request: still the current holder.
    t.gesendet.length = 0;
    await t.anfrage('member-token', bedarf({ schluesselId: t.id }));
    expect(t.empfaenger()).toEqual(['r']);
    // The plan is before the request: the recipient.
    t.gesendet.length = 0;
    await t.anfrage('member-token', bedarf({ schluesselId: t.id, ab: '21:00' }));
    expect(t.empfaenger()).toEqual(['v']);
    // Same day without a time: unclear, ask both.
    t.gesendet.length = 0;
    await t.anfrage('member-token', bedarf({ schluesselId: t.id, ab: null }));
    expect(t.empfaenger()).toEqual(['r', 'v']);
    // Never the creator.
    t.gesendet.length = 0;
    await t.anfrage('vorstand-token', bedarf({ schluesselId: t.id, ab: null }));
    expect(t.empfaenger()).toEqual(['r']);
  });

  it('lets only the expected holder answer a Bedarf of "irgendeiner" with that key', async () => {
    const t = await setup();
    await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: heute, ab: '12:00' }),
    );
    // At 18:00 v holds the key, r no longer.
    const { id } = await t.anfrage('member-token', bedarf());
    expect(
      (await t.antwort('reader-token', id, { art: 'zusage', schluesselId: t.id })).status,
    ).toBe(403);
    expect(
      (await t.antwort('vorstand-token', id, { art: 'zusage', schluesselId: t.id })).status,
    ).toBe(200);
  });

  it('asks only Wohnheim members for an Abgabe, and only from a holder', async () => {
    const t = await setup();
    const ok = await t.anfrage('reader-token', {
      art: 'abgabe',
      schluesselId: t.id,
      datum: morgen,
    });
    expect(ok.status).toBe(201);
    expect(t.empfaenger()).toEqual(['m2', 'v']);
    expect(t.gesendet[0]!.text).toContain(
      'möchte den Schlüssel „Haupttür“ morgen im Laufe des Tages abgeben',
    );
    expect(
      (await t.anfrage('member-token', { art: 'abgabe', schluesselId: t.id, datum: morgen }))
        .status,
    ).toBe(409);
    expect((await t.anfrage('reader-token', { art: 'abgabe', datum: morgen })).status).toBe(400);
  });

  it('lets the first Zusage win and creates a planned handover', async () => {
    const t = await setup();
    await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: heute, ab: '20:00' }),
    );
    const { id } = await t.anfrage('member-token', bedarf({ schluesselId: t.id }));
    t.gesendet.length = 0;
    expect((await t.antwort('member-token', id, { art: 'zusage' })).status).toBe(403);
    expect((await t.antwort('admin-token', id, { art: 'zusage' })).status).toBe(403);
    expect((await t.antwort('reader-token', id, { art: 'zusage' })).status).toBe(200);
    expect(t.gesendet.map((g) => [g.endpoint.split('/').pop(), g.text])).toEqual([
      ['m2', 'user-r hat zugesagt.'],
    ]);
    expect((await t.antwort('vorstand-token', id, { art: 'zusage' })).status).toBe(409);
    const plaene = (await t.planungen()).planungen;
    expect(plaene.map((p) => p.an.sub)).toEqual(['m2', 'v']);
    expect(plaene[0]!.zeitfenster.datum).toBe(heute);
    const a = (await (
      await t.app.request(`/api/schluessel/anfragen/${id}`, json('member-token', 'GET'))
    ).json()) as { status: string; darfAntworten: boolean };
    expect(a).toMatchObject({ status: 'vergeben', darfAntworten: false });
  });

  it('tells the others that a request is settled', async () => {
    const t = await setup();
    await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: heute, ab: '20:00' }),
    );
    const { id } = await t.anfrage('member-token', bedarf({ schluesselId: t.id, ab: null }));
    await t.antwort('vorstand-token', id, { art: 'ablehnung' });
    t.gesendet.length = 0;
    await t.antwort('reader-token', id, { art: 'zusage' });
    expect(t.gesendet.map((g) => [g.endpoint.split('/').pop(), g.text])).toEqual([
      ['m2', 'user-r hat zugesagt.'],
      ['v', 'Die Anfrage von user-m2 hat sich erledigt.'],
    ]);
  });

  it('lets the creator accept a Gegenvorschlag', async () => {
    const t = await setup();
    const { id } = await t.anfrage('member-token', bedarf({ schluesselId: t.id }));
    expect((await t.antwort('reader-token', id, { art: 'gegenvorschlag' })).status).toBe(400);
    expect(
      (await t.antwort('reader-token', id, { art: 'gegenvorschlag', datum: morgen, ab: '10:00' }))
        .status,
    ).toBe(200);
    const detail = (await (
      await t.app.request(`/api/schluessel/anfragen/${id}`, json('member-token', 'GET'))
    ).json()) as { antworten: { id: string; art: string }[] };
    const vorschlag = detail.antworten[0]!;
    const annehmen = (token: string) =>
      t.app.request(
        `/api/schluessel/anfragen/${id}/antworten/${vorschlag.id}/annehmen`,
        json(token, 'POST'),
      );
    expect((await annehmen('reader-token')).status).toBe(403);
    t.gesendet.length = 0;
    expect((await annehmen('member-token')).status).toBe(200);
    expect(t.gesendet.map((g) => [g.endpoint.split('/').pop(), g.text])).toEqual([
      ['r', 'user-m2 hat deinen Vorschlag angenommen.'],
    ]);
    const plaene = (await t.planungen()).planungen;
    expect(plaene).toHaveLength(1);
    expect(plaene[0]).toMatchObject({ an: { sub: 'm2' }, zeitfenster: { datum: morgen } });
    expect((await annehmen('member-token')).status).toBe(409);
  });

  it('needs the key from the responder when the Bedarf names none', async () => {
    const t = await setup();
    const { id } = await t.anfrage('member-token', bedarf());
    expect((await t.antwort('reader-token', id, { art: 'zusage' })).status).toBe(400);
    expect(
      (await t.antwort('reader-token', id, { art: 'zusage', schluesselId: t.id })).status,
    ).toBe(200);
    expect((await t.planungen()).planungen[0]!.an.sub).toBe('m2');
  });

  it('plans the Abgabe for the responder, and only the creator may withdraw', async () => {
    const t = await setup();
    const { id } = await t.anfrage('reader-token', {
      art: 'abgabe',
      schluesselId: t.id,
      datum: heute,
    });
    expect(
      (await t.app.request(`/api/schluessel/anfragen/${id}/rueckzug`, json('member-token', 'PUT')))
        .status,
    ).toBe(403);
    expect((await t.antwort('vorstand-token', id, { art: 'zusage' })).status).toBe(200);
    expect((await t.planungen()).planungen.map((p) => p.an.sub)).toEqual(['v']);
    expect(
      (await t.app.request(`/api/schluessel/anfragen/${id}/rueckzug`, json('reader-token', 'PUT')))
        .status,
    ).toBe(409);
  });

  it('lists open requests and never withdrawn ones', async () => {
    const t = await setup();
    const a = await t.anfrage('member-token', bedarf());
    await t.anfrage('vorstand-token', bedarf());
    await t.app.request(`/api/schluessel/anfragen/${a.id}/rueckzug`, json('member-token', 'PUT'));
    const lesen = async (token: string) =>
      (await (await t.app.request('/api/schluessel/anfragen', json(token, 'GET'))).json()) as {
        id: string;
        darfAntworten: boolean;
      }[];
    expect(await lesen('reader-token')).toHaveLength(1);
    expect(await lesen('member-token')).toHaveLength(1);
    expect((await lesen('reader-token'))[0]!.darfAntworten).toBe(true);
  });

  it('hides a withdrawn request from its creator list but keeps the detail', async () => {
    const t = await setup();
    const { id } = await t.anfrage('member-token', bedarf());
    expect(
      (await t.app.request(`/api/schluessel/anfragen/${id}/rueckzug`, json('member-token', 'PUT')))
        .status,
    ).toBe(200);
    const liste = (await (
      await t.app.request('/api/schluessel/anfragen', json('member-token', 'GET'))
    ).json()) as { id: string }[];
    expect(liste.map((a) => a.id)).not.toContain(id);
    expect(
      (await t.app.request(`/api/schluessel/anfragen/${id}`, json('member-token', 'GET'))).status,
    ).toBe(200);
  });

  it('uses up the earliest planned handover when the key really moves', async () => {
    const t = await setup();
    const plan = (anSub: string, datum: string) =>
      t.app.request(
        `/api/schluessel/${t.id}/planungen`,
        json('reader-token', 'POST', { anSub, datum }),
      );
    await plan('m2', morgen);
    await plan('m2', tagNachher(heute, 3));
    await plan('v', tagNachher(heute, 2));
    const res = await t.app.request(
      `/api/schluessel/${t.id}/uebergaben`,
      json('reader-token', 'POST', { von: mitglied('r'), an: mitglied('m2') }),
    );
    expect(res.status).toBe(200);
    const rest = (await t.planungen()).planungen;
    expect(rest.map((p) => [p.an.sub, p.zeitfenster.datum])).toEqual([
      ['v', tagNachher(heute, 2)],
      ['m2', tagNachher(heute, 3)],
    ]);
  });

  it('drops the earliest planned handover when the key goes to someone else', async () => {
    const t = await setup();
    const plan = (anSub: string, datum: string) =>
      t.app.request(
        `/api/schluessel/${t.id}/planungen`,
        json('reader-token', 'POST', { anSub, datum }),
      );
    await plan('v', morgen);
    await plan('m2', tagNachher(heute, 3));
    const res = await t.app.request(
      `/api/schluessel/${t.id}/uebergaben`,
      json('reader-token', 'POST', { von: mitglied('r'), an: { art: 'person', name: 'ute' } }),
    );
    expect(res.status).toBe(200);
    expect((await t.planungen()).planungen.map((p) => p.an.sub)).toEqual(['m2']);
  });

  it('keeps Planungen when the key goes to nobody', async () => {
    const t = await setup();
    await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: morgen }),
    );
    const res = await t.app.request(
      `/api/schluessel/${t.id}/uebergaben`,
      json('admin-token', 'POST', { von: mitglied('r'), an: null }),
    );
    expect(res.status).toBe(200);
    expect((await t.planungen()).planungen).toHaveLength(1);
  });

  it('hides a Planung from the day after its date', async () => {
    const t = await setup();
    const gestern = tagNachher(heute, -1);
    for (const datum of [gestern, heute]) {
      await t.anfragenFake.store.planungAnlegen({
        schluesselId: t.id,
        anSub: 'v',
        datum,
        ab: null,
        bis: null,
        notiz: null,
        anfrageId: null,
        erstelltVon: 'r',
      });
    }
    expect((await t.planungen()).planungen.map((p) => p.zeitfenster.datum)).toEqual([heute]);
  });

  it('tells holder, previous and next holder about changed and deleted plans', async () => {
    const t = await setup();
    const angelegt = await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('admin-token', 'POST', { anSub: 'v', datum: heute, ab: '18:00' }),
    );
    const { id } = (await angelegt.json()) as { id: string };
    expect(t.empfaenger()).toEqual(['r', 'v']);
    t.gesendet.length = 0;
    await t.app.request(
      `/api/schluessel/planungen/${id}`,
      json('admin-token', 'PUT', { anSub: 'v', datum: heute, ab: '19:00' }),
    );
    expect(t.gesendet[0]!.text).toContain('geändert');
    t.gesendet.length = 0;
    expect(
      (await t.app.request(`/api/schluessel/planungen/${id}`, json('admin-token', 'DELETE')))
        .status,
    ).toBe(200);
    expect(t.empfaenger()).toEqual(['r', 'v']);
    expect((await t.planungen()).planungen).toHaveLength(0);
  });

  it('refuses to change a plan to the current holder or onto an archived key', async () => {
    const t = await setup();
    const angelegt = await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('admin-token', 'POST', { anSub: 'v', datum: heute, ab: '18:00' }),
    );
    const { id } = (await angelegt.json()) as { id: string };
    const aendern = (anSub: string) =>
      t.app.request(
        `/api/schluessel/planungen/${id}`,
        json('admin-token', 'PUT', { anSub, datum: heute, ab: '19:00' }),
      );
    expect((await aendern('r')).status).toBe(409);
    expect((await aendern('v')).status).toBe(200);
    await t.app.request(
      `/api/schluessel/${t.id}/archiv`,
      json('admin-token', 'PUT', { archiviert: true }),
    );
    expect((await aendern('v')).status).toBe(404);
  });

  it('refuses past days', async () => {
    const t = await setup();
    expect((await t.anfrage('member-token', bedarf({ datum: tagNachher(heute, -1) }))).status).toBe(
      400,
    );
  });
});

describe('umfragen', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const endetAm = tagNachher(heuteBerlin(), 10);
  const umfrage = (extra: Record<string, unknown> = {}) => ({
    titel: 'Sommerfest',
    beschreibung: null,
    endetAm,
    anonym: false,
    ergebnisse: 'sofort',
    pflicht: { status: ['mitglied'], posten: [], personen: [] },
    optional: { status: ['em'], posten: [], personen: [] },
    erinnerungenPflicht: [3],
    erinnerungenOptional: [],
    fragen: [
      {
        text: 'Wann?',
        freitext: true,
        maxAntworten: 1,
        optionen: [{ text: 'Samstag' }, { text: 'Sonntag' }],
      },
    ],
    ...extra,
  });

  /** Profiles for a, r, v, m2 (usernames user-<sub>): m2 is Mitglied, r EM, the others Anwärter. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
      await t.push.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      });
    }
    await t.mitglieder.statusSetzen('m2', 'mitglied');
    await t.mitglieder.statusSetzen('r', 'em');
    const anlegen = async (extra: Record<string, unknown> = {}) => {
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', umfrage(extra)),
      );
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };
    const holen = async (id: string, token: string) => {
      const res = await t.app.request(`/api/umfragen/${id}`, json(token, 'GET'));
      return { status: res.status, body: (await res.json()) as UmfrageDetailDto };
    };
    const abstimmen = (id: string, token: string, antworten: unknown) =>
      t.app.request(`/api/umfragen/${id}/stimme`, json(token, 'PUT', { antworten }));
    return { ...t, anlegen, holen, abstimmen };
  }

  it('tells both circles about a new poll, but not the creator', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31' });
    expect(t.gesendet).toEqual(
      expect.arrayContaining([
        {
          endpoint: 'https://push.example/m2',
          titel: 'Neue Umfrage',
          text: 'user-v fragt: „Sommerfest“. Bitte stimme bis 31.01.2099 ab.',
          url: `/app/umfragen/${id}`,
        },
        {
          endpoint: 'https://push.example/r',
          titel: 'Neue Umfrage',
          text: 'user-v fragt: „Sommerfest“. Du kannst bis 31.01.2099 abstimmen.',
          url: `/app/umfragen/${id}`,
        },
      ]),
    );
    expect(t.gesendet).toHaveLength(2);
  });

  it('uses the question as title of a poll with a single question', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31', titel: '' });
    const { body } = await t.holen(id, 'member-token');
    expect(body.titel).toBe('Wann?');
    expect(body.fragen[0]!.text).toBe('Wann?');
  });

  it('rejects a status that votes both mandatorily and optionally', async () => {
    const t = await setup();
    const res = await t.app.request(
      '/api/umfragen',
      json(
        'vorstand-token',
        'POST',
        umfrage({ optional: { status: ['mitglied', 'em'], posten: [], personen: [] } }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects an end date in the past', async () => {
    const t = await setup();
    const res = await t.app.request(
      '/api/umfragen',
      json('vorstand-token', 'POST', umfrage({ endetAm: '2020-01-01' })),
    );
    expect(res.status).toBe(400);
  });

  it('shows a poll only to its circles, the creator and the Verwaltung', async () => {
    const t = await setup();
    const id = await t.anlegen({
      endetAm: '2099-01-31',
      pflicht: { status: [], posten: [], personen: ['m2'] },
      optional: { status: [], posten: [], personen: [] },
    });
    expect((await t.holen(id, 'member-token')).body.meinKreis).toBe('pflicht');
    expect((await t.holen(id, 'vorstand-token')).body.darfBearbeiten).toBe(true);
    expect((await t.holen(id, 'admin-token')).body.darfLoeschen).toBe(true);
    expect((await t.holen(id, 'reader-token')).status).toBe(404);
    const liste = await t.app.request('/api/umfragen', json('reader-token', 'GET'));
    expect(await liste.json()).toEqual([]);
  });

  it('lists running polls and pages through the ended ones the caller may see', async () => {
    const t = await setup();
    const laufend = await t.anlegen({ endetAm: '2099-01-31' });
    const ids: string[] = [];
    for (let i = 0; i < 27; i++) {
      // Every fifth poll is only for a, so the member does not see it.
      const nurA = i % 5 === 0;
      const id = await t.anlegen({
        endetAm: '2099-01-31',
        ...(nurA && {
          pflicht: { status: [], posten: [], personen: ['a'] },
          optional: { status: [], posten: [], personen: [] },
        }),
      });
      await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
      t.umfragenListe.get(id)!.erstelltAm = new Date(Date.UTC(2026, 0, 1, 0, i));
      if (!nurA) ids.push(id);
    }
    const laufende = (await (
      await t.app.request('/api/umfragen', json('member-token', 'GET'))
    ).json()) as { id: string }[];
    expect(laufende.map((u) => u.id)).toEqual([laufend]);

    const seite = async (nach?: string) => {
      const res = await t.app.request(
        `/api/umfragen/beendet${nach ? `?nach=${encodeURIComponent(nach)}` : ''}`,
        json('member-token', 'GET'),
      );
      expect(res.status).toBe(200);
      return (await res.json()) as { umfragen: { id: string }[]; weiter: string | null };
    };
    const erste = await seite();
    expect(erste.umfragen).toHaveLength(20);
    expect(erste.weiter).not.toBeNull();
    const zweite = await seite(erste.weiter!);
    expect(zweite.weiter).toBeNull();
    // Newest first, each visible poll exactly once.
    expect([...erste.umfragen, ...zweite.umfragen].map((u) => u.id)).toEqual(ids.reverse());

    const kaputt = await t.app.request(
      '/api/umfragen/beendet?nach=kaputt',
      json('member-token', 'GET'),
    );
    expect(kaputt.status).toBe(400);
  });

  it('checks the ballot and counts the votes', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31' });
    const { body } = await t.holen(id, 'member-token');
    const frage = body.fragen[0]!;
    const [sa] = frage.optionen;
    expect(
      (
        await t.abstimmen(id, 'member-token', [
          { frageId: frage.id, optionIds: [sa!.id], freitext: 'x' },
        ])
      ).status,
    ).toBe(400);
    expect(
      (await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [sa!.id] }])).status,
    ).toBe(200);
    expect(
      (await t.abstimmen(id, 'vorstand-token', [{ frageId: frage.id, optionIds: [sa!.id] }]))
        .status,
    ).toBe(403);
    const nachher = (await t.holen(id, 'reader-token')).body;
    expect(nachher.abgaben).toBe(1);
    expect(nachher.fragen[0]!.optionen[0]).toMatchObject({
      stimmen: 1,
      personen: [expect.objectContaining({ sub: 'm2', username: 'user-m2' })],
    });
    expect(nachher.teilnehmende).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rolle: 'pflicht', abgestimmt: true }),
        expect.objectContaining({ rolle: 'optional', abgestimmt: false }),
      ]),
    );
  });

  it('never reveals who voted in an anonymous poll', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31', anonym: true });
    const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
    await t.abstimmen(id, 'member-token', [
      { frageId: frage.id, optionIds: [], freitext: 'Geheim' },
    ]);
    const { body } = await t.holen(id, 'admin-token');
    expect(body.teilnehmende).toBeNull();
    expect(body.fragen[0]!.optionen[0]!.personen).toBeNull();
    expect(body.fragen[0]!.freitexte).toEqual([{ text: 'Geheim', person: null }]);
    expect(JSON.stringify(body)).not.toContain('m2');
    const res = await t.app.request(
      `/api/umfragen/${id}`,
      json('vorstand-token', 'PUT', umfrage({ endetAm: '2099-01-31', anonym: false })),
    );
    expect(res.status).toBe(400);
  });

  it('orders free texts of an anonymous poll by text, not by who voted last', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31', anonym: true });
    const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
    await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [], freitext: 'Zeta' }]);
    await t.abstimmen(id, 'reader-token', [
      { frageId: frage.id, optionIds: [], freitext: 'Alpha' },
    ]);
    const { body } = await t.holen(id, 'admin-token');
    expect(body.fragen[0]!.freitexte!.map((f) => f.text)).toEqual(['Alpha', 'Zeta']);
  });

  it('hides the results until the end when chosen, except for the creator', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31', ergebnisse: 'nach_ende' });
    const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
    await t.abstimmen(id, 'member-token', [
      { frageId: frage.id, optionIds: [frage.optionen[0]!.id] },
    ]);
    expect((await t.holen(id, 'member-token')).body.fragen[0]!.optionen[0]!.stimmen).toBeNull();
    expect((await t.holen(id, 'vorstand-token')).body.fragen[0]!.optionen[0]!.stimmen).toBe(1);
    await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
    expect((await t.holen(id, 'member-token')).body.fragen[0]!.optionen[0]!.stimmen).toBe(1);
    expect(
      (
        await t.abstimmen(id, 'member-token', [
          { frageId: frage.id, optionIds: [frage.optionen[0]!.id] },
        ])
      ).status,
    ).toBe(409);
  });

  it('asks voters of a removed option to vote again after confirming', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31' });
    const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
    const [sa, so] = frage.optionen;
    await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [sa!.id] }]);
    await t.abstimmen(id, 'reader-token', [{ frageId: frage.id, optionIds: [so!.id] }]);
    t.gesendet.length = 0;
    const geaendert = umfrage({
      endetAm: '2099-01-31',
      fragen: [
        {
          id: frage.id,
          text: 'Wann?',
          freitext: true,
          maxAntworten: 1,
          optionen: [{ id: so!.id, text: 'Sonntag' }],
        },
      ],
    });
    const ohne = await t.app.request(
      `/api/umfragen/${id}`,
      json('vorstand-token', 'PUT', geaendert),
    );
    expect(ohne.status).toBe(409);
    expect(await ohne.json()).toMatchObject({ betroffene: 1 });
    const mit = await t.app.request(
      `/api/umfragen/${id}`,
      json('vorstand-token', 'PUT', { ...geaendert, bestaetigt: true }),
    );
    expect(mit.status).toBe(200);
    expect(t.gesendet).toEqual([
      {
        endpoint: 'https://push.example/m2',
        titel: 'Bitte stimme erneut ab',
        text: '„Sommerfest“ wurde geändert, deine Stimme zählt so nicht mehr.',
        url: `/app/umfragen/${id}`,
      },
    ]);
    const m2 = (await t.holen(id, 'member-token')).body;
    expect(m2).toMatchObject({ abgestimmt: false, erneutNoetig: true });
    expect((await t.holen(id, 'reader-token')).body).toMatchObject({
      abgestimmt: true,
      abgaben: 1,
    });
  });

  it('lets only the creator and the Verwaltung edit, and only the Verwaltung delete', async () => {
    const t = await setup();
    const id = await t.anlegen({ endetAm: '2099-01-31' });
    const body = umfrage({ endetAm: '2099-01-31', titel: 'Neu' });
    expect(
      (await t.app.request(`/api/umfragen/${id}`, json('member-token', 'PUT', body))).status,
    ).toBe(403);
    expect(
      (await t.app.request(`/api/umfragen/${id}`, json('admin-token', 'PUT', body))).status,
    ).toBe(200);
    expect(
      (await t.app.request(`/api/umfragen/${id}`, json('vorstand-token', 'DELETE'))).status,
    ).toBe(403);
    expect((await t.app.request(`/api/umfragen/${id}`, json('admin-token', 'DELETE'))).status).toBe(
      200,
    );
    expect(t.umfragenListe.size).toBe(0);
  });

  describe('Terminumfragen', () => {
    const kategorie = (id: string, art: 'dienste' | 'teilnahme') => ({
      id,
      name: id,
      farbe: 'blue',
      art,
      teilnahmeStatus: art === 'teilnahme' ? [] : null,
      dauer: 'eintaegig' as const,
      protokoll: false,
      protokollArt: 'sitzung' as const,
      benutzt: false,
      archiviert: false,
    });
    const terminUmfrage = (termin: Record<string, unknown>) =>
      umfrage({
        endetAm: '2099-01-31',
        titel: 'Sitzung',
        termin: { jeTermin: false, beginn: '19:00', ende: '21:00', bedarf: null, ...termin },
        fragen: [
          {
            text: '',
            freitext: false,
            maxAntworten: null,
            optionen: [
              { text: '', termin: { datum: '2099-01-10', beginn: null, ende: null } },
              { text: '', termin: { datum: '2099-01-11', beginn: null, ende: null } },
            ],
          },
        ],
      });

    async function terminSetup(termin: Record<string, unknown>) {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([
        kategorie('sitzung', 'teilnahme'),
        kategorie('bar', 'dienste'),
      ]);
      t.kalender.dienstformen.mockResolvedValue([
        { id: 'tresen', name: 'Tresen', reihenfolge: 1, archiviert: false },
      ]);
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', terminUmfrage(termin)),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const frage = (await t.holen(id, 'member-token')).body.fragen[0]!;
      const [a, b] = frage.optionen;
      await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [a!.id, b!.id] }]);
      await t.abstimmen(id, 'reader-token', [{ frageId: frage.id, optionIds: [b!.id] }]);
      t.gesendet.length = 0;
      const festlegen = (token: string, optionId: string) =>
        t.app.request(`/api/umfragen/${id}/event`, json(token, 'POST', { optionId }));
      return { ...t, id, a: a!, b: b!, festlegen };
    }

    it('creates a participation event with everybody who agreed, once the poll ended', async () => {
      const t = await terminSetup({ kategorieId: 'sitzung' });
      expect(t.a.text).toBe('Sa, 10.01.2099');
      expect((await t.festlegen('vorstand-token', t.a.id)).status).toBe(409);
      await t.app.request(`/api/umfragen/${t.id}/beenden`, json('vorstand-token', 'POST'));
      expect((await t.festlegen('member-token', t.a.id)).status).toBe(403);
      // Not the date with the most votes: the creator decides.
      const res = await t.festlegen('vorstand-token', t.a.id);
      expect(res.status).toBe(201);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({
          titel: 'Sitzung',
          kategorieId: 'sitzung',
          beginn: '2099-01-10T18:00:00.000Z',
          ende: '2099-01-10T20:00:00.000Z',
          schichten: [],
          teilnahmeStatus: [],
          eingeladen: ['m2'],
        }),
        'v',
      );
      expect(t.gesendet).toEqual(
        expect.arrayContaining([
          {
            endpoint: 'https://push.example/m2',
            titel: 'Termin steht fest',
            text: '„Sitzung“: Sa, 10.01.2099. Du bist eingetragen.',
            url: '/app/kalender/events/e1',
          },
          expect.objectContaining({
            endpoint: 'https://push.example/r',
            text: '„Sitzung“: Sa, 10.01.2099.',
          }),
        ]),
      );
      const { body } = await t.holen(t.id, 'vorstand-token');
      expect(body).toMatchObject({ eventId: 'e1', eventOptionId: t.a.id, darfEventAnlegen: false });
      t.kalender.event.mockResolvedValue({ id: 'e1' } as EventDto);
      expect((await t.festlegen('vorstand-token', t.b.id)).status).toBe(409);
    });

    it('creates one Betrieb Schicht with the Bedarf and enters everybody who agreed', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([kategorie('bar', 'dienste')]);
      const ohne = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', terminUmfrage({ kategorieId: 'bar' })),
      );
      expect(ohne.status).toBe(400);

      const d = await terminSetup({
        kategorieId: 'bar',
        bedarf: { dienstformId: 'tresen', minimum: 2, wunsch: 3 },
      });
      d.kalender.event.mockResolvedValueOnce({
        id: 'e1',
        schichten: [
          {
            id: 's1',
            art: 'betrieb',
            bedarfe: [{ dienstformId: 'tresen', minimum: 2, wunsch: 3 }],
          },
        ],
      } as unknown as EventDto);
      await d.app.request(`/api/umfragen/${d.id}/beenden`, json('vorstand-token', 'POST'));
      expect((await d.festlegen('vorstand-token', d.b.id)).status).toBe(201);
      expect(d.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({
          schichten: [
            expect.objectContaining({
              art: 'betrieb',
              bedarfe: [{ dienstformId: 'tresen', minimum: 2, wunsch: 3 }],
            }),
          ],
          teilnahmeStatus: null,
          eingeladen: [],
        }),
        'v',
      );
      const eingetragen = d.kalender.dienstEintragen.mock.calls.map(([schicht, daten]) => [
        schicht,
        daten.mitgliedSub,
        daten.dienstformId,
      ]);
      expect(eingetragen).toEqual([
        ['s1', 'm2', 'tresen'],
        ['s1', 'r', 'tresen'],
      ]);
    });

    it('takes the title from the Kategorie and lets members answer "none of the dates"', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([kategorie('sitzung', 'teilnahme')]);
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', {
          ...terminUmfrage({ kategorieId: 'sitzung' }),
          titel: '',
        }),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const { body } = await t.holen(id, 'member-token');
      expect(body.titel).toBe('sitzung');
      const frage = body.fragen[0]!;
      expect(
        (await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [] }])).status,
      ).toBe(200);
      const danach = (await t.holen(id, 'vorstand-token')).body;
      expect(danach.abgestimmt).toBe(false);
      expect(danach.abgaben).toBe(1);
      expect(danach.fragen[0]!.keiner).toMatchObject({
        anzahl: 1,
        personen: [expect.objectContaining({ sub: 'm2' })],
      });
      await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
      await t.app.request(
        `/api/umfragen/${id}/event`,
        json('vorstand-token', 'POST', { optionId: frage.optionen[0]!.id }),
      );
      // The title came from the Kategorie, so the event keeps following it.
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({ titel: '', eingeladen: [] }),
        'v',
      );
    });

    it('needs an end date per answer for multi-day Kategorien', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([
        { ...kategorie('fahrt', 'teilnahme'), dauer: 'ganztaegig' as const },
      ]);
      const ohneBis = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', terminUmfrage({ kategorieId: 'fahrt' })),
      );
      expect(ohneBis.status).toBe(400);
      const body = terminUmfrage({ kategorieId: 'fahrt' }) as unknown as {
        fragen: { optionen: { termin: Record<string, unknown> }[] }[];
      };
      body.fragen[0]!.optionen.forEach((o) => (o.termin.bis = '2099-01-13'));
      const res = await t.app.request('/api/umfragen', json('vorstand-token', 'POST', body));
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const u = (await t.holen(id, 'member-token')).body;
      expect(u.fragen[0]!.optionen[0]!.text).toBe('Sa, 10.01.2099 – Di, 13.01.2099');
      expect(u.terminDauer).toBe('ganztaegig');
    });

    it('creates the event from a Vorlage and spreads everybody over its Dienstformen', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue([kategorie('bar', 'dienste')]);
      t.kalender.dienstformen.mockResolvedValue([
        { id: 'tresen', name: 'Tresen', reihenfolge: 1, archiviert: false },
        { id: 'kasse', name: 'Kasse', reihenfolge: 2, archiviert: false },
      ]);
      t.kalender.vorlagen.mockResolvedValue([
        {
          id: 'barabend',
          titel: 'Barabend',
          beschreibung: 'Aus der Vorlage',
          kategorieId: 'bar',
          beginnZeit: '20:00',
          endeZeit: '01:00',
          teilnahmeStatus: null,
          tage: 1,
          bilderOrdner: false,
          archiviert: false,
          schichten: [
            {
              art: 'betrieb',
              beginnZeit: '20:00',
              endeZeit: '01:00',
              bedarfe: [
                { dienstformId: 'tresen', minimum: 1, wunsch: 2 },
                { dienstformId: 'kasse', minimum: 1, wunsch: 1 },
              ],
            },
          ],
        },
      ]);
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', {
          ...terminUmfrage({
            kategorieId: 'egal',
            vorlageId: 'barabend',
            beginn: null,
            ende: null,
          }),
          titel: '',
        }),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const u = (await t.holen(id, 'member-token')).body;
      expect(u).toMatchObject({
        titel: 'Barabend',
        termin: { kategorieId: 'bar', vorlageId: 'barabend' },
        terminBedarf: { minimum: 2, wunsch: 3, dienstformen: ['Tresen', 'Kasse'] },
      });
      const frage = u.fragen[0]!;
      await t.abstimmen(id, 'member-token', [
        { frageId: frage.id, optionIds: [frage.optionen[0]!.id] },
      ]);
      await t.abstimmen(id, 'reader-token', [
        { frageId: frage.id, optionIds: [frage.optionen[0]!.id] },
      ]);
      await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
      t.kalender.event.mockResolvedValueOnce({
        id: 'e1',
        schichten: [
          {
            id: 's1',
            art: 'betrieb',
            bedarfe: [
              { dienstformId: 'tresen', minimum: 1, wunsch: 2 },
              { dienstformId: 'kasse', minimum: 1, wunsch: 1 },
            ],
          },
        ],
      } as unknown as EventDto);
      expect(
        (
          await t.app.request(
            `/api/umfragen/${id}/event`,
            json('vorstand-token', 'POST', { optionId: frage.optionen[0]!.id }),
          )
        ).status,
      ).toBe(201);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({
          titel: 'Barabend',
          beschreibung: 'Aus der Vorlage',
          kategorieId: 'bar',
          beginn: '2099-01-10T19:00:00.000Z',
          ende: '2099-01-11T00:00:00.000Z',
        }),
        'v',
      );
      expect(
        t.kalender.dienstEintragen.mock.calls.map(([, d]) => [d.mitgliedSub, d.dienstformId]),
      ).toEqual([
        ['m2', 'tresen'],
        ['r', 'kasse'],
      ]);
    });

    it('lets members answer "none" in a free scheduling poll, which never becomes an event', async () => {
      const t = await setup();
      const res = await t.app.request(
        '/api/umfragen',
        json('vorstand-token', 'POST', {
          ...umfrage({ endetAm: '2099-01-31' }),
          terminFrei: true,
          fragen: [
            {
              text: '',
              freitext: false,
              maxAntworten: 1,
              optionen: [
                { text: '', termin: { datum: '2099-01-12', beginn: '19:00', ende: '21:00' } },
              ],
            },
          ],
        }),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const { body } = await t.holen(id, 'member-token');
      expect(body).toMatchObject({ terminFrei: true, terminumfrage: true, termin: null });
      const frage = body.fragen[0]!;
      expect(frage.optionen[0]).toMatchObject({
        text: 'Mo, 12.01.2099, 19:00–21:00',
        termin: { datum: '2099-01-12', beginn: '19:00', ende: '21:00' },
      });
      expect(
        (await t.abstimmen(id, 'member-token', [{ frageId: frage.id, optionIds: [] }])).status,
      ).toBe(200);
      expect((await t.holen(id, 'member-token')).body.fragen[0]!.keiner).toMatchObject({
        anzahl: 1,
      });
      await t.app.request(`/api/umfragen/${id}/beenden`, json('vorstand-token', 'POST'));
      const event = await t.app.request(
        `/api/umfragen/${id}/event`,
        json('vorstand-token', 'POST', { optionId: frage.optionen[0]!.id }),
      );
      expect(event.status).toBe(400);
    });
  });
});

describe('trichter', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  /** Profiles for a (admin), r, v, m2 with usernames `user-<sub>`; one funnel of 3 l with 2 outlets. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
    }
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['trichter:verwalten' as const] : [],
    );
    const res = await t.app.request(
      '/api/trichter',
      json('admin-token', 'POST', { name: 'Dicker', volumenL: 3, auslaesse: 2 }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const eintragen = (token: string, body: Record<string, unknown>) =>
      t.app.request(
        '/api/trichter/durchgaenge',
        json(token, 'POST', { trichterId: id, volumenL: 2, teilnehmende: ['m2'], ...body }),
      );
    return { ...t, id, eintragen };
  }

  it('lets everyone read but only the management change funnels', async () => {
    const t = await setup();
    const liste = await t.app.request('/api/trichter', json('member-token', 'GET'));
    expect(await liste.json()).toEqual([
      { id: t.id, name: 'Dicker', volumenMl: 3000, auslaesse: 2, archiviert: false },
    ]);
    const body = { name: 'Neu', volumenL: 1, auslaesse: 1 };
    for (const token of ['member-token', 'reader-token']) {
      expect((await t.app.request('/api/trichter', json(token, 'POST', body))).status).toBe(403);
      expect(
        (await t.app.request(`/api/trichter/${t.id}`, json(token, 'PUT', { archiviert: true })))
          .status,
      ).toBe(403);
    }
    expect(
      (await t.app.request(`/api/trichter/${t.id}`, json('vorstand-token', 'PUT', { volumenL: 4 })))
        .status,
    ).toBe(200);
    expect(
      (await t.app.request('/api/trichter/nope', json('admin-token', 'PUT', { volumenL: 4 })))
        .status,
    ).toBe(404);
    const neu = await t.app.request('/api/trichter', json('member-token', 'GET'));
    expect(await neu.json()).toEqual([expect.objectContaining({ volumenMl: 4000 })]);
  });

  it('hides archived funnels unless asked and refuses Durchgänge for them', async () => {
    const t = await setup();
    await t.app.request(`/api/trichter/${t.id}`, json('admin-token', 'PUT', { archiviert: true }));
    expect(
      await (await t.app.request('/api/trichter', json('member-token', 'GET'))).json(),
    ).toEqual([]);
    const alle = await t.app.request('/api/trichter?archiviert=1', json('member-token', 'GET'));
    expect(await alle.json()).toEqual([expect.objectContaining({ archiviert: true })]);
    const res = await t.eintragen('member-token', { teilnehmende: ['a'] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Dieser Trichter ist archiviert.' });
  });

  it('validates Durchgänge', async () => {
    const t = await setup();
    const selbst = await t.eintragen('member-token', { teilnehmende: ['m2'] });
    expect(selbst.status).toBe(400);
    expect(await selbst.json()).toEqual({
      error: 'Du kannst dich nicht selbst eintragen. Das machen die anderen für dich.',
    });
    expect((await t.eintragen('member-token', { teilnehmende: ['a', 'r', 'v'] })).status).toBe(400);
    expect((await t.eintragen('member-token', { volumenL: 3.5, teilnehmende: ['a'] })).status).toBe(
      400,
    );
    expect((await t.eintragen('member-token', { teilnehmende: ['a', 'a'] })).status).toBe(400);
    expect((await t.eintragen('member-token', { teilnehmende: [] })).status).toBe(400);
    expect((await t.eintragen('member-token', { teilnehmende: ['fremd'] })).status).toBe(400);
    // An enabled account without a profile row may take part; a disabled one may not.
    const konten = await t.userAdmin.konten();
    t.userAdmin.konten.mockResolvedValue(
      new Map([
        ...konten,
        ['neu', { sub: 'neu', kontoName: 'neu', username: 'neu', aktiviert: false, enabled: true }],
        ['aus', { sub: 'aus', kontoName: 'aus', username: 'aus', aktiviert: true, enabled: false }],
      ]),
    );
    expect((await t.eintragen('member-token', { teilnehmende: ['aus'] })).status).toBe(400);
    expect((await t.eintragen('member-token', { teilnehmende: ['neu'] })).status).toBe(201);
    expect(
      (
        await t.eintragen('member-token', {
          teilnehmende: ['a'],
          zeitpunkt: '2999-01-01T00:00:00Z',
        })
      ).status,
    ).toBe(400);
    expect(
      (await t.eintragen('member-token', { trichterId: 'nope', teilnehmende: ['a'] })).status,
    ).toBe(400);
    expect(
      (await t.eintragen('member-token', { volumenL: 3, teilnehmende: ['a', 'r'] })).status,
    ).toBe(201);
  });

  it('deletes a Durchgang only by its author or the management', async () => {
    const t = await setup();
    const eintragen = async () =>
      (
        (await (await t.eintragen('member-token', { teilnehmende: ['a'] })).json()) as {
          id: string;
        }
      ).id;
    const loeschen = (token: string, id: string) =>
      t.app.request(`/api/trichter/durchgaenge/${id}`, json(token, 'DELETE'));
    const id = await eintragen();
    expect((await loeschen('reader-token', id)).status).toBe(403);
    expect((await loeschen('member-token', id)).status).toBe(200);
    expect((await loeschen('member-token', id)).status).toBe(404);
    expect((await loeschen('reader-token', await eintragen())).status).toBe(403);
    expect((await loeschen('vorstand-token', await eintragen())).status).toBe(200);
    expect((await loeschen('admin-token', await eintragen())).status).toBe(200);
  });

  it('rejects entries in closed calendar years (create and delete)', async () => {
    const t = await setup();
    const msg = 'Einträge in abgeschlossenen Jahren lassen sich nicht mehr anlegen oder ändern.';
    const jahr = Number(new Date().toISOString().slice(0, 4));
    const vorjahr = await t.eintragen('member-token', {
      teilnehmende: ['a'],
      zeitpunkt: new Date(Date.UTC(jahr - 1, 11, 31, 12)).toISOString(),
    });
    expect(vorjahr.status).toBe(400);
    expect(await vorjahr.json()).toEqual({ error: msg });
    // Within the current year it still works.
    expect(
      (
        await t.eintragen('member-token', {
          teilnehmende: ['a'],
          zeitpunkt: new Date(Date.UTC(jahr, 0, 1, 12)).toISOString(),
        })
      ).status,
    ).toBe(201);
    // An entry that is already in a past year cannot be deleted either.
    const alt = await t.trichter.durchgangAnlegen({
      trichterId: t.id,
      volumenMl: 1000,
      zeitpunkt: new Date(Date.UTC(jahr - 1, 5, 1)),
      eingetragenVon: 'm',
      teilnehmende: ['a'],
    });
    const res = await t.app.request(
      `/api/trichter/durchgaenge/${alt}`,
      json('admin-token', 'DELETE'),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: msg });
  });

  it('lists Durchgänge page by page with darfLoeschen', async () => {
    const t = await setup();
    for (let i = 0; i < 22; i++) {
      const zeitpunkt = new Date(Date.now() - (i + 1) * 3_600_000).toISOString();
      await t.eintragen('member-token', { teilnehmende: ['a', 'r'], volumenL: 1, zeitpunkt });
    }
    const erste = (await (
      await t.app.request('/api/trichter/durchgaenge', json('member-token', 'GET'))
    ).json()) as DurchgaengeSeiteDto;
    expect(erste.durchgaenge).toHaveLength(20);
    expect(erste.weiter).toEqual(expect.any(String));
    expect(erste.durchgaenge[0]).toMatchObject({
      trichter: { id: t.id, name: 'Dicker' },
      volumenMl: 1000,
      darfLoeschen: true,
      eingetragenVon: { sub: 'm2', username: 'user-m2', status: 'anwaerter' },
    });
    expect(erste.durchgaenge[0]!.teilnehmende.map((m) => m.sub)).toEqual(['a', 'r']);
    const zeiten = erste.durchgaenge.map((d) => d.zeitpunkt);
    expect(zeiten).toEqual([...zeiten].sort().reverse());
    const zweite = (await (
      await t.app.request(
        `/api/trichter/durchgaenge?vor=${encodeURIComponent(erste.weiter!)}`,
        json('reader-token', 'GET'),
      )
    ).json()) as DurchgaengeSeiteDto;
    expect(zweite.durchgaenge).toHaveLength(2);
    expect(zweite.weiter).toBeNull();
    expect(zweite.durchgaenge.every((d) => !d.darfLoeschen)).toBe(true);
    expect(
      (await t.app.request('/api/trichter/durchgaenge?vor=kaputt', json('reader-token', 'GET')))
        .status,
    ).toBe(400);
  });

  it('shows the kings and the ranking per year', async () => {
    const t = await setup();
    const jahr = Number(new Date().toISOString().slice(0, 4));
    const mitte = (j: number) => `${j}-06-15T12:00:00Z`;
    // Last year: r twice. This year: a twice (shared volume), r once.
    for (let i = 0; i < 2; i++) {
      await t.trichter.durchgangAnlegen({
        trichterId: t.id,
        volumenMl: 2000,
        zeitpunkt: new Date(mitte(jahr - 1)),
        eingetragenVon: 'm',
        teilnehmende: ['r'],
      });
    }
    await t.eintragen('member-token', {
      teilnehmende: ['a', 'r'],
      volumenL: 2,
      zeitpunkt: `${jahr}-01-01T12:00:00Z`,
    });
    await t.eintragen('member-token', { teilnehmende: ['a'], volumenL: 1 });
    const holen = async (query = '') =>
      (await (
        await t.app.request(`/api/trichter/uebersicht${query}`, json('reader-token', 'GET'))
      ).json()) as TrichterUebersichtDto;

    const alle = await holen();
    expect(alle.jahr).toBeNull();
    expect(alle.jahre).toEqual([jahr, jahr - 1]);
    expect(alle.jahreskoenige.map((m) => m.sub)).toEqual(['a']);
    expect(alle.ewigeKoenige.map((m) => m.sub)).toEqual(['r']);
    expect(alle.rangliste.map((z) => [z.mitglied.sub, z.anzahl, z.ml])).toEqual([
      ['r', 3, 5000],
      ['a', 2, 2000],
    ]);
    expect(alle.rangliste[0]!.mitglied).toMatchObject({ username: 'user-r', anrede: 'neutral' });

    const letztes = await holen(`?jahr=${jahr - 1}`);
    expect(letztes.rangliste.map((z) => [z.mitglied.sub, z.anzahl, z.ml])).toEqual([
      ['r', 2, 4000],
    ]);
    expect(letztes.jahreskoenige.map((m) => m.sub)).toEqual(['a']);
    expect(letztes.ewigeKoenige.map((m) => m.sub)).toEqual(['r']);
    expect(
      (await t.app.request('/api/trichter/uebersicht?jahr=x', json('reader-token', 'GET'))).status,
    ).toBe(400);
  });

  it('names everybody on a full tie', async () => {
    const t = await setup();
    await t.eintragen('member-token', { teilnehmende: ['a'], volumenL: 1 });
    await t.eintragen('member-token', { teilnehmende: ['r'], volumenL: 1 });
    const res = (await (
      await t.app.request('/api/trichter/uebersicht', json('reader-token', 'GET'))
    ).json()) as TrichterUebersichtDto;
    expect(res.jahreskoenige.map((m) => m.sub).sort()).toEqual(['a', 'r']);
    expect(res.ewigeKoenige.map((m) => m.sub).sort()).toEqual(['a', 'r']);
  });

  it('has no kings without entries', async () => {
    const t = await setup();
    const res = (await (
      await t.app.request('/api/trichter/uebersicht', json('reader-token', 'GET'))
    ).json()) as TrichterUebersichtDto;
    expect(res).toMatchObject({ jahreskoenige: [], ewigeKoenige: [], rangliste: [], jahre: [] });
  });
});

describe('accounts deaktivieren', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  /** Profiles for a (admin), r, v, m2 with Cognito accounts `user-<sub>`. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          {
            sub,
            kontoName: `konto-${sub}`,
            username: `user-${sub}`,
            aktiviert: true,
            enabled: true,
          },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
    }
    const aktiv = (token: string, sub: string, aktiv: boolean) =>
      t.app.request(`/api/admin/mitglieder/${sub}/aktiv`, json(token, 'PUT', { aktiv }));
    return { ...t, aktiv };
  }

  it('lets only users:manage (de)activate, never yourself, and mirrors it in Cognito', async () => {
    const t = await setup();
    expect((await t.aktiv('reader-token', 'm2', false)).status).toBe(403);
    expect((await t.aktiv('member-token', 'm2', false)).status).toBe(403);
    expect(
      (await t.app.request('/api/admin/mitglieder/m2/aktiv', json('admin-token', 'PUT', {})))
        .status,
    ).toBe(400);
    const selbst = await t.aktiv('admin-token', 'a', false);
    expect(selbst.status).toBe(400);
    expect(await selbst.json()).toEqual({ error: 'Du kannst dich nicht selbst deaktivieren.' });
    expect((await t.aktiv('admin-token', 'unbekannt', false)).status).toBe(404);
    expect(t.userAdmin.setEnabled).not.toHaveBeenCalled();

    const aus = await t.aktiv('admin-token', 'm2', false);
    expect(aus.status).toBe(200);
    expect(await aus.json()).toEqual({ aktiv: false });
    expect(t.mitglieder.deaktiviertSetzen).toHaveBeenLastCalledWith('m2', true);
    expect(t.userAdmin.setEnabled).toHaveBeenLastCalledWith('konto-m2', false);

    const an = await t.aktiv('admin-token', 'm2', true);
    expect(await an.json()).toEqual({ aktiv: true });
    expect(t.mitglieder.deaktiviertSetzen).toHaveBeenLastCalledWith('m2', false);
    expect(t.userAdmin.setEnabled).toHaveBeenLastCalledWith('konto-m2', true);
  });

  it('refuses to change the status of a deactivated account', async () => {
    const t = await setup();
    const setze = (status: string) =>
      t.app.request('/api/admin/mitglieder/m2/status', json('admin-token', 'PUT', { status }));
    await t.aktiv('admin-token', 'm2', false);
    const res = await setze('em');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Der Account ist deaktiviert, der Status kann nicht geändert werden.',
    });
    expect((await t.mitglieder.holen('m2'))?.status).toBe('anwaerter');
    await t.aktiv('admin-token', 'm2', true);
    expect((await setze('em')).status).toBe(200);
  });

  it('creates an empty row when the member has none yet', async () => {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map([['neu', { sub: 'neu', kontoName: 'konto-neu', aktiviert: true, enabled: true }]]),
    );
    const res = await t.app.request(
      '/api/admin/mitglieder/neu/aktiv',
      json('admin-token', 'PUT', { aktiv: false }),
    );
    expect(res.status).toBe(200);
    expect((await t.mitglieder.holen('neu'))?.deaktiviertAm).toBeInstanceOf(Date);
    expect((await t.mitglieder.holen('neu'))?.status).toBe('anwaerter');
  });

  it('answers requests of a deactivated member with 403 and a distinguishable body', async () => {
    const t = await setup();
    expect((await t.app.request('/api/me', json('reader-token', 'GET'))).status).toBe(200);
    await t.aktiv('admin-token', 'r', false);
    for (const url of [
      '/api/me',
      '/api/mitglieder',
      '/api/kalender/events?von=2026-01-01&bis=2026-01-31',
    ]) {
      const res = await t.app.request(url, json('reader-token', 'GET'));
      expect(res.status, url).toBe(403);
      expect(await res.json()).toEqual({
        error: 'Dein Account ist deaktiviert.',
        deaktiviert: true,
      });
    }
    // other 403s do not carry the flag
    const verboten = await t.app.request('/api/admin/users', json('member-token', 'POST', {}));
    expect(await verboten.json()).toEqual({ error: 'Forbidden' });
    await t.aktiv('admin-token', 'r', true);
    expect((await t.app.request('/api/me', json('reader-token', 'GET'))).status).toBe(200);
  });

  it('lists deactivated members only for admins who ask, but the detail always works', async () => {
    const t = await setup();
    await t.aktiv('admin-token', 'm2', false);
    const subs = async (url: string, token: string) =>
      ((await (await t.app.request(url, json(token, 'GET'))).json()) as { sub: string }[]).map(
        (m) => m.sub,
      );
    expect(await subs('/api/mitglieder', 'admin-token')).not.toContain('m2');
    expect(await subs('/api/mitglieder', 'reader-token')).not.toContain('m2');
    expect(await subs('/api/mitglieder?deaktivierte=1', 'reader-token')).not.toContain('m2');
    const mit = await t.app.request('/api/mitglieder?deaktivierte=1', json('admin-token', 'GET'));
    const liste = (await mit.json()) as { sub: string; deaktiviert: boolean }[];
    expect(liste.find((m) => m.sub === 'm2')).toMatchObject({ deaktiviert: true });
    expect(liste.find((m) => m.sub === 'r')).toMatchObject({ deaktiviert: false });
    for (const token of ['reader-token', 'admin-token']) {
      const detail = await t.app.request('/api/mitglieder/user-m2', json(token, 'GET'));
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({ sub: 'm2', deaktiviert: true });
    }
  });

  it('previews future Dienste, current Posten and held keys', async () => {
    const t = await setup();
    const heute = heuteBerlin();
    const dienst = (id: string, eventId: string, tage: number, abgesagt = false) => ({
      id,
      eventId,
      eventTitel: `Event ${eventId}`,
      schichtArt: 'betrieb' as const,
      dienstformName: 'Bar',
      beginn: `${tagNachher(heute, tage)}T18:00:00.000Z`,
      ende: `${tagNachher(heute, tage)}T21:00:00.000Z`,
      abgesagt,
    });
    t.kalender.meineDienste.mockResolvedValue([
      dienst('d0', 'e0', -3),
      dienst('d1', 'e1', 2),
      dienst('d2', 'e1', 2),
      dienst('d3', 'e2', 5, true),
      dienst('d4', 'e3', 7),
    ]);
    t.posten.aktuelleNachMitglied.mockResolvedValue(
      new Map([
        [
          'm2',
          [
            {
              id: 'p1',
              name: 'Kasse',
              bezeichnungMaennlich: null,
              bezeichnungWeiblich: null,
              bezeichnungNeutral: null,
            },
          ],
        ],
      ]),
    );
    await t.schluessel.anlegen(
      { name: 'Haupttür', beschreibung: null, halter: { art: 'mitglied', sub: 'm2' } },
      'a',
    );
    await t.schluessel.anlegen(
      { name: 'Keller', beschreibung: null, halter: { art: 'mitglied', sub: 'r' } },
      'a',
    );
    const res = await t.app.request(
      '/api/admin/mitglieder/m2/deaktivieren-vorschau',
      json('admin-token', 'GET'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dienste: [
        { eventId: 'e1', titel: 'Event e1', datum: tagNachher(heute, 2) },
        { eventId: 'e3', titel: 'Event e3', datum: tagNachher(heute, 7) },
      ],
      posten: [{ id: 'p1', name: 'Kasse' }],
      schluessel: [{ id: 's1', name: 'Haupttür' }],
    });
    expect(t.kalender.meineDienste).toHaveBeenLastCalledWith('m2', expect.any(Date));
    expect(
      (
        await t.app.request(
          '/api/admin/mitglieder/m2/deaktivieren-vorschau',
          json('reader-token', 'GET'),
        )
      ).status,
    ).toBe(403);
  });

  it('refuses to enter a deactivated member', async () => {
    const t = await setup();
    await t.aktiv('admin-token', 'm2', false);
    const abgelehnt = async (res: Response) => {
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Das Mitglied ist deaktiviert.' });
    };
    // Dienst by somebody else
    await abgelehnt(
      await t.app.request(
        '/api/kalender/schichten/s1/dienste',
        json('reader-token', 'POST', { dienstformId: 'f1', mitgliedSub: 'm2' }),
      ),
    );
    expect(t.kalender.dienstEintragen).not.toHaveBeenCalled();
    // Posten holder
    const p = await t.app.request(
      '/api/posten',
      json('admin-token', 'POST', { name: 'Kasse', beschreibung: null }),
    );
    const { id } = (await p.json()) as { id: string };
    await abgelehnt(
      await t.app.request(
        `/api/posten/${id}/besetzungen`,
        json('admin-token', 'POST', { mitgliedSub: 'm2', start: heuteBerlin() }),
      ),
    );
    // Key holder and Übergabe
    await abgelehnt(
      await t.app.request(
        '/api/schluessel',
        json('admin-token', 'POST', { name: 'Tür', halter: { art: 'mitglied', sub: 'm2' } }),
      ),
    );
    const s = await t.app.request(
      '/api/schluessel',
      json('admin-token', 'POST', { name: 'Tür', halter: { art: 'mitglied', sub: 'r' } }),
    );
    const { id: schluesselId } = (await s.json()) as { id: string };
    await abgelehnt(
      await t.app.request(
        `/api/schluessel/${schluesselId}/uebergaben`,
        json('reader-token', 'POST', {
          von: { art: 'mitglied', sub: 'r' },
          an: { art: 'mitglied', sub: 'm2' },
        }),
      ),
    );
    // Trichter participant
    const tr = await t.app.request(
      '/api/trichter',
      json('admin-token', 'POST', { name: 'Dicker', volumenL: 3, auslaesse: 2 }),
    );
    const { id: trichterId } = (await tr.json()) as { id: string };
    await abgelehnt(
      await t.app.request(
        '/api/trichter/durchgaenge',
        json('reader-token', 'POST', { trichterId, volumenL: 2, teilnehmende: ['m2'] }),
      ),
    );
    // individual in a poll circle
    const umfrage = {
      titel: 'Fest',
      beschreibung: null,
      endetAm: tagNachher(heuteBerlin(), 10),
      anonym: false,
      ergebnisse: 'sofort',
      pflicht: { status: [], posten: [], personen: ['m2'] },
      optional: { status: [], posten: [], personen: [] },
      erinnerungenPflicht: [],
      erinnerungenOptional: [],
      fragen: [{ text: 'Wann?', freitext: true, maxAntworten: 1, optionen: [{ text: 'Samstag' }] }],
    };
    await abgelehnt(await t.app.request('/api/umfragen', json('admin-token', 'POST', umfrage)));
    // reactivated: allowed again
    await t.aktiv('admin-token', 'm2', true);
    expect(
      (await t.app.request('/api/umfragen', json('admin-token', 'POST', umfrage))).status,
    ).toBe(201);
  });

  it('keeps names of deactivated members in old Trichter entries', async () => {
    const t = await setup();
    const tr = await t.app.request(
      '/api/trichter',
      json('admin-token', 'POST', { name: 'Dicker', volumenL: 3, auslaesse: 2 }),
    );
    const { id: trichterId } = (await tr.json()) as { id: string };
    const eintrag = await t.app.request(
      '/api/trichter/durchgaenge',
      json('reader-token', 'POST', { trichterId, volumenL: 2, teilnehmende: ['m2'] }),
    );
    expect(eintrag.status).toBe(201);
    await t.aktiv('admin-token', 'm2', false);
    const liste = await t.app.request('/api/trichter/durchgaenge', json('admin-token', 'GET'));
    expect(JSON.stringify(await liste.json())).toContain('user-m2');
  });

  it('hides deactivated members from the birthday calendar', async () => {
    const t = await setup();
    await t.mitglieder.speichern('m2', {
      vorname: 'Eva',
      nachname: 'Muster',
      anrede: 'weiblich',
      kontaktkanaele: null,
      discordName: null,
      adresse: null,
      telefon: null,
      ueberMich: null,
      profilbildKey: null,
      geburtsdatum: '1990-06-20',
      geburtstagImKalender: true,
      wohnheim: null,
    });
    const abfrage = async () =>
      (await (
        await t.app.request(
          '/api/kalender/geburtstage?von=2026-06-01&bis=2026-06-30',
          json('reader-token', 'GET'),
        )
      ).json()) as unknown[];
    expect(await abfrage()).toHaveLength(1);
    await t.aktiv('admin-token', 'm2', false);
    expect(await abfrage()).toHaveLength(0);
  });
});

describe('Status-Verlauf', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const leer: MitgliedDaten = {
    vorname: 'A',
    nachname: 'B',
    anrede: 'neutral',
    kontaktkanaele: null,
    discordName: null,
    adresse: null,
    telefon: null,
    ueberMich: null,
    profilbildKey: null,
    geburtsdatum: null,
    geburtstagImKalender: null,
    wohnheim: null,
  };

  /** Profiles for a (admin), r (reader), m2 (member); r starts as Anwaerter today. */
  async function setup() {
    const t = makeApp();
    for (const sub of ['a', 'r', 'm2']) await t.mitglieder.speichern(sub, leer);
    const url = (sub = 'r', id = '') => `/api/admin/mitglieder/${sub}/status-verlauf${id}`;
    const historie = async (token = 'member-token', kennung = 'r') =>
      (await (
        await t.app.request(`/api/mitglieder/${kennung}/historie`, json(token, 'GET'))
      ).json()) as MitgliedHistorie;
    return { ...t, url, historie };
  }

  it('creates an entry with today when a member row is created', async () => {
    const t = await setup();
    expect((await t.historie()).statusVerlauf).toMatchObject([
      { status: 'anwaerter', ab: heuteBerlin() },
    ]);
  });

  it('is readable by members, with Posten and deactivation date', async () => {
    const t = await setup();
    const pid = await t.posten.anlegen({
      name: 'Kassenwart',
      beschreibung: null,
      bezeichnungMaennlich: null,
      bezeichnungWeiblich: null,
      bezeichnungNeutral: null,
    });
    await t.posten.besetzungAnlegen(pid, { mitgliedSub: 'r', start: '2024-01-01', ende: null });
    const res = await t.historie('member-token');
    expect(res.besetzungen).toEqual([
      { postenId: pid, postenName: 'Kassenwart', start: '2024-01-01', ende: null },
    ]);
    expect(res.deaktiviertAm).toBeNull();
    await t.mitglieder.deaktiviertSetzen('r', true);
    expect((await t.historie('member-token')).deaktiviertAm).toBe(heuteBerlin());
    expect(
      (await t.app.request('/api/mitglieder/unbekannt/historie', json('member-token', 'GET')))
        .status,
    ).toBe(404);
  });

  it('lets only admins edit the history', async () => {
    const t = await setup();
    const eingabe = { status: 'mitglied', ab: '2024-01-01' };
    expect((await t.app.request(t.url(), json('member-token', 'POST', eingabe))).status).toBe(403);
    expect(
      (await t.app.request(t.url('r', '/x'), json('reader-token', 'PUT', eingabe))).status,
    ).toBe(403);
    expect((await t.app.request(t.url('r', '/x'), json('reader-token', 'DELETE'))).status).toBe(
      403,
    );
  });

  it('keeps mitglieder.status on the newest entry', async () => {
    const t = await setup();
    const anlegen = (status: string, ab: string) =>
      t.app.request(t.url(), json('admin-token', 'POST', { status, ab }));
    expect((await anlegen('mitglied', '2020-01-01')).status).toBe(201);
    // older than today's Anwaerter entry: status stays
    expect((await t.mitglieder.holen('r'))?.status).toBe('anwaerter');
    const neu = (await (await anlegen('em', '2024-02-02')).json()) as StatusEintrag[];
    expect(neu.map((e) => e.ab)).toEqual(['2020-01-01', '2024-02-02', heuteBerlin()]);
    expect((await t.mitglieder.holen('r'))?.status).toBe('anwaerter');

    const heute = neu.find((e) => e.ab === heuteBerlin())!;
    // editing the date of today's entry to before the others makes "em" the newest
    const geaendert = await t.app.request(
      t.url('r', `/${heute.id}`),
      json('admin-token', 'PUT', { status: 'anwaerter', ab: '2019-01-01' }),
    );
    expect(geaendert.status).toBe(200);
    expect((await t.mitglieder.holen('r'))?.status).toBe('em');

    const em = neu.find((e) => e.status === 'em')!;
    const geloescht = await t.app.request(t.url('r', `/${em.id}`), json('admin-token', 'DELETE'));
    expect(geloescht.status).toBe(200);
    expect(((await geloescht.json()) as StatusEintrag[]).map((e) => e.status)).toEqual([
      'anwaerter',
      'mitglied',
    ]);
    expect((await t.mitglieder.holen('r'))?.status).toBe('mitglied');
  });

  it('rejects unknown entries, future dates, duplicates and deleting the last entry', async () => {
    const t = await setup();
    const heute = heuteBerlin();
    const eintrag = (await t.historie()).statusVerlauf[0]!;
    const post = (body: unknown, sub = 'r') =>
      t.app.request(t.url(sub), json('admin-token', 'POST', body));
    expect((await post({ status: 'mitglied', ab: '2024-01-01' }, 'unbekannt')).status).toBe(404);
    expect(
      (await t.app.request(t.url('r', '/gibtsnicht'), json('admin-token', 'DELETE'))).status,
    ).toBe(404);
    expect(
      (
        await t.app.request(
          t.url('r', '/gibtsnicht'),
          json('admin-token', 'PUT', { status: 'em', ab: '2024-01-01' }),
        )
      ).status,
    ).toBe(404);
    expect((await post({ status: 'mitglied', ab: tagNachher(heute, 1) })).status).toBe(400);
    expect((await post({ status: 'quatsch', ab: '2024-01-01' })).status).toBe(400);
    expect((await post({ status: 'mitglied', ab: heute })).status).toBe(409);
    const res = await t.app.request(t.url('r', `/${eintrag.id}`), json('admin-token', 'DELETE'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Der letzte Statuseintrag kann nicht gelöscht werden.',
    });
    // changing an entry onto another entry's day is a conflict, onto itself is fine
    await post({ status: 'mitglied', ab: '2024-01-01' });
    const [alt] = (await t.historie()).statusVerlauf;
    const auf = (ab: string) =>
      t.app.request(
        t.url('r', `/${alt!.id}`),
        json('admin-token', 'PUT', { status: 'mitglied', ab }),
      );
    expect((await auf(heute)).status).toBe(409);
    expect((await auf('2024-01-01')).status).toBe(200);
  });

  it('refuses to edit the history of a deactivated account', async () => {
    const t = await setup();
    const eintrag = (await t.historie()).statusVerlauf[0]!;
    await t.mitglieder.deaktiviertSetzen('r', true);
    for (const res of [
      await t.app.request(t.url(), json('admin-token', 'POST', { status: 'em', ab: '2024-01-01' })),
      await t.app.request(
        t.url('r', `/${eintrag.id}`),
        json('admin-token', 'PUT', { status: 'em', ab: '2024-01-01' }),
      ),
      await t.app.request(t.url('r', `/${eintrag.id}`), json('admin-token', 'DELETE')),
    ]) {
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toMatch(
        /^Der Account ist deaktiviert/,
      );
    }
  });

  it('PUT status takes an optional start date, default today', async () => {
    const t = await setup();
    const setze = (body: unknown) =>
      t.app.request('/api/admin/mitglieder/r/status', json('admin-token', 'PUT', body));
    expect((await setze({ status: 'mitglied', ab: tagNachher(heuteBerlin(), 1) })).status).toBe(
      400,
    );
    expect((await setze({ status: 'mitglied', ab: '2023-05-05' })).status).toBe(200);
    expect((await t.historie()).statusVerlauf.map((e) => [e.status, e.ab])).toEqual([
      ['mitglied', '2023-05-05'],
      ['anwaerter', heuteBerlin()],
    ]);
    // without ab: overwrites today's entry
    expect((await setze({ status: 'em' })).status).toBe(200);
    expect((await t.historie()).statusVerlauf.map((e) => [e.status, e.ab])).toEqual([
      ['mitglied', '2023-05-05'],
      ['em', heuteBerlin()],
    ]);
    expect((await t.mitglieder.holen('r'))?.status).toBe('em');
  });

  it('creates an entry with today when an admin invites', async () => {
    const t = await setup();
    t.userAdmin.createUser.mockResolvedValueOnce({
      username: 'u',
      email: 'x@example.de',
      sub: 'neu',
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
      groups: [],
    });
    await t.app.request(
      '/api/admin/users',
      json('admin-token', 'POST', { email: 'x@example.de', status: 'mitglied' }),
    );
    expect(await t.mitglieder.statusVerlauf('neu')).toMatchObject([
      { status: 'mitglied', ab: heuteBerlin() },
    ]);
  });
});

describe('bilder', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  /** Event as the store returns it: 14.06.2026, 20:00-23:00 Berlin. */
  const bilderEvent = (patch: Partial<EventDto> = {}): EventDto =>
    ({
      id: 'e1',
      titel: 'Sommerfest',
      anzeigeTitel: 'Sommerfest',
      beschreibung: null,
      kategorie: null,
      art: 'dienste',
      dauer: 'eintaegig',
      beginn: '2026-06-14T18:00:00.000Z',
      ende: '2026-06-14T21:00:00.000Z',
      abgesagt: false,
      serie: null,
      bewertung: 'gruen',
      schichten: [],
      teilnahmeStatus: null,
      teilnahmen: [],
      ichNehmeTeil: null,
      meineTeilnahme: null,
      nichtVerfuegbar: [],
      ichBinNichtVerfuegbar: false,
      verantwortlich: null,
      imAbo: false,
      bilderOrdnerUrl: null,
      bilderOrdnerId: null,
      ...patch,
    }) as EventDto;
  const eventBody = {
    titel: 'Sommerfest',
    kategorieId: 'k1',
    beginn: '2026-06-14T18:00:00.000Z',
    ende: '2026-06-14T21:00:00.000Z',
    schichten: [],
  };
  const speichern = (t: ReturnType<typeof makeApp>, event: EventDto) =>
    t.kalender.event.mockImplementation(async () => event);

  describe('Ordnerliste', () => {
    it('lists folders newest first with date, name and linked event', async () => {
      const t = makeApp();
      t.onedrive.hinzufuegen('2025-06-14_Alt');
      const neu = t.onedrive.hinzufuegen('2026-07-18-20_Festival');
      t.onedrive.hinzufuegen('Lose Fotos');
      t.kalenderBilder.set('e9', { id: neu.id, url: neu.webUrl });
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        verbunden: true,
        stand: expect.any(String),
        ausCache: false,
        ordner: [
          {
            id: neu.id,
            name: '2026-07-18-20_Festival',
            webUrl: neu.webUrl,
            von: '2026-07-18',
            bis: '2026-07-20',
            eventName: 'Festival',
            genauigkeit: 'tag',
            freigabeUrl: null,
            eventId: 'e9',
          },
          expect.objectContaining({ name: '2025-06-14_Alt', eventId: null, bis: '2025-06-14' }),
          expect.objectContaining({
            name: 'Lose Fotos',
            von: null,
            bis: null,
            eventName: 'Lose Fotos',
          }),
        ],
      });
    });

    it('uses cached sharing links and creates no links while listing', async () => {
      const t = makeApp();
      const a = t.onedrive.hinzufuegen('2025-06-14_A');
      const b = t.onedrive.hinzufuegen('2025-06-15_B');
      t.freigaben.karte.set(a.id, 'https://1drv.ms/f/cached');
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      const ordner = ((await res.json()) as { ordner: BilderOrdnerDto[] }).ordner;
      expect(ordner.find((o) => o.id === a.id)?.freigabeUrl).toBe('https://1drv.ms/f/cached');
      expect(ordner.find((o) => o.id === b.id)?.freigabeUrl).toBeNull();
      expect(t.onedrive.freigaben).toBe(0);
    });

    describe('Snapshot (quelle=cache)', () => {
      const lesen = async (t: ReturnType<typeof makeApp>, quelle = '?quelle=cache') =>
        (await (
          await t.app.request(`/api/bilder/ordner${quelle}`, json('reader-token', 'GET'))
        ).json()) as {
          verbunden: boolean;
          ordner: BilderOrdnerDto[];
          stand: string | null;
          ausCache: boolean;
        };

      it('is empty without a snapshot and does not ask OneDrive', async () => {
        const t = makeApp();
        t.onedrive.hinzufuegen('2025-06-14_A');
        t.onedrive.zustand.ausfall = true;
        expect(await lesen(t)).toEqual({
          verbunden: true,
          ordner: [],
          stand: null,
          ausCache: true,
        });
      });

      it('reports verbunden: false from the status', async () => {
        const t = makeApp();
        t.onedrive.zustand.verbunden = false;
        expect(await lesen(t)).toEqual({
          verbunden: false,
          ordner: [],
          stand: null,
          ausCache: true,
        });
      });

      it('returns the list stored by the live load, with fresh event and link data', async () => {
        const t = makeApp();
        const a = t.onedrive.hinzufuegen('2025-06-14_A');
        t.onedrive.hinzufuegen('2025-06-15_B');
        const live = await lesen(t, '');
        expect(live.ausCache).toBe(false);
        // OneDrive is not asked for the snapshot; links and events changed after the live load show up.
        t.onedrive.zustand.ausfall = true;
        t.kalenderBilder.set('e5', { id: a.id, url: a.webUrl });
        t.freigaben.karte.set(a.id, 'https://1drv.ms/f/neu');
        const cache = await lesen(t);
        expect(cache).toMatchObject({ verbunden: true, ausCache: true, stand: live.stand });
        expect(cache.ordner.map((o) => o.name)).toEqual(['2025-06-15_B', '2025-06-14_A']);
        expect(cache.ordner.find((o) => o.id === a.id)).toMatchObject({
          eventId: 'e5',
          freigabeUrl: 'https://1drv.ms/f/neu',
        });
      });

      it('shows a folder created with POST at once', async () => {
        const t = makeApp();
        t.onedrive.hinzufuegen('2025-06-14_A');
        await lesen(t, '');
        await t.app.request(
          '/api/bilder/ordner',
          json('reader-token', 'POST', { eventName: 'Neu', von: '2026-05-01' }),
        );
        const cache = await lesen(t);
        expect(cache.ordner.map((o) => o.name)).toEqual(['2026-05-01_Neu', '2025-06-14_A']);
      });
    });

    describe('Job bilder.freigaben', () => {
      it('creates the missing links of the snapshot folders', async () => {
        const t = makeApp();
        const a = t.onedrive.hinzufuegen('2025-06-14_A');
        const b = t.onedrive.hinzufuegen('2025-06-15_B');
        t.freigaben.karte.set(a.id, 'https://1drv.ms/f/cached');
        await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
        const deps = { onedrive: t.onedrive, ordnerCache: t.ordnerCache, freigaben: t.freigaben };
        expect(await freigabenNachziehen(deps)).toBe(1);
        expect(t.onedrive.freigaben).toBe(1);
        expect(t.freigaben.karte.get(b.id)).toBe(`https://1drv.ms/f/${b.id}`);
        expect(await freigabenNachziehen(deps)).toBe(0);
      });

      it('respects the time budget, logs failures and does nothing when not connected', async () => {
        const t = makeApp();
        const a = t.onedrive.hinzufuegen('2025-06-14_A');
        const b = t.onedrive.hinzufuegen('2025-06-15_B');
        await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
        const deps = { onedrive: t.onedrive, ordnerCache: t.ordnerCache, freigaben: t.freigaben };
        expect(await freigabenNachziehen(deps, 0)).toBe(0);
        const echt = t.onedrive.freigabeLink;
        t.onedrive.freigabeLink = async (id) => {
          if (id === a.id) throw new Error('kaputt');
          return echt(id);
        };
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await freigabenNachziehen(deps)).toBe(1);
        log.mockRestore();
        expect(t.freigaben.karte.has(a.id)).toBe(false);
        expect(t.freigaben.karte.has(b.id)).toBe(true);
        t.onedrive.zustand.verbunden = false;
        t.freigaben.karte.clear();
        expect(await freigabenNachziehen(deps)).toBe(0);
      });
    });

    it('reports the precision of year and month folders', async () => {
      const t = makeApp();
      t.onedrive.hinzufuegen('2025_Archiv');
      t.onedrive.hinzufuegen('2025-07');
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      const ordner = ((await res.json()) as { ordner: BilderOrdnerDto[] }).ordner;
      expect(ordner.map((o) => [o.name, o.genauigkeit])).toEqual([
        ['2025-07', 'monat'],
        ['2025_Archiv', 'jahr'],
      ]);
    });

    it('answers verbunden: false when OneDrive is not connected', async () => {
      const t = makeApp();
      t.onedrive.zustand.verbunden = false;
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        verbunden: false,
        ordner: [],
        stand: null,
        ausCache: false,
      });
    });

    it('requires authentication and answers 502 when OneDrive fails', async () => {
      const t = makeApp();
      expect((await t.app.request('/api/bilder/ordner')).status).toBe(401);
      t.onedrive.zustand.ausfall = true;
      const res = await t.app.request('/api/bilder/ordner', json('reader-token', 'GET'));
      expect(res.status).toBe(502);
    });
  });

  describe('Ordner anlegen', () => {
    it('creates a folder with the shortest date form for every member', async () => {
      const t = makeApp();
      const res = await t.app.request(
        '/api/bilder/ordner',
        json('reader-token', 'POST', {
          eventName: ' Sommerfest ',
          von: '2026-07-30',
          bis: '2026-08-02',
        }),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        name: '2026-07-30-08-02_Sommerfest',
        von: '2026-07-30',
        bis: '2026-08-02',
        eventName: 'Sommerfest',
        eventId: null,
      });
      expect([...t.onedrive.ordner.values()].map((o) => o.name)).toEqual([
        '2026-07-30-08-02_Sommerfest',
      ]);
    });

    it('puts underscores between the words and caches the sharing link', async () => {
      const t = makeApp();
      const res = await t.app.request(
        '/api/bilder/ordner',
        json('reader-token', 'POST', { eventName: 'Erster Mai', von: '2026-05-01' }),
      );
      const dto = (await res.json()) as BilderOrdnerDto;
      expect(dto).toMatchObject({
        name: '2026-05-01_Erster_Mai',
        eventName: 'Erster Mai',
        freigabeUrl: `https://1drv.ms/f/${dto.id}`,
      });
      expect(t.freigaben.karte.get(dto.id)).toBe(dto.freigabeUrl);
    });

    it('answers 409 for an existing name, 503 when not connected and 400 for bad input', async () => {
      const t = makeApp();
      t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      const body = { eventName: 'Sommerfest', von: '2026-06-14' };
      const doppelt = await t.app.request('/api/bilder/ordner', json('reader-token', 'POST', body));
      expect(doppelt.status).toBe(409);
      expect(await doppelt.json()).toEqual({
        error: 'Einen Ordner „2026-06-14_Sommerfest“ gibt es schon.',
      });
      expect(
        (
          await t.app.request(
            '/api/bilder/ordner',
            json('reader-token', 'POST', { eventName: '', von: '2026-06-14' }),
          )
        ).status,
      ).toBe(400);
      t.onedrive.zustand.verbunden = false;
      const nicht = await t.app.request('/api/bilder/ordner', json('reader-token', 'POST', body));
      expect(nicht.status).toBe(503);
      expect(await nicht.json()).toEqual({ error: 'OneDrive ist nicht verbunden.' });
    });
  });

  describe('Freigabe', () => {
    it('creates, caches and returns the sharing link for every member', async () => {
      const t = makeApp();
      const o = t.onedrive.hinzufuegen('2025-06-14_A');
      await t.ordnerCache.schreiben([o], new Date());
      const res = await t.app.request(
        `/api/bilder/ordner/${o.id}/freigabe`,
        json('reader-token', 'POST'),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: `https://1drv.ms/f/${o.id}` });
      expect(t.freigaben.karte.get(o.id)).toBe(`https://1drv.ms/f/${o.id}`);
    });

    it('answers 401, 503 and 404', async () => {
      const t = makeApp();
      const o = t.onedrive.hinzufuegen('2025-06-14_A');
      await t.ordnerCache.schreiben([o], new Date());
      const url = `/api/bilder/ordner/${o.id}/freigabe`;
      expect((await t.app.request(url, { method: 'POST' })).status).toBe(401);
      expect(
        (
          await t.app.request(
            '/api/bilder/ordner/gibtsnicht/freigabe',
            json('reader-token', 'POST'),
          )
        ).status,
      ).toBe(404);
      t.onedrive.zustand.verbunden = false;
      expect((await t.app.request(url, json('reader-token', 'POST'))).status).toBe(503);
    });

    it('refuses ids of folders the app does not know', async () => {
      const t = makeApp();
      const bekannt = t.onedrive.hinzufuegen('2025-06-14_A');
      const fremd = t.onedrive.hinzufuegen('2025-06-15_Fremd');
      await t.ordnerCache.schreiben([bekannt], new Date());
      const res = await t.app.request(
        `/api/bilder/ordner/${fremd.id}/freigabe`,
        json('reader-token', 'POST'),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Ordner nicht gefunden' });
      expect(t.onedrive.freigaben).toBe(0);
      // A folder with a stored sharing link is known as well.
      t.freigaben.karte.set(fremd.id, 'https://1drv.ms/f/alt');
      const ok = await t.app.request(
        `/api/bilder/ordner/${fremd.id}/freigabe`,
        json('reader-token', 'POST'),
      );
      expect(ok.status).toBe(200);
    });
  });

  describe('Verbindung', () => {
    it('is for admins only', async () => {
      const t = makeApp();
      for (const [url, method] of [
        ['/api/bilder/verbindung', 'GET'],
        ['/api/bilder/verbindung', 'PUT'],
        ['/api/bilder/verbindung/login', 'POST'],
        ['/api/bilder/verbindung/code', 'POST'],
        ['/api/bilder/verbindung', 'DELETE'],
      ] as const) {
        const body = method === 'PUT' || method === 'POST' ? {} : undefined;
        expect((await t.app.request(url, json('reader-token', method, body))).status, url).toBe(
          403,
        );
      }
    });

    it('shows the status, saves the settings, logs in and disconnects', async () => {
      const t = makeApp();
      const status = await t.app.request('/api/bilder/verbindung', json('admin-token', 'GET'));
      expect(await status.json()).toMatchObject({ verbunden: true, basisPfad: 'Cloud4/Bilder' });

      const put = await t.app.request(
        '/api/bilder/verbindung',
        json('admin-token', 'PUT', { clientId: 'abc', clientSecret: 'geheim', basisPfad: 'X/Y' }),
      );
      expect(put.status).toBe(200);
      expect(await put.json()).toMatchObject({ basisPfad: 'X/Y', clientIdGesetzt: true });
      expect(JSON.stringify(await t.onedrive.status())).not.toContain('geheim');

      const login = await t.app.request(
        '/api/bilder/verbindung/login',
        json('admin-token', 'POST', {
          redirectUri: 'http://localhost:5173/app/bilder/einrichtung',
          state: 'zufall1234',
        }),
      );
      expect(login.status).toBe(200);
      expect(((await login.json()) as { url: string }).url).toContain('state=zufall1234');

      const code = await t.app.request(
        '/api/bilder/verbindung/code',
        json('admin-token', 'POST', {
          code: 'c1',
          redirectUri: 'http://localhost:5173/app/bilder/einrichtung',
        }),
      );
      expect(code.status).toBe(200);
      expect(t.onedrive.codes).toEqual(['c1']);
      const schlecht = await t.app.request(
        '/api/bilder/verbindung/code',
        json('admin-token', 'POST', {
          code: 'ungueltig',
          redirectUri: 'http://localhost:5173/app/bilder/einrichtung',
        }),
      );
      expect(schlecht.status).toBe(400);

      const del = await t.app.request('/api/bilder/verbindung', json('admin-token', 'DELETE'));
      expect(await del.json()).toMatchObject({ verbunden: false });
    });

    it('accepts only redirect URIs of the app', async () => {
      const t = makeApp(async () => {}, 'https://www.c4-leipzig.de');
      const login = (redirectUri: string) =>
        t.app.request(
          '/api/bilder/verbindung/login',
          json('admin-token', 'POST', { redirectUri, state: 'zufall1234' }),
        );
      expect((await login('https://www.c4-leipzig.de/app/bilder/einrichtung')).status).toBe(200);
      expect((await login('http://localhost:5173/app/bilder/einrichtung')).status).toBe(200);
      expect((await login('https://boese.example/app/bilder/einrichtung')).status).toBe(400);
      expect((await login('https://www.c4-leipzig.de/app/anderes')).status).toBe(400);
      expect(
        (await login('https://www.c4-leipzig.de.evil.com/app/bilder/einrichtung')).status,
      ).toBe(400);
    });
  });

  describe('Events', () => {
    it('creates the folder when a new event asks for it', async () => {
      const t = makeApp();
      speichern(t, bilderEvent());
      const res = await t.app.request(
        '/api/kalender/events',
        json('admin-token', 'POST', { ...eventBody, bilderOrdner: true }),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 'e1' });
      const ordner = [...t.onedrive.ordner.values()];
      expect(ordner.map((o) => o.name)).toEqual(['2026-06-14_Sommerfest']);
      expect(t.kalenderBilder.get('e1')).toEqual({ id: ordner[0]!.id, url: ordner[0]!.webUrl });
    });

    it('creates no folder without the flag', async () => {
      const t = makeApp();
      speichern(t, bilderEvent());
      await t.app.request('/api/kalender/events', json('admin-token', 'POST', eventBody));
      expect(t.onedrive.ordner.size).toBe(0);
    });

    it('creates a folder on update for an event without one, and uses the multi-day range', async () => {
      const t = makeApp();
      speichern(
        t,
        bilderEvent({
          dauer: 'ganztaegig',
          beginn: '2026-07-17T22:00:00.000Z',
          ende: '2026-07-20T22:00:00.000Z',
        }),
      );
      const res = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', { ...eventBody, bilderOrdner: true }),
      );
      expect(await res.json()).toEqual({ ok: true });
      expect([...t.onedrive.ordner.values()].map((o) => o.name)).toEqual([
        '2026-07-18-20_Sommerfest',
      ]);
    });

    it('renames the folder when title or date change', async () => {
      const t = makeApp();
      const alt = t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      t.kalenderBilder.set('e1', { id: alt.id, url: alt.webUrl });
      speichern(
        t,
        bilderEvent({
          anzeigeTitel: 'Winterfest',
          beginn: '2026-12-05T18:00:00.000Z',
          ende: '2026-12-05T21:00:00.000Z',
        }),
      );
      const res = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', eventBody),
      );
      expect(await res.json()).toEqual({ ok: true });
      expect(t.onedrive.ordner.get(alt.id)?.name).toBe('2026-12-05_Winterfest');
      expect(t.kalenderBilder.get('e1')?.url).toBe(t.onedrive.ordner.get(alt.id)?.webUrl);
    });

    it('leaves a folder alone whose name is already right', async () => {
      const t = makeApp();
      const alt = t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      t.kalenderBilder.set('e1', { id: alt.id, url: 'alt' });
      speichern(t, bilderEvent());
      await t.app.request('/api/kalender/events/e1', json('admin-token', 'PUT', eventBody));
      expect(t.kalenderBilder.get('e1')?.url).toBe('alt');
    });

    it('does not rename an underscore folder of an event with spaces in its title', async () => {
      const t = makeApp();
      const alt = t.onedrive.hinzufuegen('2026-06-14_Erster_Mai');
      t.kalenderBilder.set('e1', { id: alt.id, url: 'alt' });
      speichern(t, bilderEvent({ anzeigeTitel: 'Erster Mai' }));
      await t.app.request('/api/kalender/events/e1', json('admin-token', 'PUT', eventBody));
      expect(t.onedrive.ordner.get(alt.id)?.name).toBe('2026-06-14_Erster_Mai');
      expect(t.kalenderBilder.get('e1')?.url).toBe('alt');
    });

    it('drops the link when the folder is gone and hints on a name clash', async () => {
      const t = makeApp();
      t.kalenderBilder.set('e1', { id: 'weg', url: 'u' });
      speichern(t, bilderEvent());
      const res = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', eventBody),
      );
      expect(await res.json()).toMatchObject({
        ok: true,
        bilderHinweis: expect.stringContaining('existiert'),
      });
      expect(t.kalenderBilder.has('e1')).toBe(false);

      const eigener = t.onedrive.hinzufuegen('2026-06-14_Alt');
      t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      t.kalenderBilder.set('e1', { id: eigener.id, url: 'u' });
      const konflikt = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', eventBody),
      );
      expect(await konflikt.json()).toMatchObject({
        ok: true,
        bilderHinweis: expect.stringContaining('gibt es schon'),
      });
      expect(t.onedrive.ordner.get(eigener.id)?.name).toBe('2026-06-14_Alt');
      expect(t.kalenderBilder.get('e1')?.id).toBe(eigener.id);
    });

    it('never fails the event save but adds a hint when OneDrive is unavailable', async () => {
      const t = makeApp();
      speichern(t, bilderEvent());
      t.onedrive.zustand.verbunden = false;
      const nicht = await t.app.request(
        '/api/kalender/events',
        json('admin-token', 'POST', { ...eventBody, bilderOrdner: true }),
      );
      expect(nicht.status).toBe(201);
      expect(await nicht.json()).toEqual({
        id: 'e1',
        bilderHinweis: 'OneDrive ist nicht verbunden, der Bilder-Ordner wurde nicht angelegt.',
      });
      t.onedrive.zustand.verbunden = true;
      t.onedrive.zustand.ausfall = true;
      const netz = await t.app.request(
        '/api/kalender/events/e1',
        json('admin-token', 'PUT', { ...eventBody, bilderOrdner: true }),
      );
      expect(netz.status).toBe(200);
      expect(await netz.json()).toMatchObject({ ok: true, bilderHinweis: expect.any(String) });
      t.onedrive.zustand.ausfall = false;
      t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      const doppelt = await t.app.request(
        '/api/kalender/events',
        json('admin-token', 'POST', { ...eventBody, bilderOrdner: true }),
      );
      expect(await doppelt.json()).toMatchObject({
        bilderHinweis: expect.stringContaining('gibt es schon'),
      });
      expect(t.kalenderBilder.has('e1')).toBe(false);
    });

    it('deletes the folder of a deleted event only when it is empty', async () => {
      const t = makeApp();
      const leer = t.onedrive.hinzufuegen('2026-06-14_Leer');
      const voll = t.onedrive.hinzufuegen('2026-06-15_Voll', 3);
      t.kalenderBilder.set('e1', { id: leer.id, url: 'u' });
      t.kalenderBilder.set('e2', { id: voll.id, url: 'u' });
      t.freigaben.karte.set(leer.id, 'https://1drv.ms/f/leer');
      t.freigaben.karte.set(voll.id, 'https://1drv.ms/f/voll');
      t.kalender.eventLoeschen.mockImplementation(async (id) => {
        t.kalenderBilder.delete(id);
        return true;
      });
      expect(
        (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
      ).toBe(200);
      expect(t.onedrive.ordner.has(leer.id)).toBe(false);
      expect(t.freigaben.karte.has(leer.id)).toBe(false);
      expect(
        (await t.app.request('/api/kalender/events/e2', json('admin-token', 'DELETE'))).status,
      ).toBe(200);
      expect(t.onedrive.ordner.has(voll.id)).toBe(true);
      expect(t.freigaben.karte.has(voll.id)).toBe(true);
    });

    it('keeps folders when deleting fails and ignores OneDrive errors when deleting', async () => {
      const t = makeApp();
      const o = t.onedrive.hinzufuegen('2026-06-14_X');
      t.kalenderBilder.set('e1', { id: o.id, url: 'u' });
      t.kalender.eventLoeschen.mockRejectedValueOnce(
        new KalenderKonflikt('Das Event hat Dienste.'),
      );
      expect(
        (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
      ).toBe(409);
      expect(t.onedrive.ordner.has(o.id)).toBe(true);

      t.kalender.eventLoeschen.mockImplementationOnce(async (id) => {
        t.kalenderBilder.delete(id);
        return true;
      });
      t.onedrive.zustand.ausfall = true;
      expect(
        (await t.app.request('/api/kalender/events/e1', json('admin-token', 'DELETE'))).status,
      ).toBe(200);
    });

    it('cleans up the folders of events that a series change deletes', async () => {
      const t = makeApp();
      const o = t.onedrive.hinzufuegen('2026-06-14_Serie');
      t.kalenderBilder.set('e1', { id: o.id, url: 'u' });
      t.kalender.serieLoeschen.mockImplementationOnce(async () => {
        t.kalenderBilder.delete('e1');
        return true;
      });
      const res = await t.app.request(
        '/api/kalender/serien/s1?bestehende=anpassen',
        json('admin-token', 'DELETE'),
      );
      expect(res.status).toBe(200);
      expect(t.onedrive.ordner.has(o.id)).toBe(false);
    });

    it('lets every member create the folder of an existing event', async () => {
      const t = makeApp();
      speichern(t, bilderEvent());
      const res = await t.app.request(
        '/api/kalender/events/e1/bilder-ordner',
        json('reader-token', 'POST'),
      );
      expect(res.status).toBe(201);
      const ordner = [...t.onedrive.ordner.values()][0]!;
      expect(ordner.name).toBe('2026-06-14_Sommerfest');
      expect(await res.json()).toEqual({ bilderOrdnerUrl: `https://1drv.ms/f/${ordner.id}` });
      expect(t.freigaben.karte.get(ordner.id)).toBe(`https://1drv.ms/f/${ordner.id}`);
      expect(t.kalenderBilder.get('e1')?.id).toBe(ordner.id);

      const nochmal = await t.app.request(
        '/api/kalender/events/e1/bilder-ordner',
        json('reader-token', 'POST'),
      );
      expect(nochmal.status).toBe(409);
    });

    it('answers 404, 503 and 409 when creating the folder of an event goes wrong', async () => {
      const t = makeApp();
      expect(
        (
          await t.app.request(
            '/api/kalender/events/nope/bilder-ordner',
            json('reader-token', 'POST'),
          )
        ).status,
      ).toBe(404);
      speichern(t, bilderEvent());
      t.onedrive.hinzufuegen('2026-06-14_Sommerfest');
      expect(
        (await t.app.request('/api/kalender/events/e1/bilder-ordner', json('reader-token', 'POST')))
          .status,
      ).toBe(409);
      t.onedrive.zustand.verbunden = false;
      expect(
        (await t.app.request('/api/kalender/events/e1/bilder-ordner', json('reader-token', 'POST')))
          .status,
      ).toBe(503);
    });

    it('stores the Vorlage default for the folder', async () => {
      const t = makeApp();
      const vorlage = {
        titel: 'Plenum',
        beschreibung: null,
        kategorieId: 'k1',
        beginnZeit: '20:00',
        endeZeit: '22:00',
        teilnahmeStatus: null,
        schichten: [],
      };
      await t.app.request(
        '/api/kalender/vorlagen',
        json('admin-token', 'POST', { ...vorlage, bilderOrdner: true }),
      );
      expect(t.kalender.vorlageAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ bilderOrdner: true }),
      );
      await t.app.request('/api/kalender/vorlagen', json('admin-token', 'POST', vorlage));
      expect(t.kalender.vorlageAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ bilderOrdner: false }),
      );
    });
  });
});

describe('protokolle', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const sitzungsKategorie = { id: 'k1', name: 'Sitzung', farbe: 'red' };
  const sitzung = (id: string, beginn: string, extra: Partial<EventKurz> = {}): EventKurz => ({
    id,
    titel: 'Sitzung',
    beginn,
    ende: new Date(Date.parse(beginn) + 2 * 3600_000).toISOString(),
    abgesagt: false,
    kategorie: sitzungsKategorie,
    protokoll: true,
    protokollArt: 'sitzung',
    ...extra,
  });

  /**
   * Members: `a` (admin), `r` (reader, Anwärter:in), `v` (holds the right `protokolle:schreiben`), `m2`
   * (Mitglied), `e1`/`e2` (EMs), `x` (deactivated Mitglied). Events: `s1` and `s2` are Sitzungen, `b1` a
   * Barabend (no protocol), `s3` a Sitzung of another day that is cancelled.
   */
  async function setup() {
    const t = makeApp();
    const subs = ['a', 'r', 'v', 'm2', 'e1', 'e2', 'x'];
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        subs.map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of subs) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
    }
    for (const sub of ['m2', 'x']) await t.mitglieder.statusSetzen(sub, 'mitglied');
    for (const sub of ['e1', 'e2']) await t.mitglieder.statusSetzen(sub, 'em');
    await t.mitglieder.deaktiviertSetzen('x', true);
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['protokolle:schreiben' as const] : [],
    );
    const events = new Map<string, EventKurz>(
      [
        sitzung('s1', '2026-10-06T17:00:00.000Z'),
        sitzung('s2', '2026-11-03T18:00:00.000Z'),
        sitzung('s3', '2026-11-10T18:00:00.000Z', { abgesagt: true }),
        sitzung('b1', '2026-10-20T18:00:00.000Z', { titel: 'Barabend', protokoll: false }),
      ].map((e) => [e.id, e]),
    );
    t.kalender.eventsKurz.mockImplementation(async (ids) =>
      ids.flatMap((id) => (events.has(id) ? [events.get(id)!] : [])),
    );
    const antworten: Record<string, 'teilnahme' | 'absage'> = {};
    t.kalender.teilnahmeAntworten.mockImplementation(async () => ({ ...antworten }));

    const anlegen = (token: string, body: Record<string, unknown>) =>
      t.app.request('/api/protokolle', json(token, 'POST', body));
    const holen = async (id: string) =>
      (await (
        await t.app.request(`/api/protokolle/${id}`, json('reader-token', 'GET'))
      ).json()) as ProtokollDto;
    const absatz = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    /** A document with a future Event block with the given text in "Zukünftiges". */
    const mitEvent = (
      datum: string,
      text: string,
      extra: Record<string, unknown> = {},
    ): ProtokollDokument => {
      const doc = protokollLeer();
      doc.content[2]!.content = [
        bausteinErzeugen(
          'bausteinEvent',
          { ...bausteinLeer('bausteinEvent'), name: 'Barabend', datum, ...extra },
          [absatz(text)],
        ),
      ];
      return doc;
    };
    // Saving and changing the status need the edit lock: unless a test sends its own `X-Tab-Id`,
    // the request runs with a lock taken (and released) for the same caller around it.
    const basis = t.app;
    const sperreAnfrage = async (
      url: string,
      methode: string,
      kopf: HeadersInit | undefined,
    ): Promise<void> => {
      await basis.request(`${url}/sperre`, {
        method: methode,
        headers: { ...(kopf as Record<string, string>), 'x-tab-id': 'auto-tab' },
      });
    };
    const app = Object.assign(Object.create(basis) as typeof basis, {
      request: async (input: string | Request | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : '';
        const treffer = /^(\/api\/protokolle\/[^/]+)(\/status)?$/.exec(url);
        const headers = init?.headers as Record<string, string> | undefined;
        if (!treffer || init?.method !== 'PUT' || headers?.['x-tab-id']) {
          return basis.request(input, init);
        }
        await sperreAnfrage(treffer[1]!, 'POST', headers);
        try {
          return await basis.request(input, {
            ...init,
            headers: { ...headers, 'x-tab-id': 'auto-tab' },
          });
        } finally {
          await sperreAnfrage(treffer[1]!, 'DELETE', headers);
        }
      },
    });
    return { ...t, app, events, antworten, anlegen, holen, mitEvent };
  }

  it('lets everybody read but only writers change protocols', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    expect((await t.app.request('/api/protokolle', json('reader-token', 'GET'))).status).toBe(200);
    expect((await t.app.request(`/api/protokolle/${id}`, json('reader-token', 'GET'))).status).toBe(
      200,
    );
    const dto = await t.holen(id);
    for (const [url, method, body] of [
      ['/api/protokolle', 'POST', { eventId: 's2' }],
      [`/api/protokolle/${id}`, 'PUT', { inhalt: dto.inhalt, kopf: dto.kopf, version: 1 }],
      [`/api/protokolle/${id}/status`, 'PUT', { status: 'abgeschlossen' }],
      [`/api/protokolle/${id}`, 'DELETE', undefined],
      ['/api/protokolle/sitzungen', 'GET', undefined],
      ['/api/protokolle/vorschlag?eventId=s2', 'GET', undefined],
    ] as const) {
      for (const token of ['reader-token', 'member-token']) {
        const res = await t.app.request(url, json(token, method, body));
        expect(res.status, `${token} ${method} ${url}`).toBe(403);
      }
    }
    expect((await t.app.request('/api/protokolle')).status).toBe(401);
    // A Posten with the right is enough.
    expect((await t.anlegen('vorstand-token', { eventId: 's2' })).status).toBe(201);
    expect(t.protokollListe.size).toBe(2);
  });

  describe('Bearbeitungssperre', () => {
    const tab = (token: string, methode: string, tabId: string, body?: unknown) => {
      const o = json(token, methode, body);
      return { ...o, headers: { ...o.headers, 'x-tab-id': tabId } };
    };
    const url = (id: string, pfad = '') => `/api/protokolle/${id}${pfad}`;
    const nehmen = (
      t: Awaited<ReturnType<typeof setup>>,
      id: string,
      token: string,
      tabId: string,
    ) => t.app.request(url(id, '/sperre'), tab(token, 'POST', tabId));
    const gesperrt = async (res: Response) => {
      expect(res.status).toBe(409);
      return (await res.json()) as {
        error: string;
        sperre: { von: { username: string | null; status: string } | null; eigene: boolean };
      };
    };
    afterEach(() => vi.useRealTimers());

    async function mitEntwurf() {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      return { t, id, dto: await t.holen(id) };
    }

    it('lets one tab take and extend the lock; a second tab of the same person is locked out', async () => {
      const { t, id } = await mitEntwurf();
      expect((await nehmen(t, id, 'admin-token', 'tab-1')).status).toBe(200);
      expect((await nehmen(t, id, 'admin-token', 'tab-1')).status).toBe(200);
      const body = await gesperrt(await nehmen(t, id, 'admin-token', 'tab-2'));
      expect(body.error).toBe('Das Protokoll wird gerade von jemand anderem bearbeitet.');
      expect(body.sperre.eigene).toBe(true);
      expect(body.sperre.von?.username).toBe('user-a');
    });

    it('locks out other people, admins included, who see who edits', async () => {
      const { t, id } = await mitEntwurf();
      expect((await nehmen(t, id, 'vorstand-token', 'tab-v')).status).toBe(200);
      const body = await gesperrt(await nehmen(t, id, 'admin-token', 'tab-a'));
      expect(body.sperre.eigene).toBe(false);
      expect(body.sperre.von?.username).toBeTruthy();
      expect(body.sperre.von?.status).toBeTruthy();
    });

    it('needs the writing right and a tab id', async () => {
      const { t, id } = await mitEntwurf();
      expect((await nehmen(t, id, 'reader-token', 'tab-1')).status).toBe(403);
      expect((await t.app.request(url(id, '/sperre'), json('admin-token', 'POST'))).status).toBe(
        400,
      );
      expect((await nehmen(t, 'gibtsnicht', 'admin-token', 'tab-1')).status).toBe(404);
    });

    it('expires two minutes after the last heartbeat', async () => {
      const { t, id } = await mitEntwurf();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
      await nehmen(t, id, 'vorstand-token', 'tab-v');
      vi.setSystemTime(new Date('2026-11-01T10:01:30Z'));
      await nehmen(t, id, 'vorstand-token', 'tab-v');
      vi.setSystemTime(new Date('2026-11-01T10:03:00Z'));
      await gesperrt(await nehmen(t, id, 'admin-token', 'tab-a'));
      vi.setSystemTime(new Date('2026-11-01T10:03:31Z'));
      expect((await nehmen(t, id, 'admin-token', 'tab-a')).status).toBe(200);
    });

    it('releases only for the holding tab', async () => {
      const { t, id } = await mitEntwurf();
      await nehmen(t, id, 'admin-token', 'tab-1');
      await t.app.request(url(id, '/sperre'), tab('admin-token', 'DELETE', 'tab-2'));
      await gesperrt(await nehmen(t, id, 'admin-token', 'tab-2'));
      await t.app.request(url(id, '/sperre'), tab('vorstand-token', 'DELETE', 'tab-1'));
      await gesperrt(await nehmen(t, id, 'vorstand-token', 'tab-1'));
      expect(
        (await t.app.request(url(id, '/sperre'), tab('admin-token', 'DELETE', 'tab-1'))).status,
      ).toBe(200);
      expect((await nehmen(t, id, 'vorstand-token', 'tab-v')).status).toBe(200);
    });

    it('rejects saving and closing without the lock', async () => {
      const { t, id, dto } = await mitEntwurf();
      const speichern = (token: string, tabId: string, version = dto.version) =>
        t.app.request(
          url(id),
          tab(token, 'PUT', tabId, { inhalt: dto.inhalt, kopf: dto.kopf, version }),
        );
      const schliessen = (token: string, tabId: string) =>
        t.app.request(url(id, '/status'), tab(token, 'PUT', tabId, { status: 'abgeschlossen' }));
      // Nobody holds it: nobody may save.
      const frei = await gesperrt(await speichern('admin-token', 'tab-1'));
      expect(frei.sperre).toEqual({ von: null, eigene: false });
      await gesperrt(await schliessen('admin-token', 'tab-1'));
      await nehmen(t, id, 'admin-token', 'tab-1');
      // Another tab, another person: locked out.
      expect((await gesperrt(await speichern('admin-token', 'tab-2'))).sperre.eigene).toBe(true);
      expect((await gesperrt(await speichern('vorstand-token', 'tab-1'))).sperre.eigene).toBe(
        false,
      );
      await gesperrt(await schliessen('admin-token', 'tab-2'));
      expect(t.protokollListe.get(id)?.version).toBe(dto.version);
      // The holder may.
      expect((await speichern('admin-token', 'tab-1')).status).toBe(200);
      expect((await schliessen('admin-token', 'tab-1')).status).toBe(200);
      expect(t.protokollListe.get(id)?.status).toBe('abgeschlossen');
    });

    it('refuses deleting a draft while another tab holds the lock', async () => {
      const { t, id } = await mitEntwurf();
      const loeschen = (token: string, tabId: string) =>
        t.app.request(url(id), tab(token, 'DELETE', tabId));
      await nehmen(t, id, 'vorstand-token', 'tab-v');
      const body = await gesperrt(await loeschen('admin-token', 'tab-a'));
      expect(body.sperre.eigene).toBe(false);
      expect(t.protokollListe.has(id)).toBe(true);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 3 * 60_000);
      expect((await loeschen('admin-token', 'tab-a')).status).toBe(200);
      expect(t.protokollListe.has(id)).toBe(false);
    });

    it('lets the holding tab delete its draft', async () => {
      const { t, id } = await mitEntwurf();
      await nehmen(t, id, 'admin-token', 'tab-1');
      await gesperrt(await t.app.request(url(id), tab('admin-token', 'DELETE', 'tab-2')));
      expect((await t.app.request(url(id), tab('admin-token', 'DELETE', 'tab-1'))).status).toBe(
        200,
      );
    });

    it('does not lock closed protocols and clears the lock on closing', async () => {
      const { t, id, dto } = await mitEntwurf();
      await nehmen(t, id, 'admin-token', 'tab-1');
      expect(
        (
          await t.app.request(
            url(id, '/status'),
            tab('admin-token', 'PUT', 'tab-1', { status: 'abgeschlossen' }),
          )
        ).status,
      ).toBe(200);
      expect(t.protokollListe.get(id)?.sperreBis).toBeNull();
      const res = await nehmen(t, id, 'admin-token', 'tab-1');
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe(
        'Das Protokoll ist abgeschlossen.',
      );
      // Reopening needs no lock (there is none to hold).
      expect(
        (
          await t.app.request(
            url(id, '/status'),
            tab('admin-token', 'PUT', 'tab-9', { status: 'entwurf' }),
          )
        ).status,
      ).toBe(200);
      expect(dto.status).toBe('entwurf');
    });
  });

  it('creates a protocol only for a Sitzung and only once', async () => {
    const t = await setup();
    const fehler = async (eventId: string) => {
      const res = await t.anlegen('admin-token', { eventId });
      return [res.status, ((await res.json()) as { error: string }).error] as const;
    };
    expect((await fehler('unbekannt'))[0]).toBe(400);
    expect((await fehler('b1'))[0]).toBe(400);
    expect(await fehler('s3')).toEqual([400, 'Die Sitzung ist abgesagt.']);
    const ok = await t.anlegen('admin-token', { eventId: 's1' });
    expect(ok.status).toBe(201);
    expect(t.protokollListe.get(((await ok.json()) as { id: string }).id)).toMatchObject({
      eventId: 's1',
      status: 'entwurf',
      version: 1,
      erstelltVon: 'a',
    });
    expect(await fehler('s1')).toEqual([409, 'Für diese Sitzung gibt es schon ein Protokoll.']);
    expect(
      (await t.anlegen('admin-token', { eventId: 's2', inhalt: { type: 'doc' } })).status,
    ).toBe(400);
  });

  it('lists the protocols, newest Sitzung first', async () => {
    const t = await setup();
    await t.anlegen('admin-token', { eventId: 's1' });
    await t.anlegen('vorstand-token', { eventId: 's2' });
    const liste = (await (
      await t.app.request('/api/protokolle', json('reader-token', 'GET'))
    ).json()) as ProtokollListeEintragDto[];
    expect(liste.map((p) => p.eventId)).toEqual(['s2', 's1']);
    expect(liste[0]).toMatchObject({
      titel: 'Sitzung',
      beginn: '2026-11-03T18:00:00.000Z',
      status: 'entwurf',
      geaendertVon: { sub: 'v', username: 'user-v', status: 'anwaerter' },
    });
  });

  it('offers the Sitzungen without protocol up to tomorrow', async () => {
    const t = await setup();
    await t.anlegen('admin-token', { eventId: 's1' });
    t.kalender.sitzungen.mockResolvedValue([sitzung('s2', '2026-11-03T18:00:00.000Z')]);
    const res = await t.app.request('/api/protokolle/sitzungen', json('vorstand-token', 'GET'));
    expect(await res.json()).toEqual([
      {
        id: 's2',
        titel: 'Sitzung',
        beginn: '2026-11-03T18:00:00.000Z',
        kategorie: sitzungsKategorie,
        art: 'sitzung',
      },
    ]);
    const [bis, limit, ausser] = t.kalender.sitzungen.mock.calls[0]!;
    expect(Math.abs(bis.getTime() - (Date.now() + 24 * 3600_000))).toBeLessThan(60_000);
    expect(limit).toBe(20);
    expect(ausser).toEqual(['s1']);
  });

  it('derives the attendance from the answers and lets overrides win', async () => {
    const t = await setup();
    t.antworten.m2 = 'teilnahme';
    t.antworten.r = 'absage';
    t.antworten.e1 = 'teilnahme';
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    let dto = await t.holen(id);
    expect(dto.sitzung).toMatchObject({ id: 's1', titel: 'Sitzung', kategorie: sitzungsKategorie });
    // Active Anwärter:innen and Mitglieder only: not the EMs and not the deactivated one.
    expect(dto.teilnahme.map((p) => [p.sub, p.abgeleitet, p.wert, p.ueberschrieben])).toEqual([
      ['a', 'unentschuldigt', 'unentschuldigt', false],
      ['m2', 'anwesend', 'anwesend', false],
      ['r', 'entschuldigt', 'entschuldigt', false],
      ['v', 'unentschuldigt', 'unentschuldigt', false],
    ]);
    expect(dto.teilnahme[0]).toMatchObject({ username: 'user-a', status: 'anwaerter' });
    expect(dto.ems.map((e) => [e.sub, e.abgeleitet, e.ausgewaehlt])).toEqual([
      ['e1', true, true],
      ['e2', false, false],
    ]);

    const speichern = await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', {
        inhalt: dto.inhalt,
        kopf: {
          ...protokollKopfLeer(),
          teilnahme: { r: 'verspaetet' },
          ems: ['e2'],
          gaeste: 'Gast',
        },
        version: 1,
      }),
    );
    expect(speichern.status).toBe(200);
    dto = await t.holen(id);
    expect(dto.teilnahme.find((p) => p.sub === 'r')).toMatchObject({
      abgeleitet: 'entschuldigt',
      wert: 'anwesend',
      ueberschrieben: true,
    });
    expect(dto.ems.map((e) => [e.sub, e.ausgewaehlt])).toEqual([
      ['e1', false],
      ['e2', true],
    ]);
    expect(dto.kopf.gaeste).toBe('Gast');
  });

  it('pre-fills a new protocol from the latest earlier one', async () => {
    const t = await setup();
    const erstes = (
      await (
        await t.anlegen('admin-token', {
          eventId: 's1',
          inhalt: t.mitEvent('2026-11-20', 'Wer bringt Musik mit?'),
        })
      ).json()
    ).id as string;
    expect(erstes).toBeTruthy();
    const res = await t.app.request(
      '/api/protokolle/vorschlag?eventId=s2',
      json('admin-token', 'GET'),
    );
    const vorschlag = (await res.json()) as { inhalt: ProtokollDokument; kopf: unknown };
    expect(vorschlag.kopf).toEqual(protokollKopfLeer());
    const zukunft = vorschlag.inhalt.content[2]!.content!;
    expect(zukunft).toHaveLength(1);
    expect(zukunft[0]).toMatchObject({
      type: 'bausteinEvent',
      attrs: { daten: { name: 'Barabend', datum: '2026-11-20' } },
      content: [{ type: 'paragraph', content: [{ text: 'Wer bringt Musik mit?' }] }],
    });

    // Creating without a document takes the suggestion.
    const neu = (await (await t.anlegen('admin-token', { eventId: 's2' })).json()).id as string;
    expect((await t.holen(neu)).inhalt.content[2]!.content).toHaveLength(1);

    // The first Sitzung has no predecessor: empty document.
    const leer = (await (
      await t.app.request('/api/protokolle/vorschlag?eventId=s1', json('admin-token', 'GET'))
    ).json()) as { inhalt: ProtokollDokument };
    expect(leer.inhalt).toEqual(protokollLeer());
    expect(
      (await t.app.request('/api/protokolle/vorschlag?eventId=b1', json('admin-token', 'GET')))
        .status,
    ).toBe(400);
    expect(
      (await t.app.request('/api/protokolle/vorschlag', json('admin-token', 'GET'))).status,
    ).toBe(400);
  });

  it('repeats votes that were not beschlussfähig in the next Sitzung', async () => {
    const t = await setup();
    // m2 is the only member and did not answer: 0 of 1 present, so the Sitzung is not beschlussfähig.
    const aufnahme = bausteinErzeugen('bausteinAufnahme', {
      sub: 'r',
      name: '',
      abstimmung: { ja: 0, nein: 0, enthaltung: 0, ergebnis: 'angenommen' },
      wiederholung: null,
    });
    const doc = protokollLeer();
    doc.content[1]!.content = [aufnahme, { type: 'paragraph' }];
    const id = (await (await t.anlegen('admin-token', { eventId: 's1', inhalt: doc })).json())
      .id as string;

    // The Aktion still runs, but provisionally.
    const aktionen = (await (
      await t.app.request(`/api/protokolle/${id}/aktionen`, json('admin-token', 'GET'))
    ).json()) as { aktionen: { art: string; ausfuehrbar: boolean; vorlaeufig?: boolean }[] };
    expect(aktionen.aktionen).toMatchObject([
      { art: 'aufnahme.status', ausfuehrbar: true, vorlaeufig: true },
    ]);

    const zu = await t.app.request(
      `/api/protokolle/${id}/status`,
      json('admin-token', 'PUT', { status: 'abgeschlossen' }),
    );
    expect(zu.status).toBe(200);

    const vorschlag = (await (
      await t.app.request('/api/protokolle/vorschlag?eventId=s2', json('admin-token', 'GET'))
    ).json()) as { inhalt: ProtokollDokument };
    const gegenwart = vorschlag.inhalt.content[1]!.content!.filter((k) =>
      k.type.startsWith('baustein'),
    );
    expect(gegenwart).toHaveLength(1);
    expect(gegenwart[0]).toMatchObject({
      type: 'bausteinAufnahme',
      attrs: {
        daten: {
          sub: 'r',
          abstimmung: { ja: 0, nein: 0, enthaltung: 0, ergebnis: null },
          wiederholung: { datum: '2026-10-06', sitzung: 'Sitzung' },
        },
      },
    });
    expect(gegenwart[0]!.attrs!.id).not.toBe(aufnahme.attrs.id);
  });

  it('does not repeat votes of a beschlussfähige Sitzung', async () => {
    const t = await setup();
    t.antworten.m2 = 'teilnahme';
    const beschluss = bausteinErzeugen('bausteinBeschluss', {
      antrag: 'Bier',
      ja: 1,
      nein: 0,
      enthaltung: 0,
      ergebnis: 'angenommen',
      wiederholung: null,
    });
    const doc = protokollLeer();
    doc.content[1]!.content = [beschluss, { type: 'paragraph' }];
    await t.anlegen('admin-token', { eventId: 's1', inhalt: doc });
    const vorschlag = (await (
      await t.app.request('/api/protokolle/vorschlag?eventId=s2', json('admin-token', 'GET'))
    ).json()) as { inhalt: ProtokollDokument };
    expect(vorschlag.inhalt.content[1]!.content).toEqual([{ type: 'paragraph' }]);
  });

  it('turns events that are over by the next Sitzung into past ones', async () => {
    const t = await setup();
    await t.anlegen('admin-token', {
      eventId: 's1',
      inhalt: t.mitEvent('2026-10-20', 'Rückblick-Stoff', { eventId: 'b1' }),
    });
    const vorschlag = (await (
      await t.app.request('/api/protokolle/vorschlag?eventId=s2', json('admin-token', 'GET'))
    ).json()) as { inhalt: ProtokollDokument };
    expect(vorschlag.inhalt.content[2]!.content).toEqual([{ type: 'paragraph' }]);
    expect(vorschlag.inhalt.content[0]!.content).toMatchObject([
      {
        type: 'bausteinVergangenesEvent',
        // Name and date follow the calendar event b1.
        attrs: { daten: { eventId: 'b1', name: 'Barabend', datum: '2026-10-20' } },
        content: [{ type: 'paragraph' }],
      },
    ]);
  });

  it('saves with optimistic locking and validates the document', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const dto = await t.holen(id);
    const put = (token: string, body: Record<string, unknown>) =>
      t.app.request(`/api/protokolle/${id}`, json(token, 'PUT', body));
    const inhalt = t.mitEvent('2026-12-01', 'Neu');
    const ok = await put('admin-token', { inhalt, kopf: dto.kopf, version: 1 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ version: 2, geaendertAm: expect.any(String) });
    expect((await t.holen(id)).inhalt).toEqual(inhalt);

    // A second editor still has version 1.
    const veraltet = await put('vorstand-token', {
      inhalt: dto.inhalt,
      kopf: dto.kopf,
      version: 1,
    });
    expect(veraltet.status).toBe(409);
    expect(await veraltet.json()).toEqual({
      error: 'Jemand anderes hat das Protokoll inzwischen geändert.',
      version: 2,
      // Who saved version 2 (for the hint on the page).
      geaendertVon: expect.objectContaining({ sub: 'a', username: 'user-a' }),
    });
    expect((await t.holen(id)).inhalt).toEqual(inhalt);

    const kaputt = protokollLeer();
    kaputt.content.splice(1);
    expect((await put('admin-token', { inhalt: kaputt, kopf: dto.kopf, version: 2 })).status).toBe(
      400,
    );
    expect(
      (await put('admin-token', { inhalt, kopf: { teilnahme: { r: 'da' } }, version: 2 })).status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          '/api/protokolle/gibtsnicht',
          json('admin-token', 'PUT', {
            inhalt,
            kopf: dto.kopf,
            version: 1,
          }),
        )
      ).status,
    ).toBe(404);
  });

  it('never lets a draft carry a snapshot', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const dto = await t.holen(id);
    await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', {
        inhalt: dto.inhalt,
        kopf: {
          ...dto.kopf,
          schnappschuss: { r: 'anwesend' },
          emsSchnappschuss: ['e1'],
          statusSchnappschuss: { r: 'mitglied' },
          artSchnappschuss: 'sitzung',
        },
        version: 1,
      }),
    );
    expect((await t.holen(id)).kopf).toMatchObject({
      schnappschuss: null,
      emsSchnappschuss: null,
      statusSchnappschuss: null,
      artSchnappschuss: null,
    });
  });

  it('sets the Protokollführung to the creator unless the input has one', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const dto = await t.holen(id);
    expect(dto.kopf).toMatchObject({
      protokollfuehrung: 'a',
      sitzungsleitung: null,
      eroeffnung: '',
    });
    expect(dto.sitzung.art).toBe('sitzung');
    // Snapshots from the input are dropped, an explicit Protokollführung stays.
    const id2 = (
      await (
        await t.anlegen('admin-token', {
          eventId: 's2',
          inhalt: protokollLeer(),
          kopf: {
            ...protokollKopfLeer(),
            protokollfuehrung: 'm2',
            sitzungsleitung: 'r',
            eroeffnung: '19:30',
            verspaetung: { r: '20:15' },
            statusSchnappschuss: { r: 'mitglied' },
            artSchnappschuss: 'mitgliederversammlung',
          },
        })
      ).json()
    ).id as string;
    expect((await t.holen(id2)).kopf).toMatchObject({
      protokollfuehrung: 'm2',
      sitzungsleitung: 'r',
      eroeffnung: '19:30',
      verspaetung: { r: '20:15' },
      statusSchnappschuss: null,
      artSchnappschuss: null,
    });
    // Invalid times are refused.
    expect(
      (
        await t.anlegen('admin-token', {
          eventId: 's2',
          inhalt: protokollLeer(),
          kopf: { ...protokollKopfLeer(), eroeffnung: '25:00' },
        })
      ).status,
    ).toBe(400);
  });

  it('still loads a kopf stored before the new fields existed', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const p = t.protokollListe.get(id)!;
    t.protokollListe.set(id, {
      ...p,
      kopf: JSON.stringify({ teilnahme: { r: 'anwesend' }, ems: null, gaeste: 'Gast' }),
    });
    const dto = await t.holen(id);
    expect(dto.kopf).toEqual({
      ...protokollKopfLeer(),
      teilnahme: { r: 'anwesend' },
      gaeste: 'Gast',
    });
    expect(dto.teilnahme.find((x) => x.sub === 'r')?.wert).toBe('anwesend');
  });

  describe('PDF in OneDrive', () => {
    const PDF = Buffer.from('%PDF-1.7\n%binary \u00e4\u00f6\u00fc\n%%EOF').toString('base64');
    async function geschlossen() {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      const pdf = (token: string, body: unknown) =>
        t.app.request(`/api/protokolle/${id}/pdf`, json(token, 'PUT', body));
      const zu = () =>
        t.app.request(
          `/api/protokolle/${id}/status`,
          json('admin-token', 'PUT', { status: 'abgeschlossen' }),
        );
      return { ...t, id, pdf, zu };
    }

    it('stores the PDF of a closed protocol under Cloud4/Sitzungen/C4/Protokolle/<Jahr>', async () => {
      const t = await geschlossen();
      expect((await t.zu()).status).toBe(200);
      const res = await t.pdf('admin-token', {
        dateiname: '2026-11-04_Sitzung: A/B.pdf',
        base64: PDF,
      });
      expect(res.status).toBe(200);
      const pfad = 'Cloud4/Sitzungen/C4/Protokolle/2026/2026-11-04_Sitzung AB.pdf';
      expect(await res.json()).toEqual({ gespeichert: true, pfad });
      const datei = t.onedrive.dateien.get(pfad);
      expect(datei?.contentType).toBe('application/pdf');
      expect(Buffer.from(datei!.inhalt).toString('base64')).toBe(PDF);
    });

    it('only takes PDFs of closed protocols from writers', async () => {
      const t = await geschlossen();
      expect((await t.pdf('admin-token', { dateiname: 'a.pdf', base64: PDF })).status).toBe(409);
      expect((await t.zu()).status).toBe(200);
      expect((await t.pdf('reader-token', { dateiname: 'a.pdf', base64: PDF })).status).toBe(403);
      expect((await t.pdf('admin-token', { dateiname: '///', base64: PDF })).status).toBe(400);
      const kaputt = Buffer.from('kein pdf').toString('base64');
      expect((await t.pdf('admin-token', { dateiname: 'a.pdf', base64: kaputt })).status).toBe(400);
      expect(t.onedrive.dateien.size).toBe(0);
    });

    it('rejects PDFs over 4 MB', async () => {
      const t = await geschlossen();
      await t.zu();
      const gross = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(4 * 1024 * 1024)]).toString(
        'base64',
      );
      const res = await t.pdf('admin-token', { dateiname: 'a.pdf', base64: gross });
      expect(res.status).toBe(413);
      expect(((await res.json()) as { error: string }).error).toContain('zu groß');
    });

    it('answers 503 when OneDrive is not connected or fails', async () => {
      const t = await geschlossen();
      await t.zu();
      t.onedrive.zustand.verbunden = false;
      const a = await t.pdf('admin-token', { dateiname: 'a.pdf', base64: PDF });
      expect(a.status).toBe(503);
      expect(((await a.json()) as { error: string }).error).toContain('OneDrive');
      t.onedrive.zustand.verbunden = true;
      t.onedrive.zustand.ausfall = true;
      expect((await t.pdf('admin-token', { dateiname: 'a.pdf', base64: PDF })).status).toBe(503);
    });
  });

  it('freezes member status and art when closing and drops them when reopening', async () => {
    const t = await setup();
    t.events.set('s1', {
      ...t.events.get('s1')!,
      protokollArt: 'mitgliederversammlung',
    });
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    expect((await t.holen(id)).sitzung.art).toBe('mitgliederversammlung');
    const status = (wert: string) =>
      t.app.request(`/api/protokolle/${id}/status`, json('admin-token', 'PUT', { status: wert }));
    expect((await status('abgeschlossen')).status).toBe(200);
    let dto = await t.holen(id);
    expect(dto.kopf.statusSchnappschuss).toEqual({
      a: 'anwaerter',
      m2: 'mitglied',
      r: 'anwaerter',
      v: 'anwaerter',
    });
    expect(dto.kopf.artSchnappschuss).toBe('mitgliederversammlung');

    // Later changes of the status and of the Kategorie do not touch the closed protocol.
    await t.mitglieder.statusSetzen('m2', 'anwaerter');
    await t.mitglieder.statusSetzen('r', 'mitglied');
    t.events.set('s1', { ...t.events.get('s1')!, protokollArt: 'sitzung' });
    dto = await t.holen(id);
    expect(dto.sitzung.art).toBe('mitgliederversammlung');
    expect(dto.teilnahme.map((p) => [p.sub, p.status])).toEqual([
      ['a', 'anwaerter'],
      ['m2', 'mitglied'],
      ['r', 'anwaerter'],
      ['v', 'anwaerter'],
    ]);

    expect((await status('entwurf')).status).toBe(200);
    dto = await t.holen(id);
    expect(dto.kopf).toMatchObject({
      statusSchnappschuss: null,
      artSchnappschuss: null,
      schnappschuss: null,
    });
    expect(dto.sitzung.art).toBe('sitzung');
    expect(dto.teilnahme.find((p) => p.sub === 'm2')?.status).toBe('anwaerter');
    expect(dto.teilnahme.find((p) => p.sub === 'r')?.status).toBe('mitglied');
  });

  it('freezes the attendance when closing and releases it when reopening', async () => {
    const t = await setup();
    t.antworten.m2 = 'teilnahme';
    t.antworten.e1 = 'teilnahme';
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json().then((j) => j))
      .id as string;
    const status = (token: string, wert: string) =>
      t.app.request(`/api/protokolle/${id}/status`, json(token, 'PUT', { status: wert }));
    await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', {
        inhalt: (await t.holen(id)).inhalt,
        kopf: { ...protokollKopfLeer(), teilnahme: { v: 'verspaetet' } },
        version: 1,
      }),
    );

    const zu = await status('admin-token', 'abgeschlossen');
    expect(zu.status).toBe(200);
    expect(await zu.json()).toMatchObject({ status: 'abgeschlossen', version: 3 });
    let dto = await t.holen(id);
    expect(dto.status).toBe('abgeschlossen');
    expect(dto.kopf.schnappschuss).toEqual({
      a: 'unentschuldigt',
      m2: 'anwesend',
      r: 'unentschuldigt',
      v: 'anwesend',
    });
    expect(dto.kopf.emsSchnappschuss).toEqual(['e1']);

    // Later answers do not change a closed protocol.
    t.antworten.r = 'teilnahme';
    t.antworten.m2 = 'absage';
    delete t.antworten.e1;
    dto = await t.holen(id);
    expect(dto.teilnahme.map((p) => [p.sub, p.wert])).toEqual([
      ['a', 'unentschuldigt'],
      ['m2', 'anwesend'],
      ['r', 'unentschuldigt'],
      ['v', 'anwesend'],
    ]);
    expect(dto.teilnahme.find((p) => p.sub === 'r')?.abgeleitet).toBe('anwesend');
    expect(dto.ems.map((e) => [e.sub, e.ausgewaehlt])).toEqual([['e1', true]]);

    // Closed: no saving, no deleting.
    const put = await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', { inhalt: dto.inhalt, kopf: dto.kopf, version: dto.version }),
    );
    expect(put.status).toBe(409);
    expect(await put.json()).toEqual({ error: 'Das Protokoll ist abgeschlossen.' });
    const loeschen = await t.app.request(`/api/protokolle/${id}`, json('admin-token', 'DELETE'));
    expect(loeschen.status).toBe(409);
    expect(t.protokollListe.has(id)).toBe(true);

    expect((await status('admin-token', 'entwurf')).status).toBe(200);
    dto = await t.holen(id);
    expect(dto.status).toBe('entwurf');
    expect(dto.kopf).toMatchObject({ schnappschuss: null, emsSchnappschuss: null });
    expect(dto.teilnahme.find((p) => p.sub === 'r')?.wert).toBe('anwesend');
    expect(dto.teilnahme.find((p) => p.sub === 'v')?.wert).toBe('anwesend');
    expect((await status('admin-token', 'entwurf')).status).toBe(200);
    expect((await status('admin-token', 'offen')).status).toBe(400);
  });

  it('only closes when every Abstimmung and Wahl has as many votes as members present', async () => {
    const t = await setup();
    t.antworten.m2 = 'teilnahme'; // the only Mitglied, so one member is present
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const status = () =>
      t.app.request(
        `/api/protokolle/${id}/status`,
        json('admin-token', 'PUT', { status: 'abgeschlossen' }),
      );
    const speichern = async (...bausteine: ProtokollKnoten[]) => {
      const dto = await t.holen(id);
      const inhalt = protokollLeer();
      inhalt.content[1]!.content = [...bausteine, { type: 'paragraph' }];
      const res = await t.app.request(
        `/api/protokolle/${id}`,
        json('admin-token', 'PUT', { inhalt, kopf: dto.kopf, version: dto.version }),
      );
      expect(res.status).toBe(200);
    };
    const beschluss = (ja: number) =>
      bausteinErzeugen('bausteinBeschluss', {
        ...bausteinLeer('bausteinBeschluss'),
        antrag: 'Bier',
        ja,
      });
    const wahl = (stimmen: number) =>
      bausteinErzeugen('bausteinWahl', {
        ...bausteinLeer('bausteinWahl'),
        posten: 'Kasse',
        anzahl: 2,
        kandidaten: [{ id: 'k1', sub: 'm2', name: '', stimmen }],
      });
    const meinungsbild = bausteinErzeugen('bausteinMeinungsbild', {
      frage: 'Pizza?',
      optionen: [{ text: 'Ja', stimmen: 40 }],
    });

    // Too many votes for one present member.
    await speichern(beschluss(2));
    let res = await status();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(
      'Abstimmung „Bier“: 2 Stimmen, aber 1 Mitglied anwesend.',
    );
    expect((await t.holen(id)).status).toBe('entwurf');

    // A Wahl: one member, two votes (anzahl 2).
    await speichern(beschluss(1), wahl(1));
    res = await status();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(
      'Wahl „Kasse“: 1 Stimme, erwartet 2 (1 Mitglied × 2 Stimmen).',
    );

    // Everything correct, a Meinungsbild with any count is ignored.
    await speichern(beschluss(1), wahl(2), meinungsbild);
    expect((await status()).status).toBe(200);
    expect((await t.holen(id)).status).toBe('abgeschlossen');
  });

  it('suggests the next Sitzung live in a draft, freezes it on closing and restores it on reopening', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const status = (wert: string) =>
      t.app.request(`/api/protokolle/${id}/status`, json('admin-token', 'PUT', { status: wert }));
    // No later Sitzung known.
    let dto = await t.holen(id);
    expect(dto.naechsteSitzungVorschlag).toBeNull();
    expect(dto.naechsteSitzungen).toEqual([]);
    expect(dto.kopf.naechsteSitzung).toBeNull();

    t.kalender.kommendeSitzungen.mockResolvedValue([
      sitzung('s2', '2026-11-03T18:00:00.000Z'),
      sitzung('s4', '2026-12-01T19:00:00.000Z', {
        titel: 'MV',
        protokollArt: 'mitgliederversammlung',
      }),
    ]);
    dto = await t.holen(id);
    const [nach, limit] = t.kalender.kommendeSitzungen.mock.calls.at(-1)!;
    expect(nach.toISOString()).toBe('2026-10-06T17:00:00.000Z');
    expect(limit).toBe(10);
    const s2 = { eventId: 's2', titel: 'Sitzung', beginn: '2026-11-03T18:00:00.000Z' };
    expect(dto.naechsteSitzungVorschlag).toEqual(s2);
    expect(dto.naechsteSitzungen.map((e) => e.eventId)).toEqual(['s2', 's4']);

    // An override is stored as written and does not change the suggestion.
    const kopf = {
      ...dto.kopf,
      naechsteSitzung: { eventId: null, datum: '2026-11-17', uhrzeit: '20:00' },
    };
    const put = await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', { inhalt: dto.inhalt, kopf, version: dto.version }),
    );
    expect(put.status).toBe(200);
    dto = await t.holen(id);
    expect(dto.kopf.naechsteSitzung).toEqual(kopf.naechsteSitzung);
    expect(dto.naechsteSitzungVorschlag).toEqual(s2);
    const kaputt = await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', {
        inhalt: dto.inhalt,
        kopf: { ...kopf, naechsteSitzung: { eventId: null, datum: 'morgen', uhrzeit: '' } },
        version: dto.version,
      }),
    );
    expect(kaputt.status).toBe(400);

    // Closing freezes the suggestion; later calendar changes do not matter.
    expect((await status('abgeschlossen')).status).toBe(200);
    t.kalender.kommendeSitzungen.mockResolvedValue([sitzung('s5', '2026-10-20T18:00:00.000Z')]);
    dto = await t.holen(id);
    expect(dto.naechsteSitzungVorschlag).toEqual(s2);
    expect(dto.naechsteSitzungen).toEqual([]);
    expect(dto.kopf.naechsteSitzung).toEqual(kopf.naechsteSitzung);

    // Reopening is automatic again.
    expect((await status('entwurf')).status).toBe(200);
    dto = await t.holen(id);
    expect(dto.kopf.naechsteSitzungSchnappschuss).toBeNull();
    expect(dto.naechsteSitzungVorschlag).toMatchObject({ eventId: 's5' });
  });

  it('adds the empty section Sonstiges to documents stored with three sections', async () => {
    const t = await setup();
    const alt = protokollLeer();
    alt.content.pop();
    const id = (
      await (
        await t.anlegen('admin-token', { eventId: 's1', inhalt: alt, kopf: protokollKopfLeer() })
      ).json()
    ).id as string;
    const dto = await t.holen(id);
    expect(dto.inhalt.content.map((a) => a.attrs?.art)).toEqual([
      'vergangenes',
      'gegenwaertiges',
      'zukuenftiges',
      'sonstiges',
    ]);
    const zwei = protokollLeer();
    zwei.content.splice(2);
    const res = await t.anlegen('admin-token', {
      eventId: 's2',
      inhalt: zwei,
      kopf: protokollKopfLeer(),
    });
    expect(res.status).toBe(400);
  });

  it('deletes drafts', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const res = await t.app.request(`/api/protokolle/${id}`, json('vorstand-token', 'DELETE'));
    expect(res.status).toBe(200);
    expect(t.protokollListe.size).toBe(0);
    expect(
      (await t.app.request(`/api/protokolle/${id}`, json('admin-token', 'DELETE'))).status,
    ).toBe(404);
    expect((await t.app.request(`/api/protokolle/${id}`, json('reader-token', 'GET'))).status).toBe(
      404,
    );
  });

  describe('Bilder', () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    const bild = (id: string, schluessel = `protokollbilder/${id}/${uuid}.jpg`) => ({
      type: 'protokollBild',
      attrs: { schluessel, breite: 'voll', ausrichtung: 'mitte', beschreibung: 'Tafel' },
    });
    const mitBild = (dto: { inhalt: ProtokollDokument }, knoten: unknown) => {
      const inhalt = structuredClone(dto.inhalt);
      inhalt.content[0]!.content!.push(knoten as never);
      return inhalt;
    };

    it('prepares an upload for a draft, limited to 5 MB and the right to write', async () => {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      const post = (token: string, body: unknown, pid = id) =>
        t.app.request(`/api/protokolle/${pid}/bilder`, json(token, 'POST', body));
      const res = await post('vorstand-token', { groesse: 1234 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        uploadUrl: 'https://s3.example/upload?size=1234',
        schluessel: `protokollbilder/${id}/${uuid}.jpg`,
      });
      expect(t.protokollbilder.uploadVorbereiten).toHaveBeenCalledWith(id, 1234);
      expect((await post('reader-token', { groesse: 10 })).status).toBe(403);
      expect((await post('admin-token', { groesse: 5 * 1024 * 1024 + 1 })).status).toBe(400);
      expect((await post('admin-token', { groesse: 0 })).status).toBe(400);
      expect((await post('admin-token', { groesse: 10 }, 'gibtsnicht')).status).toBe(404);
      await t.app.request(
        `/api/protokolle/${id}/status`,
        json('admin-token', 'PUT', { status: 'abgeschlossen' }),
      );
      expect((await post('admin-token', { groesse: 10 })).status).toBe(409);
    });

    it('refuses images when creating a protocol', async () => {
      const t = await setup();
      const inhalt = mitBild({ inhalt: protokollLeer() }, bild('fremd'));
      const res = await t.anlegen('admin-token', { eventId: 's1', inhalt, kopf: undefined });
      expect(res.status).toBe(400);
      expect(t.protokollListe.size).toBe(0);
    });

    it('saves images of this protocol and returns URLs only for those', async () => {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      const dto = await t.holen(id);
      expect(dto.bilder).toEqual({});
      const put = (inhalt: unknown, version: number) =>
        t.app.request(
          `/api/protokolle/${id}`,
          json('admin-token', 'PUT', { inhalt, kopf: dto.kopf, version }),
        );
      expect((await put(mitBild(dto, bild(id)), 1)).status).toBe(200);
      const neu = await t.holen(id);
      const key = `protokollbilder/${id}/${uuid}.jpg`;
      expect(neu.bilder).toEqual({ [key]: `https://s3.example/${key}` });
    });

    it('rejects images of another protocol or with a bad shape', async () => {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      const dto = await t.holen(id);
      const put = (inhalt: unknown) =>
        t.app.request(
          `/api/protokolle/${id}`,
          json('admin-token', 'PUT', { inhalt, kopf: dto.kopf, version: 1 }),
        );
      expect((await put(mitBild(dto, bild('anderes-protokoll')))).status).toBe(400);
      expect((await put(mitBild(dto, bild(id, 'profilbilder/x/y.jpg')))).status).toBe(400);
      expect((await put(mitBild(dto, bild(id, `protokollbilder/${id}/../x.jpg`)))).status).toBe(
        400,
      );
    });

    it('deletes the images together with the protocol', async () => {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      t.protokollbilder.loeschen.mockRejectedValueOnce(new Error('s3 down'));
      const res = await t.app.request(`/api/protokolle/${id}`, json('admin-token', 'DELETE'));
      expect(res.status).toBe(200);
      expect(t.protokollbilder.loeschen).toHaveBeenCalledWith(id);
    });
  });

  it('refuses to delete a Sitzung that has a protocol', async () => {
    const t = await setup();
    await t.anlegen('admin-token', { eventId: 's1' });
    const res = await t.app.request('/api/kalender/events/s1', json('admin-token', 'DELETE'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Zu dieser Sitzung gibt es ein Protokoll.' });
    expect(t.kalender.eventLoeschen).not.toHaveBeenCalled();
    expect(
      (await t.app.request('/api/kalender/events/s2', json('admin-token', 'DELETE'))).status,
    ).toBe(200);
  });

  it('allows the "Sitzung mit Protokoll" flag only on categories with participation', async () => {
    const t = makeApp();
    const post = (body: Record<string, unknown>) =>
      t.app.request('/api/kalender/kategorien', json('admin-token', 'POST', body));
    const sitzung = {
      name: 'Sitzung',
      farbe: 'red',
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
    };
    expect((await post({ ...sitzung, protokoll: true })).status).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokoll: true }),
    );
    expect((await post(sitzung)).status).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokoll: false }),
    );
    const bar = { name: 'Bar', farbe: 'blue', art: 'dienste' };
    expect((await post({ ...bar, protokoll: true })).status).toBe(400);
    expect((await post({ ...bar, protokoll: false })).status).toBe(201);
    expect(
      (
        await t.app.request(
          '/api/kalender/kategorien/k1',
          json('admin-token', 'PUT', { ...bar, protokoll: true }),
        )
      ).status,
    ).toBe(400);
  });

  it('stores the art of a Sitzung at the Kategorie', async () => {
    const t = makeApp();
    const post = (body: Record<string, unknown>) =>
      t.app.request('/api/kalender/kategorien', json('admin-token', 'POST', body));
    const mv = {
      name: 'MV',
      farbe: 'red',
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
      protokoll: true,
    };
    expect((await post({ ...mv, protokollArt: 'mitgliederversammlung' })).status).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokoll: true, protokollArt: 'mitgliederversammlung' }),
    );
    expect((await post(mv)).status).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokollArt: 'sitzung' }),
    );
    // Without the Sitzung flag the art falls back to 'sitzung'.
    expect(
      (await post({ ...mv, protokoll: false, protokollArt: 'mitgliederversammlung' })).status,
    ).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokoll: false, protokollArt: 'sitzung' }),
    );
    expect((await post({ ...mv, protokollArt: 'vollversammlung' })).status).toBe(400);
    const put = await t.app.request(
      '/api/kalender/kategorien/k1',
      json('admin-token', 'PUT', { ...mv, protokollArt: 'mitgliederversammlung' }),
    );
    expect(put.status).toBe(200);
    expect(t.kalender.kategorieAktualisieren).toHaveBeenLastCalledWith(
      'k1',
      expect.objectContaining({ protokollArt: 'mitgliederversammlung' }),
    );
  });

  it('adds the permissions to the Posten rights', async () => {
    const t = makeApp();
    const me = (await (await t.app.request('/api/me', json('admin-token', 'GET'))).json()) as {
      permissions: string[];
    };
    expect(me.permissions).toEqual(
      expect.arrayContaining(['protokolle:lesen', 'protokolle:schreiben']),
    );
  });

  describe('Todos beim Abschließen', () => {
    const todoBaustein = (daten: Record<string, unknown>) =>
      bausteinErzeugen(
        'bausteinTodo',
        {
          ...bausteinLeer('bausteinTodo'),
          titel: 'Kasse prüfen',
          faelligAm: '2026-11-14',
          ...daten,
        },
        [
          {
            type: 'bulletList',
            content: ['Beleg holen', 'Zählen'].map((text) => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            })),
          },
        ],
      );

    async function todoSetup(daten: Record<string, unknown>) {
      const t = await setup();
      const baustein = todoBaustein(daten);
      const doc = protokollLeer();
      // A Todo may only stand in the notes of another Baustein.
      doc.content[1]!.content = [
        bausteinErzeugen('bausteinThema', { ...bausteinLeer('bausteinThema'), titel: 'Kasse' }, [
          baustein,
        ]),
      ];
      const id = (await (await t.anlegen('admin-token', { eventId: 's1', inhalt: doc })).json())
        .id as string;
      const bausteinId = (baustein.attrs as { id: string }).id;
      const schliessen = (aktionen: string[]) =>
        t.app.request(
          `/api/protokolle/${id}/status`,
          json('vorstand-token', 'PUT', { status: 'abgeschlossen', aktionen }),
        );
      return { ...t, id, bausteinId, schliessen };
    }

    it('creates the Todo for the resolved people and writes the id back', async () => {
      const t = await todoSetup({
        modus: 'gemeinsam',
        // Group by current status (EMs), a person, the same person again, a deactivated member.
        zustaendig: [
          { art: 'gruppe', gruppe: 'ems' },
          { art: 'person', sub: 'm2' },
          { art: 'person', sub: 'm2' },
          { art: 'person', sub: 'x' },
        ],
      });
      const { aktionen } = (await (
        await t.app.request(`/api/protokolle/${t.id}/aktionen`, json('vorstand-token', 'GET'))
      ).json()) as ProtokollAktionenAntwort;
      expect(aktionen).toMatchObject([
        {
          id: `${t.bausteinId}:todo.anlegen`,
          ausfuehrbar: true,
          text: 'Todo „Kasse prüfen“ für 3 Personen, bis 14.11.2026',
          subs: ['e1', 'e2', 'm2'],
        },
      ]);

      const res = await t.schliessen([`${t.bausteinId}:todo.anlegen`]);
      expect(res.status).toBe(200);
      expect(((await res.json()) as ProtokollStatusAntwort).aktionen).toMatchObject([
        { art: 'todo.anlegen', status: 'erledigt' },
      ]);
      expect([...t.todosListe.values()]).toMatchObject([
        {
          titel: 'Kasse prüfen',
          notizen: 'Beleg holen\nZählen',
          faelligAm: '2026-11-14',
          modus: 'gemeinsam',
          protokollId: t.id,
          bausteinId: t.bausteinId,
          erstelltVon: 'v',
          zustaendige: [{ sub: 'e1' }, { sub: 'e2' }, { sub: 'm2' }],
        },
      ]);
      const todoId = [...t.todosListe.keys()][0]!;
      expect(JSON.stringify((await t.holen(t.id)).inhalt)).toContain(`"todoId":"${todoId}"`);
    });

    it('changes the Todo when the protocol is closed again and keeps the ticks of those who stay', async () => {
      const t = await todoSetup({
        zustaendig: [
          { art: 'person', sub: 'm2' },
          { art: 'person', sub: 'e1' },
        ],
      });
      await t.schliessen([`${t.bausteinId}:todo.anlegen`]);
      const todoId = [...t.todosListe.keys()][0]!;
      await t.todos.abhaken(todoId, 'm2', true);
      await t.todos.abhaken(todoId, 'e1', true);

      // Reopen, change title and deadline, drop `e1`, add `e2`.
      await t.app.request(
        `/api/protokolle/${t.id}/status`,
        json('vorstand-token', 'PUT', { status: 'entwurf' }),
      );
      const dto = await t.holen(t.id);
      const inhalt = JSON.parse(JSON.stringify(dto.inhalt)) as ProtokollDokument;
      const daten = (
        inhalt.content[1]!.content![0]!.content![0] as unknown as {
          attrs: { daten: Record<string, unknown> };
        }
      ).attrs.daten;
      Object.assign(daten, {
        titel: 'Kasse zählen',
        faelligAm: '2026-11-20',
        zustaendig: [
          { art: 'person', sub: 'm2' },
          { art: 'person', sub: 'e2' },
        ],
      });
      const gespeichert = await t.app.request(
        `/api/protokolle/${t.id}`,
        json('admin-token', 'PUT', { inhalt, kopf: dto.kopf, version: dto.version }),
      );
      expect(gespeichert.status).toBe(200);
      const { aktionen } = (await (
        await t.app.request(`/api/protokolle/${t.id}/aktionen`, json('vorstand-token', 'GET'))
      ).json()) as ProtokollAktionenAntwort;
      expect(aktionen.filter((a) => a.zustand !== 'erledigt')).toMatchObject([
        { id: `${t.bausteinId}:todo.aendern`, art: 'todo.aendern', ausfuehrbar: true },
      ]);

      await t.schliessen([`${t.bausteinId}:todo.aendern`]);
      expect(t.todosListe.size).toBe(1);
      const todo = t.todosListe.get(todoId)!;
      expect(todo).toMatchObject({ titel: 'Kasse zählen', faelligAm: '2026-11-20' });
      expect(todo.zustaendige.map((z) => [z.sub, z.erledigtAm !== null])).toEqual([
        ['e2', false],
        ['m2', true],
      ]);
    });

    it('does not run when the deadline or the people are missing', async () => {
      const t = await todoSetup({ faelligAm: null, zustaendig: [{ art: 'person', sub: 'm2' }] });
      const res = await t.schliessen([`${t.bausteinId}:todo.anlegen`]);
      expect(((await res.json()) as ProtokollStatusAntwort).aktionen).toMatchObject([
        { status: 'uebersprungen', meldung: 'Die Deadline fehlt.' },
      ]);
      expect(t.todosListe.size).toBe(0);
    });
  });

  describe('Aktionen', () => {
    const kategorien: EventKategorieDto[] = [
      {
        id: 'k1',
        name: 'Sitzung',
        farbe: 'red',
        art: 'teilnahme',
        teilnahmeStatus: ['mitglied'],
        dauer: 'eintaegig',
        protokoll: true,
        protokollArt: 'sitzung',
        benutzt: true,
        archiviert: false,
      },
      {
        id: 'kd',
        name: 'Barabend',
        farbe: 'blue',
        art: 'dienste',
        teilnahmeStatus: null,
        dauer: 'eintaegig',
        protokoll: false,
        protokollArt: 'sitzung',
        benutzt: true,
        archiviert: false,
      },
    ];
    const bestehend = {
      id: 'e9',
      titel: 'Altes Event',
      anzeigeTitel: 'Altes Event',
      beschreibung: null,
      kategorie: { id: 'kd', name: 'Barabend', farbe: 'blue' },
      art: 'dienste',
      dauer: 'eintaegig',
      beginn: '2026-12-01T18:00:00.000Z',
      ende: '2026-12-01T21:00:00.000Z',
      abgesagt: false,
      serie: null,
      schichten: [],
      teilnahmeStatus: null,
      verantwortlich: null,
      teilnahmen: [],
    } as unknown as EventDto;

    /**
     * A protocol of Sitzung `s1` (2026-10-06) with one block per Aktion: new event, change of `e9`,
     * invitation, Aufnahme of `r`, Wahl of `m2` for the Posten `p1`. `m2` is present (one vote each).
     */
    async function aktionenSetup() {
      const t = await setup();
      t.antworten.m2 = 'teilnahme';
      // `r` has been Anwärter:in since long before the Sitzung (the new profile's entry starts today).
      await t.mitglieder.statusEintragAnlegen('r', { status: 'anwaerter', ab: '2026-01-01' });
      for (const e of await t.mitglieder.statusVerlauf('r')) {
        if (e.ab !== '2026-01-01') await t.mitglieder.statusEintragLoeschen('r', e.id);
      }
      t.kalender.kategorien.mockResolvedValue(kategorien);
      let e9 = bestehend;
      t.kalender.event.mockImplementation(async (id) => (id === 'e9' ? e9 : undefined));
      t.kalender.eventAktualisieren.mockImplementation(async (_id, daten) => {
        e9 = { ...e9, titel: daten.titel, anzeigeTitel: daten.titel };
        return {
          zeitGeaendert: false,
          geaenderteSchichten: [],
          entfernteDienste: [],
          mitgliedSubs: [],
          teilnehmerSubs: [],
          verantwortlichNeu: null,
        };
      });
      t.kalender.eventAnlegen.mockResolvedValue('e-neu');
      t.userAdmin.createUser.mockResolvedValue({
        username: 'uuid-neu',
        sub: 'uuid-neu',
        email: 'neu@example.de',
        status: 'FORCE_CHANGE_PASSWORD',
        enabled: true,
        groups: [],
      });
      const postenId = await t.posten.anlegen({ name: 'Kasse', beschreibung: null } as never);
      const stimme = { ja: 1, nein: 0, enthaltung: 0 };
      const doc = protokollLeer();
      const bausteine = {
        neu: bausteinErzeugen('bausteinEvent', {
          ...bausteinLeer('bausteinEvent'),
          name: 'Sommerfest',
          datum: '2026-12-12',
          beginnZeit: '18:00',
          endeZeit: '23:00',
          kategorieId: 'kd',
        }),
        aender: bausteinErzeugen('bausteinEvent', {
          ...bausteinLeer('bausteinEvent'),
          name: 'Neuer Name',
          datum: '2026-12-01',
          beginnZeit: '19:00',
          endeZeit: '22:00',
          kategorieId: 'kd',
          eventId: 'e9',
        }),
        einladung: bausteinErzeugen('bausteinAnwaerter', {
          vorname: 'Neu',
          nachname: 'Mensch',
          email: 'neu@example.de',
          sub: null,
        }),
        aufnahme: bausteinErzeugen('bausteinAufnahme', {
          ...bausteinLeer('bausteinAufnahme'),
          sub: 'r',
          abstimmung: { ...stimme, ergebnis: 'angenommen' },
        }),
        wahl: bausteinErzeugen('bausteinWahl', {
          ...bausteinLeer('bausteinWahl'),
          posten: 'Kasse',
          postenId,
          gueltigAb: '2026-11-01',
          kandidaten: [{ id: 'c1', sub: 'm2', name: 'M', stimmen: 1 }],
        }),
      };
      doc.content[1]!.content = [bausteine.einladung, bausteine.aufnahme, bausteine.wahl];
      doc.content[2]!.content = [bausteine.neu, bausteine.aender];
      const id = (await (await t.anlegen('admin-token', { eventId: 's1', inhalt: doc })).json())
        .id as string;
      const aktionId = (b: { attrs: { id: string } }, art: string) => `${b.attrs.id}:${art}`;
      const ids = {
        neu: aktionId(bausteine.neu, 'event.anlegen'),
        aender: aktionId(bausteine.aender, 'event.aendern'),
        einladung: aktionId(bausteine.einladung, 'anwaerter.einladen'),
        aufnahme: aktionId(bausteine.aufnahme, 'aufnahme.status'),
        wahl: aktionId(bausteine.wahl, 'wahl.posten'),
      };
      const alleIds = Object.values(ids);
      const aktionenLesen = async (token = 'vorstand-token') =>
        (await (
          await t.app.request(`/api/protokolle/${id}/aktionen`, json(token, 'GET'))
        ).json()) as ProtokollAktionenAntwort;
      const schliessen = (aktionen?: string[], token = 'vorstand-token') =>
        t.app.request(
          `/api/protokolle/${id}/status`,
          json(token, 'PUT', { status: 'abgeschlossen', aktionen }),
        );
      const oeffnen = () =>
        t.app.request(
          `/api/protokolle/${id}/status`,
          json('vorstand-token', 'PUT', { status: 'entwurf' }),
        );
      const wiederholen = (aktionen: string[], token = 'vorstand-token') =>
        t.app.request(`/api/protokolle/${id}/aktionen`, json(token, 'POST', { aktionen }));
      return { ...t, id, ids, alleIds, postenId, aktionenLesen, schliessen, oeffnen, wiederholen };
    }

    it('lists the Aktionen of the stored document for writers only', async () => {
      const t = await aktionenSetup();
      const { aktionen } = await t.aktionenLesen();
      expect(aktionen.map((a) => [a.art, a.zustand, a.ausfuehrbar])).toEqual([
        ['anwaerter.einladen', 'offen', true],
        ['aufnahme.status', 'offen', true],
        ['wahl.posten', 'offen', true],
        ['event.anlegen', 'offen', true],
        ['event.aendern', 'offen', true],
      ]);
      expect(aktionen.map((a) => a.id)).toEqual([
        t.ids.einladung,
        t.ids.aufnahme,
        t.ids.wahl,
        t.ids.neu,
        t.ids.aender,
      ]);
      expect(aktionen[1]!.personen).toMatchObject([
        { sub: 'r', username: 'user-r', status: 'anwaerter' },
      ]);
      expect('plan' in aktionen[0]!).toBe(false);
      for (const token of ['reader-token', 'member-token']) {
        const res = await t.app.request(`/api/protokolle/${t.id}/aktionen`, json(token, 'GET'));
        expect(res.status).toBe(403);
        expect((await t.wiederholen(t.alleIds, token)).status).toBe(403);
      }
      expect(
        (await t.app.request('/api/protokolle/gibtsnicht/aktionen', json('admin-token', 'GET')))
          .status,
      ).toBe(404);
    });

    it('closes with the chosen Aktionen using only the right protocolle:schreiben', async () => {
      const t = await aktionenSetup();
      // The writer cannot manage events, members or Posten through the normal routes.
      expect(
        (
          await t.app.request(
            '/api/kalender/events',
            json('vorstand-token', 'POST', { titel: 'x' }),
          )
        ).status,
      ).toBe(403);

      const res = await t.schliessen(t.alleIds);
      expect(res.status).toBe(200);
      const antwort = (await res.json()) as ProtokollStatusAntwort;
      expect(antwort).toMatchObject({ status: 'abgeschlossen', version: 2 });
      expect(antwort.aktionen.map((a) => [a.art, a.status])).toEqual([
        ['anwaerter.einladen', 'erledigt'],
        ['aufnahme.status', 'erledigt'],
        ['wahl.posten', 'erledigt'],
        ['event.anlegen', 'erledigt'],
        ['event.aendern', 'erledigt'],
      ]);

      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({
          titel: 'Sommerfest',
          kategorieId: 'kd',
          beginn: '2026-12-12T17:00:00.000Z',
          ende: '2026-12-12T22:00:00.000Z',
        }),
        'v',
      );
      expect(t.kalender.eventAktualisieren).toHaveBeenCalledWith(
        'e9',
        expect.objectContaining({ titel: 'Neuer Name', kategorieId: 'kd' }),
      );
      expect(t.userAdmin.createUser).toHaveBeenCalledWith('neu@example.de', []);
      expect(t.mitglieder.speichern).toHaveBeenCalledWith(
        'uuid-neu',
        expect.objectContaining({ vorname: 'Neu', nachname: 'Mensch' }),
        'anwaerter',
        '2026-10-06',
      );
      expect(t.mitglieder.statusSetzen).toHaveBeenCalledWith('r', 'mitglied', '2026-10-06');
      expect(t.posten.besetzungAnlegen).toHaveBeenCalledWith(
        t.postenId,
        { mitgliedSub: 'm2', start: '2026-11-01', ende: null },
        [],
      );

      // The ids are written back into the document (one save, one version) and the results kept.
      const dto = await t.holen(t.id);
      expect(dto.status).toBe('abgeschlossen');
      expect(dto.version).toBe(2);
      expect(JSON.stringify(dto.inhalt)).toContain('"eventId":"e-neu"');
      expect(JSON.stringify(dto.inhalt)).toContain('"sub":"uuid-neu"');
      expect(Object.keys(dto.kopf.aktionen).sort()).toEqual([...t.alleIds].sort());
      expect(dto.kopf.aktionen[t.ids.neu]).toMatchObject({ status: 'erledigt', von: 'v' });
      // The snapshot shows the status before the Aufnahme.
      expect(dto.kopf.statusSchnappschuss?.r).toBe('anwaerter');

      // The list now shows what was done.
      const { aktionen } = await t.aktionenLesen();
      expect(aktionen.every((a) => a.zustand === 'erledigt')).toBe(true);

      // The created event is not computed any more: its entry keeps the original text and the
      // event, and stands where its Baustein is (before the change of `e9`).
      expect(aktionen.map((a) => a.id)).toEqual([
        t.ids.einladung,
        t.ids.aufnahme,
        t.ids.wahl,
        t.ids.neu,
        t.ids.aender,
      ]);
      expect(aktionen[3]).toMatchObject({
        art: 'event.anlegen',
        text: expect.stringContaining('Sommerfest'),
        eventId: 'e-neu',
        ergebnis: { text: 'Event im Kalender angelegt.' },
      });
    });

    it('creates events of old blocks without kategorieId from the Kategorie of their Vorlage', async () => {
      const t = await aktionenSetup();
      t.kalender.vorlagen.mockResolvedValue([
        {
          id: 'v1',
          titel: 'Barabend',
          kategorieId: 'kd',
          archiviert: false,
          schichten: [],
        } as never,
      ]);
      const alt = bausteinErzeugen('bausteinEvent', {
        ...bausteinLeer('bausteinEvent'),
        name: 'Altes Fest',
        datum: '2026-12-12',
        beginnZeit: '18:00',
        endeZeit: '23:00',
        vorlageId: 'v1',
        kategorieId: null,
      });
      const doc = protokollLeer();
      doc.content[2]!.content = [alt];
      const dto = await t.holen(t.id);
      const res = await t.app.request(
        `/api/protokolle/${t.id}`,
        json('admin-token', 'PUT', { inhalt: doc, kopf: dto.kopf, version: dto.version }),
      );
      expect(res.status).toBe(200);
      const { aktionen } = await t.aktionenLesen();
      expect(aktionen).toHaveLength(1);
      expect(aktionen[0]).toMatchObject({ zustand: 'offen', ausfuehrbar: true });
      await t.schliessen([aktionen[0]!.id]);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({ titel: 'Altes Fest', kategorieId: 'kd' }),
        'v',
      );
    });

    it('does not run anything twice when the protocol is reopened and closed again', async () => {
      const t = await aktionenSetup();
      await t.schliessen(t.alleIds);
      expect((await t.oeffnen()).status).toBe(200);
      expect((await t.aktionenLesen()).aktionen.every((a) => a.zustand === 'erledigt')).toBe(true);
      const antwort = (await (await t.schliessen(t.alleIds)).json()) as ProtokollStatusAntwort;
      expect(antwort.aktionen.map((a) => a.status)).toEqual(Array(5).fill('uebersprungen'));
      expect(t.kalender.eventAnlegen).toHaveBeenCalledTimes(1);
      expect(t.userAdmin.createUser).toHaveBeenCalledTimes(1);
      expect(
        t.mitglieder.statusSetzen.mock.calls.filter((c) => c[0] === 'r' && c[2] === '2026-10-06'),
      ).toHaveLength(1);
      expect(t.posten.besetzungAnlegen).toHaveBeenCalledTimes(1);
      expect(t.kalender.eventAktualisieren).toHaveBeenCalledTimes(1);
      // Nothing recorded earlier is lost.
      expect(Object.keys((await t.holen(t.id)).kopf.aktionen)).toHaveLength(5);
    });

    it('closes although an Aktion fails and lets it run again later', async () => {
      const t = await aktionenSetup();
      t.kalender.eventAnlegen.mockRejectedValueOnce(new KalenderUngueltig('Kaputtes Event'));
      t.kalender.eventAktualisieren.mockRejectedValueOnce(new EntfernungBestaetigen([], []));
      const antwort = (await (await t.schliessen(t.alleIds)).json()) as ProtokollStatusAntwort;
      const nach = Object.fromEntries(antwort.aktionen.map((a) => [a.art, a]));
      expect(nach['event.anlegen']).toMatchObject({ status: 'fehler', meldung: 'Kaputtes Event' });
      expect(nach['event.aendern']).toMatchObject({ status: 'fehler' });
      expect(nach['event.aendern']!.meldung).toContain('Dienste');
      expect(nach['wahl.posten']!.status).toBe('erledigt');
      const dto = await t.holen(t.id);
      expect(dto.status).toBe('abgeschlossen');
      expect(dto.kopf.aktionen[t.ids.neu]).toMatchObject({
        status: 'fehler',
        text: 'Kaputtes Event',
      });
      expect(JSON.stringify(dto.inhalt)).not.toContain('e-neu');

      const { aktionen } = await t.aktionenLesen();
      expect(aktionen.filter((a) => a.zustand === 'fehler').map((a) => a.id)).toEqual([
        t.ids.neu,
        t.ids.aender,
      ]);

      // Retry for the closed protocol: the id is written back and the version counts up.
      const res = await t.wiederholen([t.ids.neu, t.ids.einladung, 'x:unbekannt']);
      expect(res.status).toBe(200);
      const wieder = (await res.json()) as ProtokollAktionenAusfuehrenAntwort;
      expect(wieder.ergebnisse.map((e) => [e.id, e.status])).toEqual([
        [t.ids.neu, 'erledigt'],
        [t.ids.einladung, 'uebersprungen'],
        ['x:unbekannt', 'uebersprungen'],
      ]);
      expect(wieder.version).toBe(3);
      expect(wieder.aktionen.find((a) => a.id === t.ids.neu)).toMatchObject({
        zustand: 'erledigt',
      });
      const nachher = await t.holen(t.id);
      expect(nachher.version).toBe(3);
      expect(JSON.stringify(nachher.inhalt)).toContain('"eventId":"e-neu"');
      expect(nachher.kopf.aktionen[t.ids.neu]).toMatchObject({ status: 'erledigt' });
      expect(t.kalender.eventAnlegen).toHaveBeenCalledTimes(2);
    });

    it('reports an email address that is taken and does not create a profile', async () => {
      const t = await aktionenSetup();
      t.userAdmin.createUser.mockRejectedValueOnce(
        Object.assign(new Error('exists'), { name: 'AliasExistsException' }),
      );
      const antwort = (await (
        await t.schliessen([t.ids.einladung])
      ).json()) as ProtokollStatusAntwort;
      expect(antwort.aktionen).toMatchObject([
        { art: 'anwaerter.einladen', status: 'fehler', meldung: 'E-Mail-Adresse bereits vergeben' },
      ]);
      expect(t.mitglieder.speichern.mock.calls.filter((c) => c[0] === 'uuid-neu')).toEqual([]);
    });

    it('closes without Aktionen when none are chosen and only retries closed protocols', async () => {
      const t = await aktionenSetup();
      expect((await t.wiederholen(t.alleIds)).status).toBe(409);
      const antwort = (await (await t.schliessen()).json()) as ProtokollStatusAntwort;
      expect(antwort.aktionen).toEqual([]);
      expect(t.kalender.eventAnlegen).not.toHaveBeenCalled();
      expect((await t.holen(t.id)).kopf.aktionen).toEqual({});
      expect((await t.wiederholen([])).status).toBe(400);
    });

    it('skips Aktionen that cannot run and keeps the results when a draft is saved', async () => {
      const t = await aktionenSetup();
      const dto = await t.holen(t.id);
      // The Sitzung date is over, but the Posten does not exist any more.
      t.posten.holen.mockResolvedValueOnce(undefined);
      const antwort = (await (
        await t.schliessen([t.ids.wahl, t.ids.neu])
      ).json()) as ProtokollStatusAntwort;
      expect(antwort.aktionen.map((a) => [a.art, a.status])).toEqual([
        ['wahl.posten', 'uebersprungen'],
        ['event.anlegen', 'erledigt'],
      ]);
      expect(antwort.aktionen[0]!.meldung).toBe('Den Posten gibt es nicht mehr.');
      await t.oeffnen();
      const offen = await t.holen(t.id);
      expect(Object.keys(offen.kopf.aktionen)).toEqual([t.ids.neu]);
      // The editor sends back its own kopf; the results stay.
      const put = await t.app.request(
        `/api/protokolle/${t.id}`,
        json('vorstand-token', 'PUT', {
          inhalt: offen.inhalt,
          kopf: { ...dto.kopf, aktionen: {} },
          version: offen.version,
        }),
      );
      expect(put.status).toBe(200);
      expect(Object.keys((await t.holen(t.id)).kopf.aktionen)).toEqual([t.ids.neu]);
    });

    it('pre-fills a new protocol from the calendar', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue(kategorien);
      const ereignis = (id: string, beginn: string, extra: object = {}) =>
        ({
          ...bestehend,
          id,
          titel: id,
          anzeigeTitel: id,
          beginn,
          ende: new Date(Date.parse(beginn) + 3 * 3600_000).toISOString(),
          ...extra,
        }) as EventDto;
      t.kalender.events.mockResolvedValue([
        ereignis('vorbei', '2026-10-20T18:00:00.000Z'),
        ereignis('kommt', '2026-11-20T18:00:00.000Z', { verantwortlich: { sub: 'm2' } }),
        ereignis('serie', '2026-11-21T18:00:00.000Z', { serie: 'barabend' }),
        ereignis('sitzung', '2026-11-22T18:00:00.000Z', {
          kategorie: { id: 'k1', name: 'Sitzung', farbe: 'red' },
        }),
        ereignis('abgesagt', '2026-11-23T18:00:00.000Z', { abgesagt: true }),
      ]);
      const vorschlag = (await (
        await t.app.request('/api/protokolle/vorschlag?eventId=s2', json('admin-token', 'GET'))
      ).json()) as { inhalt: ProtokollDokument };
      const ids = (i: number) =>
        vorschlag.inhalt.content[i]!.content!.map(
          (k) => (k.attrs?.daten as { eventId?: string } | undefined)?.eventId,
        );
      expect(ids(0)).toEqual(['vorbei']);
      expect(ids(2)).toEqual(['kommt']);
      expect(vorschlag.inhalt.content[2]!.content![0]).toMatchObject({
        attrs: { daten: { name: 'kommt', kategorieId: 'kd', verantwortlichSub: 'm2' } },
      });
      // The calendar is asked from the earlier Sitzung on, or for 92 days without one.
      expect(t.kalender.events).toHaveBeenLastCalledWith('2026-08-03', expect.any(String));
    });
  });
});

describe('todos', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const eingabe = { titel: ' Kasse prüfen ', notizen: 'Beleg holen', faelligAm: '2026-11-14' };

  /** App with profiles for a, r, v, m2 (usernames = sub). */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
    }
    const liste = async (token: string) =>
      (await (await t.app.request('/api/me/todos', json(token, 'GET'))).json()) as Todo[];
    const anlegen = async (token: string, body: unknown = eingabe) => {
      const res = await t.app.request('/api/me/todos', json(token, 'POST', body));
      return { res, todo: (await res.clone().json()) as Todo };
    };
    const abhaken = (token: string, id: string, erledigt: boolean) =>
      t.app.request(`/api/me/todos/${id}/erledigt`, json(token, 'PUT', { erledigt }));
    /** A Todo from a protocol for the given people. */
    const ausProtokoll = (modus: 'gemeinsam' | 'einzeln', subs: string[], extra = {}) =>
      t.todos.anlegen({
        titel: 'Aus Sitzung',
        notizen: null,
        faelligAm: '2026-11-20',
        modus,
        protokollId: 'p1',
        bausteinId: 'b1',
        erstelltVon: 'v',
        subs,
        ...extra,
      });
    return { ...t, liste, anlegen, abhaken, ausProtokoll };
  }

  it('needs a signed-in member', async () => {
    const t = await setup();
    expect((await t.app.request('/api/me/todos')).status).toBe(401);
  });

  it('creates an own Todo for the member only, in mode einzeln', async () => {
    const t = await setup();
    const { res, todo } = await t.anlegen('member-token');
    expect(res.status).toBe(201);
    expect(todo).toMatchObject({
      titel: 'Kasse prüfen',
      notizen: 'Beleg holen',
      faelligAm: '2026-11-14',
      modus: 'einzeln',
      quelle: null,
      erledigtAm: null,
      erledigtVon: null,
      ichErledigt: false,
      bearbeitbar: true,
      zustaendige: [{ sub: 'm2', username: 'user-m2', status: 'anwaerter', erledigtAm: null }],
    });
    expect(await t.liste('member-token')).toHaveLength(1);
    expect(await t.liste('reader-token')).toEqual([]);
    expect([...t.todosListe.values()][0]).toMatchObject({ erstelltVon: 'm2', protokollId: null });
  });

  it('validates the input', async () => {
    const t = await setup();
    for (const body of [
      { ...eingabe, titel: '  ' },
      { ...eingabe, titel: 'x'.repeat(201) },
      { ...eingabe, faelligAm: '14.11.2026' },
      { ...eingabe, notizen: 'x'.repeat(2001) },
      { titel: 'x' },
    ]) {
      expect((await t.anlegen('member-token', body)).res.status).toBe(400);
    }
    expect(
      (await t.anlegen('member-token', { titel: 'x', faelligAm: '2026-11-14' })).res.status,
    ).toBe(201);
  });

  it('lists the Todos of the member, open ones first by deadline, then done ones', async () => {
    const t = await setup();
    const spaet = (
      await t.anlegen('member-token', { ...eingabe, titel: 'spät', faelligAm: '2026-12-01' })
    ).todo;
    const frueh = (
      await t.anlegen('member-token', { ...eingabe, titel: 'früh', faelligAm: '2026-11-10' })
    ).todo;
    const fertig = (
      await t.anlegen('member-token', { ...eingabe, titel: 'fertig', faelligAm: '2026-11-01' })
    ).todo;
    await t.ausProtokoll('einzeln', ['r']);
    await t.abhaken('member-token', fertig.id, true);
    const liste = await t.liste('member-token');
    expect(liste.map((x) => [x.titel, x.ichErledigt])).toEqual([
      ['früh', false],
      ['spät', false],
      ['fertig', true],
    ]);
    expect([frueh.id, spaet.id, fertig.id]).toHaveLength(3);
  });

  it('shows the source of a Todo from a protocol and does not let it be changed', async () => {
    const t = await setup();
    t.kalender.eventsKurz.mockResolvedValue([
      {
        id: 's1',
        titel: 'Sitzung',
        beginn: '2026-11-04T18:00:00.000Z',
        ende: '2026-11-04T20:00:00.000Z',
        abgesagt: false,
        kategorie: null,
        protokoll: true,
        protokollArt: 'sitzung',
      },
    ]);
    t.protokollListe.set('p1', {
      id: 'p1',
      eventId: 's1',
      status: 'abgeschlossen',
      version: 2,
      erstelltVon: 'v',
      erstelltAm: new Date('2026-11-01T10:00:00Z'),
      geaendertVon: 'v',
      geaendertAm: new Date('2026-11-04T21:00:00Z'),
    } as never);
    const id = await t.ausProtokoll('einzeln', ['m2', 'r']);
    const [todo] = await t.liste('member-token');
    expect(todo).toMatchObject({
      id,
      bearbeitbar: false,
      quelle: { protokollId: 'p1', eventName: 'Sitzung', datum: '2026-11-04' },
      zustaendige: [{ sub: 'm2' }, { sub: 'r' }],
    });
    const put = await t.app.request(`/api/me/todos/${id}`, json('member-token', 'PUT', eingabe));
    expect(put.status).toBe(403);
    expect(((await put.json()) as { error: string }).error).toBe(
      'Dieses Todo kannst du nicht ändern.',
    );
    expect(
      (await t.app.request(`/api/me/todos/${id}`, json('member-token', 'DELETE'))).status,
    ).toBe(403);
    // Not even the member who closed the protocol (its creator) may.
    expect(
      (await t.app.request(`/api/me/todos/${id}`, json('vorstand-token', 'DELETE'))).status,
    ).toBe(403);
  });

  it('edits and deletes only own Todos', async () => {
    const t = await setup();
    const { todo } = await t.anlegen('member-token');
    const neu = { titel: 'Anders', notizen: '', faelligAm: '2026-12-24' };
    const put = await t.app.request(`/api/me/todos/${todo.id}`, json('member-token', 'PUT', neu));
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({
      id: todo.id,
      titel: 'Anders',
      notizen: null,
      faelligAm: '2026-12-24',
    });
    // Others do not see it at all.
    expect(
      (await t.app.request(`/api/me/todos/${todo.id}`, json('reader-token', 'PUT', neu))).status,
    ).toBe(404);
    expect(
      (await t.app.request(`/api/me/todos/${todo.id}`, json('reader-token', 'DELETE'))).status,
    ).toBe(404);
    // Zuständig but created by somebody else: visible, not editable.
    const fremd = await t.ausProtokoll('einzeln', ['r'], { protokollId: null, erstelltVon: 'a' });
    expect(
      (await t.app.request(`/api/me/todos/${fremd}`, json('reader-token', 'DELETE'))).status,
    ).toBe(403);
    expect(
      (await t.app.request('/api/me/todos/gibtsnicht', json('member-token', 'PUT', neu))).status,
    ).toBe(404);
    expect(
      (await t.app.request(`/api/me/todos/${todo.id}`, json('member-token', 'DELETE'))).status,
    ).toBe(200);
    expect(await t.liste('member-token')).toEqual([]);
  });

  it('ticks a gemeinsam Todo for everybody and unticks it again', async () => {
    const t = await setup();
    const id = await t.ausProtokoll('gemeinsam', ['m2', 'r']);
    const hakt = await t.abhaken('member-token', id, true);
    expect(hakt.status).toBe(200);
    expect(await hakt.json()).toMatchObject({
      ichErledigt: true,
      erledigtVon: 'm2',
      erledigtAm: expect.any(String),
    });
    expect((await t.liste('reader-token'))[0]).toMatchObject({
      ichErledigt: true,
      erledigtVon: 'm2',
      zustaendige: [{ erledigtAm: null }, { erledigtAm: null }],
    });
    // Anybody zuständig can take the tick back.
    const zurueck = await t.abhaken('reader-token', id, false);
    expect(await zurueck.json()).toMatchObject({
      ichErledigt: false,
      erledigtAm: null,
      erledigtVon: null,
    });
    expect((await t.liste('member-token'))[0]!.ichErledigt).toBe(false);
  });

  it('ticks an einzeln Todo for the member only', async () => {
    const t = await setup();
    const id = await t.ausProtokoll('einzeln', ['m2', 'r']);
    await t.abhaken('member-token', id, true);
    const meins = (await t.liste('member-token'))[0]!;
    expect(meins).toMatchObject({ ichErledigt: true, erledigtAm: null });
    expect(meins.zustaendige.map((z) => [z.sub, z.erledigtAm !== null])).toEqual([
      ['m2', true],
      ['r', false],
    ]);
    expect((await t.liste('reader-token'))[0]!.ichErledigt).toBe(false);
    const zurueck = await t.abhaken('member-token', id, false);
    expect(await zurueck.json()).toMatchObject({ ichErledigt: false });
    expect(
      (await t.liste('member-token'))[0]!.zustaendige.every((z) => z.erledigtAm === null),
    ).toBe(true);
  });

  it('lets only people who are zuständig tick', async () => {
    const t = await setup();
    const id = await t.ausProtokoll('gemeinsam', ['r']);
    const res = await t.abhaken('member-token', id, true);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      'Du bist für dieses Todo nicht zuständig.',
    );
    expect((await t.abhaken('member-token', 'gibtsnicht', true)).status).toBe(404);
    expect(
      (await t.app.request(`/api/me/todos/${id}/erledigt`, json('reader-token', 'PUT', {}))).status,
    ).toBe(400);
    expect(t.todosListe.get(id)!.erledigtAm).toBeNull();
  });
});

describe('vCard links', () => {
  const daten: MitgliedDaten = {
    vorname: 'Erika',
    nachname: 'Muster',
    anrede: 'weiblich',
    kontaktkanaele: 'whatsapp',
    discordName: null,
    adresse: null,
    telefon: '0171 1234567',
    ueberMich: null,
    profilbildKey: 'profilbilder/m2/bild.jpg',
    geburtsdatum: null,
    geburtstagImKalender: null,
    wohnheim: null,
  };

  async function setup() {
    const t = makeApp();
    await t.mitglieder.speichern('r', { ...daten, profilbildKey: null });
    await t.mitglieder.speichern('m2', daten);
    t.userAdmin.konten.mockResolvedValue(
      new Map<string, Konto>([
        [
          'm2',
          {
            sub: 'm2',
            kontoName: 'k2',
            username: 'erika',
            email: 'e@example.de',
            aktiviert: true,
            enabled: true,
          },
        ],
      ]),
    );
    const token = async (bearerToken = 'reader-token') =>
      (await (
        await t.app.request('/api/me/vcard-token', { method: 'POST', headers: bearer(bearerToken) })
      ).json()) as { token: string; ablauf: string };
    return { t, token };
  }

  it('issues a token valid for 24 hours and replaces the old one', async () => {
    const { t, token } = await setup();
    const first = await token();
    const ablauf = new Date(first.ablauf).getTime() - Date.now();
    expect(ablauf).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(ablauf).toBeLessThanOrEqual(24 * 3600 * 1000);
    const second = await token();
    expect(second.token).not.toBe(first.token);
    expect((await t.app.request(`/api/vcard/${first.token}/erika.vcf`)).status).toBe(404);
    expect((await t.app.request(`/api/vcard/${second.token}/erika.vcf`)).status).toBe(200);
  });

  it('requires authentication to issue a token', async () => {
    const { t } = await setup();
    expect((await t.app.request('/api/me/vcard-token', { method: 'POST' })).status).toBe(401);
  });

  it('serves the vCard with picture and the right headers, by username or sub', async () => {
    const { t, token } = await setup();
    const { token: tok } = await token();
    for (const datei of ['erika.vcf', 'ERIKA.vcf', 'm2.vcf']) {
      const res = await t.app.request(`/api/vcard/${tok}/${datei}`);
      expect(res.status, datei).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/vcard; charset=utf-8');
      expect(res.headers.get('content-disposition')).toBe('inline; filename="erika.vcf"');
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.text();
      expect(body).toContain('BEGIN:VCARD');
      expect(body).toContain('FN:Erika Muster');
      expect(body).toContain('NICKNAME:erika');
      expect(body).toContain('TEL;TYPE=CELL:+491711234567');
      expect(body).toContain('EMAIL;TYPE=INTERNET:e@example.de');
      expect(body).toContain('PHOTO;ENCODING=b;TYPE=JPEG:AQID');
    }
    expect(t.profilbilder.lesen).toHaveBeenCalledWith('profilbilder/m2/bild-klein.jpg');
  });

  it('leaves the photo out when it cannot be read', async () => {
    const { t, token } = await setup();
    t.profilbilder.lesen.mockRejectedValue(new Error('weg'));
    const { token: tok } = await token();
    const res = await t.app.request(`/api/vcard/${tok}/erika.vcf`);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('PHOTO');
  });

  it('answers 404 for unknown and expired tokens and unknown members', async () => {
    const { t, token } = await setup();
    expect((await t.app.request('/api/vcard/unbekannt/erika.vcf')).status).toBe(404);
    const { token: tok } = await token();
    expect((await t.app.request(`/api/vcard/${tok}/niemand.vcf`)).status).toBe(404);
    t.mitglieder.vcardTokens.set(vcardTokenHash(tok), {
      sub: 'r',
      ablauf: new Date(Date.now() - 1000),
    });
    expect((await t.app.request(`/api/vcard/${tok}/erika.vcf`)).status).toBe(404);
  });

  it('answers 404 for a deactivated member', async () => {
    const { t, token } = await setup();
    const { token: tok } = await token();
    await t.mitglieder.deaktiviertSetzen('m2', true);
    expect((await t.app.request(`/api/vcard/${tok}/erika.vcf`)).status).toBe(404);
  });

  it('stops working when the token owner is deactivated', async () => {
    const { t, token } = await setup();
    const { token: tok } = await token();
    expect((await t.app.request(`/api/vcard/${tok}/erika.vcf`)).status).toBe(200);
    await t.mitglieder.deaktiviertSetzen('r', true);
    expect((await t.app.request(`/api/vcard/${tok}/erika.vcf`)).status).toBe(404);
  });

  it('answers 404 for a malformed percent-encoded file name', async () => {
    const { t, token } = await setup();
    const { token: tok } = await token();
    expect((await t.app.request(`/api/vcard/${tok}/%E0%A4%A.vcf`)).status).toBe(404);
  });
});

describe('privatpartys', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const termin = (extra: Record<string, unknown> = {}) => ({
    datum: '2099-03-14',
    beginn: '19:00',
    ende: '02:00',
    stufe: 'bevorzugt',
    ...extra,
  });
  const kategorie = {
    id: 'party',
    name: 'Party',
    farbe: 'blue',
    art: 'dienste' as const,
    teilnahmeStatus: null,
    dauer: 'eintaegig' as const,
    protokoll: false,
    protokollArt: 'sitzung' as const,
    benutzt: false,
    archiviert: false,
  };
  const vorlage = {
    id: 'privat',
    titel: 'Privatparty',
    beschreibung: null,
    kategorieId: 'party',
    beginnZeit: '20:00',
    endeZeit: '02:00',
    teilnahmeStatus: null,
    tage: 1,
    bilderOrdner: false,
    archiviert: false,
    schichten: [
      {
        art: 'betrieb' as const,
        beginnZeit: '20:00',
        endeZeit: '02:00',
        bedarfe: [{ dienstformId: 'tresen', minimum: 1, wunsch: 2 }],
      },
    ],
  };

  /** Profiles for a (admin), v, m2 and a Kategorie and Vorlage for the events. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
      await t.push.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      });
    }
    t.kalender.kategorien.mockResolvedValue([kategorie]);
    t.kalender.dienstformen.mockResolvedValue([
      { id: 'tresen', name: 'Tresen', reihenfolge: 1, archiviert: false },
    ]);
    t.kalender.vorlagen.mockResolvedValue([vorlage]);
    const person = async () => {
      const res = await t.app.request(
        '/api/privatpartys/personen',
        json('admin-token', 'POST', { name: 'Eva Muster', email: 'eva@example.de' }),
      );
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };
    const anlegen = async (extra: Record<string, unknown> = {}) => {
      const personId = await person();
      const res = await t.app.request(
        '/api/privatpartys',
        json('admin-token', 'POST', {
          personId,
          anlass: '30. Geburtstag',
          termine: [termin(), termin({ datum: '2099-03-21', stufe: 'notfalls' })],
          ...extra,
        }),
      );
      expect(res.status).toBe(201);
      return { id: ((await res.json()) as { id: string }).id, personId };
    };
    const holen = async (id: string) =>
      (await (
        await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'GET'))
      ).json()) as PrivatpartyDetailDto;
    return { ...t, person, anlegen, holen };
  }

  it('is only open to holders of the right', async () => {
    const t = await setup();
    for (const [methode, pfad] of [
      ['GET', '/api/privatpartys'],
      ['GET', '/api/privatpartys/personen'],
      ['POST', '/api/privatpartys'],
    ] as const) {
      expect(
        (
          await t.app.request(
            pfad,
            json('member-token', methode, methode === 'GET' ? undefined : {}),
          )
        ).status,
      ).toBe(403);
    }
    expect((await t.app.request('/api/privatpartys', json('admin-token', 'GET'))).status).toBe(200);
    // A Posten can grant the right.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['privatpartys:verwalten' as const] : [],
    );
    expect((await t.app.request('/api/privatpartys', json('vorstand-token', 'GET'))).status).toBe(
      200,
    );
  });

  it('manages people and refuses to delete one with Privatpartys', async () => {
    const t = await setup();
    const bad = await t.app.request(
      '/api/privatpartys/personen',
      json('admin-token', 'POST', { name: '', email: 'kaputt' }),
    );
    expect(bad.status).toBe(400);
    const { id, personId } = await t.anlegen();
    const put = await t.app.request(
      `/api/privatpartys/personen/${personId}`,
      json('admin-token', 'PUT', { name: 'Eva M.', kontakt: 'Instagram @eva' }),
    );
    expect(put.status).toBe(200);
    const detail = await (
      await t.app.request(`/api/privatpartys/personen/${personId}`, json('admin-token', 'GET'))
    ).json();
    expect(detail).toMatchObject({
      name: 'Eva M.',
      email: null,
      kontakt: 'Instagram @eva',
      anzahlPrivatpartys: 1,
      privatpartys: [{ id }],
    });
    expect(
      (await t.app.request(`/api/privatpartys/personen/${personId}`, json('admin-token', 'DELETE')))
        .status,
    ).toBe(409);
    await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'DELETE'));
    expect(
      (await t.app.request(`/api/privatpartys/personen/${personId}`, json('admin-token', 'DELETE')))
        .status,
    ).toBe(200);
  });

  it('creates, lists, edits and deletes a Privatparty', async () => {
    const t = await setup();
    const personId = await t.person();
    const post = (body: unknown) =>
      t.app.request('/api/privatpartys', json('admin-token', 'POST', body));
    expect((await post({ personId, termine: [] })).status).toBe(400);
    expect((await post({ termine: [termin()] })).status).toBe(400);
    expect((await post({ personId: 'gibt-es-nicht', termine: [termin()] })).status).toBe(404);
    const { id } = await t.anlegen();
    const abgesagt = await t.anlegen({ anlass: null });
    await t.app.request(
      `/api/privatpartys/${abgesagt.id}/status`,
      json('admin-token', 'PUT', { status: 'abgesagt' }),
    );
    const liste = async (status?: string) =>
      (await (
        await t.app.request(
          `/api/privatpartys${status ? `?status=${status}` : ''}`,
          json('admin-token', 'GET'),
        )
      ).json()) as { id: string }[];
    expect((await liste()).map((p) => p.id)).toEqual([id]);
    expect((await liste('alle')).map((p) => p.id).sort()).toEqual([id, abgesagt.id].sort());
    expect((await liste('abgesagt')).map((p) => p.id)).toEqual([abgesagt.id]);

    const d = await t.holen(id);
    expect(d).toMatchObject({
      status: 'offen',
      anlass: '30. Geburtstag',
      person: { name: 'Eva Muster' },
      unbeantwortet: false,
      umfrage: null,
      event: null,
    });
    expect(d.termine.map((x) => [x.datum, x.stufe])).toEqual([
      ['2099-03-14', 'bevorzugt'],
      ['2099-03-21', 'notfalls'],
    ]);
    const put = await t.app.request(
      `/api/privatpartys/${id}`,
      json('admin-token', 'PUT', {
        personId: d.person!.id,
        anlass: null,
        notizen: 'Wünscht DJ',
        termine: [{ ...d.termine[1]!, stufe: 'moeglich' }],
      }),
    );
    expect(put.status).toBe(200);
    const neu = await t.holen(id);
    expect(neu).toMatchObject({ anlass: null, notizen: 'Wünscht DJ' });
    expect(neu.termine).toEqual([{ ...d.termine[1], stufe: 'moeglich' }]);
    expect(
      (await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'DELETE'))).status,
    ).toBe(200);
    expect(
      (await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'GET'))).status,
    ).toBe(404);
  });

  it('accepts a date directly: event at the wished times, no contact data, status zugesagt', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const d = await t.holen(id);
    const wunsch = d.termine[0]!;
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/zusage`,
          json('admin-token', 'POST', { terminId: 'x', vorlageId: 'privat' }),
        )
      ).status,
    ).toBe(400);
    const res = await t.app.request(
      `/api/privatpartys/${id}/zusage`,
      json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
    );
    expect(res.status).toBe(201);
    expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Privatparty',
        kategorieId: 'party',
        beginn: '2099-03-14T18:00:00.000Z',
        ende: '2099-03-15T01:00:00.000Z',
        beschreibung: null,
      }),
      'a',
    );
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      anzeigeTitel: 'Privatparty',
      beginn: '2099-03-14T18:00:00.000Z',
    } as unknown as EventDto);
    expect(await t.holen(id)).toMatchObject({
      status: 'zugesagt',
      terminId: wunsch.id,
      event: { id: 'e1' },
    });
    // Already accepted.
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/zusage`,
          json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
        )
      ).status,
    ).toBe(409);
    // The accepted date cannot be removed.
    const d2 = await t.holen(id);
    const put = await t.app.request(
      `/api/privatpartys/${id}`,
      json('admin-token', 'PUT', {
        personId: d2.person!.id,
        termine: [{ ...d2.termine[1]! }],
      }),
    );
    expect(put.status).toBe(409);
    // A request with an event cannot be deleted.
    expect(
      (await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'DELETE'))).status,
    ).toBe(409);
  });

  it('deletes the event when the request leaves "zugesagt"', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const wunsch = (await t.holen(id)).termine[0]!;
    await t.app.request(
      `/api/privatpartys/${id}/zusage`,
      json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
    );
    const res = await t.app.request(
      `/api/privatpartys/${id}/status`,
      json('admin-token', 'PUT', { status: 'abgesagt' }),
    );
    expect(res.status).toBe(200);
    expect(t.kalender.eventLoeschen).toHaveBeenCalledWith('e1');
    expect(await t.holen(id)).toMatchObject({ status: 'abgesagt', terminId: null, event: null });
    // Accepting again through the status route needs date and Vorlage.
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/status`,
          json('admin-token', 'PUT', { status: 'zugesagt' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/status`,
          json('admin-token', 'PUT', {
            status: 'zugesagt',
            terminId: wunsch.id,
            vorlageId: 'privat',
          }),
        )
      ).status,
    ).toBe(200);
    // An event that is already gone does not block going back to "offen".
    t.kalender.eventLoeschen.mockResolvedValueOnce(false);
    expect(
      (
        await t.app.request(
          `/api/privatpartys/${id}/status`,
          json('admin-token', 'PUT', { status: 'offen' }),
        )
      ).status,
    ).toBe(200);
    expect(await t.holen(id)).toMatchObject({ status: 'offen', terminId: null });
  });

  it('builds a poll over the wish dates and turns the chosen one into the event', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const umfrage = (body: unknown, token = 'admin-token') =>
      t.app.request(`/api/privatpartys/${id}/umfrage`, json(token, 'POST', body));
    expect(
      (await umfrage({ vorlageId: 'gibt-es-nicht', endetAm: '2099-03-01', pflicht: true })).status,
    ).toBe(400);
    expect(
      (await umfrage({ vorlageId: 'privat', endetAm: '2000-01-01', pflicht: true })).status,
    ).toBe(400);
    const res = await umfrage({ vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false });
    expect(res.status).toBe(201);
    const { id: umfrageId } = (await res.json()) as { id: string };
    expect(
      (await umfrage({ vorlageId: 'privat', endetAm: '2099-03-01', pflicht: true })).status,
    ).toBe(409);
    const d = await t.holen(id);
    expect(d.umfrage).toMatchObject({ id: umfrageId, laeuft: true });
    const u = (await (
      await t.app.request(`/api/umfragen/${umfrageId}`, json('member-token', 'GET'))
    ).json()) as UmfrageDetailDto;
    expect(u).toMatchObject({
      titel: 'Privatparty: Terminabstimmung',
      termin: { vorlageId: 'privat', kategorieId: 'party' },
      pflicht: { status: [] },
      optional: { status: ['anwaerter', 'mitglied', 'em', 'extern'] },
    });
    expect(u.fragen[0]!.optionen.map((o) => o.text)).toEqual([
      'Sa, 14.03.2099 · 19:00–02:00 · Bevorzugt',
      'Sa, 21.03.2099 · 19:00–02:00 · Nur notfalls',
    ]);
    // The member without the right does not see the poll's controls, the holder of the right does.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['privatpartys:verwalten' as const] : [],
    );
    const sicht = async (token: string) =>
      (await (
        await t.app.request(`/api/umfragen/${umfrageId}`, json(token, 'GET'))
      ).json()) as UmfrageDetailDto;
    expect((await sicht('vorstand-token')).darfBearbeiten).toBe(true);
    expect((await sicht('member-token')).darfBearbeiten).toBe(false);
    // End the poll and create the event with the wished times.
    expect(
      (await t.app.request(`/api/umfragen/${umfrageId}/beenden`, json('member-token', 'POST')))
        .status,
    ).toBe(403);
    expect(
      (await t.app.request(`/api/umfragen/${umfrageId}/beenden`, json('vorstand-token', 'POST')))
        .status,
    ).toBe(200);
    const zweite = u.fragen[0]!.optionen[1]!;
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      anzeigeTitel: 'Privatparty',
      beginn: '2099-03-21T18:00:00.000Z',
      schichten: [],
    } as unknown as EventDto);
    const ev = await t.app.request(
      `/api/umfragen/${umfrageId}/event`,
      json('vorstand-token', 'POST', { optionId: zweite.id }),
    );
    expect(ev.status).toBe(201);
    expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Privatparty',
        beginn: '2099-03-21T18:00:00.000Z',
        ende: '2099-03-22T01:00:00.000Z',
      }),
      'v',
    );
    const danach = await t.holen(id);
    expect(danach).toMatchObject({ status: 'zugesagt', event: { id: 'e1' } });
    expect(danach.terminId).toBe(danach.termine[1]!.id);
  });

  it('adjusts the options of a running poll when the Wunschtermine change', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const res = await t.app.request(
      `/api/privatpartys/${id}/umfrage`,
      json('admin-token', 'POST', { vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false }),
    );
    const { id: umfrageId } = (await res.json()) as { id: string };
    const optionen = async () =>
      (
        (await (
          await t.app.request(`/api/umfragen/${umfrageId}`, json('member-token', 'GET'))
        ).json()) as UmfrageDetailDto
      ).fragen[0]!;
    const vorher = await optionen();
    const [erste, zweite] = vorher.optionen;
    // Everybody votes for the second date; the vote is gone when it is removed.
    const stimme = await t.app.request(
      `/api/umfragen/${umfrageId}/stimme`,
      json('member-token', 'PUT', {
        antworten: [{ frageId: vorher.id, optionIds: [zweite!.id] }],
      }),
    );
    expect(stimme.status).toBe(200);
    // 'a' votes for the first date.
    await t.app.request(
      `/api/umfragen/${umfrageId}/stimme`,
      json('admin-token', 'PUT', {
        antworten: [{ frageId: vorher.id, optionIds: [erste!.id] }],
      }),
    );
    const poll = (await optionen()) && t.umfragenListe.get(umfrageId)!;
    const nachrichten = () =>
      t.gesendet.splice(0).filter((g) => g.url === `/app/umfragen/${umfrageId}`);
    nachrichten();
    const d = await t.holen(id);
    const put = (termine: unknown[]) =>
      t.app.request(
        `/api/privatpartys/${id}`,
        json('admin-token', 'PUT', {
          personId: d.person!.id,
          anlass: d.anlass,
          notizen: null,
          termine,
        }),
      );
    // Added date: new option, old ones (and their ids) stay.
    expect(
      (
        await put([
          d.termine[0],
          d.termine[1],
          { datum: '2099-03-28', beginn: '18:00', ende: '23:00', stufe: 'moeglich' },
        ])
      ).status,
    ).toBe(200);
    // Nobody's vote became invalid: everybody in the circle hears about the change, once.
    expect(
      nachrichten()
        .map((g) => [g.endpoint.split('/').pop(), g.titel, g.text])
        .sort(),
    ).toEqual(['a', 'm2', 'v'].map((sub) => [sub, poll.titel, 'Die Termine haben sich geändert.']));
    // Same dates again: nothing changes, nothing is sent.
    expect(
      (
        await put([
          d.termine[0],
          d.termine[1],
          { datum: '2099-03-28', beginn: '18:00', ende: '23:00', stufe: 'moeglich' },
        ])
      ).status,
    ).toBe(200);
    expect(nachrichten()).toEqual([]);
    const mitNeuem = await optionen();
    expect(mitNeuem.optionen.map((o) => o.text)).toEqual([
      'Sa, 14.03.2099 · 19:00–02:00 · Bevorzugt',
      'Sa, 21.03.2099 · 19:00–02:00 · Nur notfalls',
      'Sa, 28.03.2099 · 18:00–23:00 · Möglich',
    ]);
    expect(mitNeuem.optionen.slice(0, 2).map((o) => o.id)).toEqual([erste!.id, zweite!.id]);
    // Changed time of the first date: old option goes, a new one comes; the second keeps its vote.
    expect((await put([{ ...d.termine[0], beginn: '20:00' }, d.termine[1]])).status).toBe(200);
    // 'a' lost the vote on the first date and is asked to vote again; the others are just told.
    expect(
      nachrichten()
        .map((g) => [g.endpoint.split('/').pop(), g.titel, g.text])
        .sort(),
    ).toEqual([
      [
        'a',
        'Bitte stimme erneut ab',
        `Die Termine von „${poll.titel}“ haben sich geändert. Bitte stimme erneut ab.`,
      ],
      ['m2', poll.titel, 'Die Termine haben sich geändert.'],
      ['v', poll.titel, 'Die Termine haben sich geändert.'],
    ]);
    const geaendert = await optionen();
    expect(geaendert.optionen.map((o) => o.text)).toEqual([
      'Sa, 14.03.2099 · 20:00–02:00 · Bevorzugt',
      'Sa, 21.03.2099 · 19:00–02:00 · Nur notfalls',
    ]);
    expect(geaendert.optionen[0]!.id).not.toBe(erste!.id);
    expect(geaendert.optionen[1]!.id).toBe(zweite!.id);
    // Removing the voted date drops the vote.
    expect((await put([{ ...d.termine[0], beginn: '20:00' }])).status).toBe(200);
    const nurErste = await optionen();
    expect(nurErste.optionen).toHaveLength(1);
    expect(t.umfragenListe.get(umfrageId)!.stimmen).toEqual([]);
    // The chosen option is still matched back to its wish date.
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      anzeigeTitel: 'Privatparty',
      beginn: '2099-03-14T19:00:00.000Z',
      schichten: [],
    } as unknown as EventDto);
    await t.app.request(`/api/umfragen/${umfrageId}/beenden`, json('admin-token', 'POST'));
    const ev = await t.app.request(
      `/api/umfragen/${umfrageId}/event`,
      json('admin-token', 'POST', { optionId: nurErste.optionen[0]!.id }),
    );
    expect(ev.status).toBe(201);
    expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
      expect.objectContaining({ beginn: '2099-03-14T19:00:00.000Z' }),
      expect.anything(),
    );
  });

  it('lets holders of the right outside the circle see and vote in the poll of a Privatparty only', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const res = await t.app.request(
      `/api/privatpartys/${id}/umfrage`,
      json('admin-token', 'POST', { vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false }),
    );
    const { id: umfrageId } = (await res.json()) as { id: string };
    const fremd = await t.app.request('/api/umfragen', {
      ...json('admin-token', 'POST', {
        titel: 'Sommerfest',
        beschreibung: null,
        endetAm: '2099-03-01',
        anonym: false,
        ergebnisse: 'sofort',
        pflicht: { status: [], posten: [], personen: ['a'] },
        optional: { status: [], posten: [], personen: [] },
        erinnerungenPflicht: [],
        erinnerungenOptional: [],
        fragen: [
          {
            text: 'Wann?',
            freitext: false,
            maxAntworten: 1,
            optionen: [{ text: 'A' }, { text: 'B' }],
          },
        ],
      }),
    });
    expect(fremd.status).toBe(201);
    const fremdId = ((await fremd.json()) as { id: string }).id;
    // r has no profile and so is outside the circle; m2 is in it. Only r holds the right.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'r' ? ['privatpartys:verwalten' as const] : [],
    );
    const ids = async (token: string, pfad: string) => {
      const r = await t.app.request(pfad, json(token, 'GET'));
      if (r.status !== 200) throw new Error(`${token} ${r.status} ${await r.text()}`);
      return ((await r.json()) as UmfrageListeDto[]).map((u) => u.id);
    };
    // The holder outside the circle sees the poll in the list and may vote (the gate passes; without a profile: 400, not 403).
    expect(await ids('reader-token', '/api/umfragen')).toEqual([umfrageId]);
    const detail = (await (
      await t.app.request(`/api/umfragen/${umfrageId}`, json('reader-token', 'GET'))
    ).json()) as UmfrageDetailDto;
    expect(detail).toMatchObject({ meinKreis: null, darfAbstimmen: true });
    const stimme = (token: string, uid: string) =>
      t.app.request(
        `/api/umfragen/${uid}/stimme`,
        json(token, 'PUT', {
          antworten: [
            { frageId: detail.fragen[0]!.id, optionIds: [detail.fragen[0]!.optionen[0]!.id] },
          ],
        }),
      );
    expect((await stimme('reader-token', umfrageId)).status).toBe(400);
    // Without the right the same caller gets 404 (poll hidden), also on the list.
    t.posten.rechteVon.mockImplementation(async () => []);
    expect(await ids('reader-token', '/api/umfragen')).toEqual([]);
    expect((await stimme('reader-token', umfrageId)).status).toBe(404);
    // The right grants nothing on other polls.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'r' ? ['privatpartys:verwalten' as const] : [],
    );
    expect(
      (await t.app.request(`/api/umfragen/${fremdId}`, json('reader-token', 'GET'))).status,
    ).toBe(404);
    expect((await stimme('reader-token', fremdId)).status).toBe(404);
    expect(await ids('reader-token', '/api/umfragen')).toEqual([umfrageId]);
  });

  it('ends the running poll when the request is declined and then refuses an event from it', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const res = await t.app.request(
      `/api/privatpartys/${id}/umfrage`,
      json('admin-token', 'POST', { vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false }),
    );
    const { id: umfrageId } = (await res.json()) as { id: string };
    expect((await t.holen(id)).umfrage).toMatchObject({ laeuft: true });
    await t.app.request(
      `/api/privatpartys/${id}/status`,
      json('admin-token', 'PUT', { status: 'abgesagt' }),
    );
    expect((await t.holen(id)).umfrage).toMatchObject({ laeuft: false });
    const u = (await (
      await t.app.request(`/api/umfragen/${umfrageId}`, json('admin-token', 'GET'))
    ).json()) as UmfrageDetailDto;
    const ev = await t.app.request(
      `/api/umfragen/${umfrageId}/event`,
      json('admin-token', 'POST', { optionId: u.fragen[0]!.optionen[0]!.id }),
    );
    expect(ev.status).toBe(409);
    expect(await ev.json()).toEqual({
      error: 'Die Privatparty ist bereits zugesagt oder abgesagt.',
    });
    expect(t.kalender.eventAnlegen).not.toHaveBeenCalled();
  });

  it('refuses an event from the poll of an already accepted request', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const res = await t.app.request(
      `/api/privatpartys/${id}/umfrage`,
      json('admin-token', 'POST', { vorlageId: 'privat', endetAm: '2099-03-01', pflicht: false }),
    );
    const { id: umfrageId } = (await res.json()) as { id: string };
    const wunsch = (await t.holen(id)).termine[0]!;
    // The direct acceptance also ends the poll.
    await t.app.request(
      `/api/privatpartys/${id}/zusage`,
      json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
    );
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      anzeigeTitel: 'Privatparty',
      schichten: [],
    } as unknown as EventDto);
    t.kalender.eventAnlegen.mockClear();
    const u = (await (
      await t.app.request(`/api/umfragen/${umfrageId}`, json('admin-token', 'GET'))
    ).json()) as UmfrageDetailDto;
    const ev = await t.app.request(
      `/api/umfragen/${umfrageId}/event`,
      json('admin-token', 'POST', { optionId: u.fragen[0]!.optionen[0]!.id }),
    );
    expect(ev.status).toBe(409);
    expect(t.kalender.eventAnlegen).not.toHaveBeenCalled();
  });

  it('shows the link to the Privatparty in the event only to holders of the right', async () => {
    const t = await setup();
    const { id } = await t.anlegen();
    const wunsch = (await t.holen(id)).termine[0]!;
    await t.app.request(
      `/api/privatpartys/${id}/zusage`,
      json('admin-token', 'POST', { terminId: wunsch.id, vorlageId: 'privat' }),
    );
    t.kalender.event.mockResolvedValue({
      id: 'e1',
      titel: 'Privatparty',
      anzeigeTitel: 'Privatparty',
      schichten: [],
      teilnahmen: [],
      nichtVerfuegbar: [],
      verantwortlich: null,
    } as unknown as EventDto);
    const abfrage = async (token: string) =>
      (await (
        await t.app.request('/api/kalender/events/e1', json(token, 'GET'))
      ).json()) as EventDto;
    expect((await abfrage('admin-token')).privatpartyId).toBe(id);
    expect((await abfrage('member-token')).privatpartyId).toBeUndefined();
  });
});

describe('privatpartys: Party-Mail', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let uid = 0;
  const mail = (extra: Partial<EingehendeMail> = {}): EingehendeMail => ({
    uid: ++uid,
    messageId: `<m${uid}@kunde.example>`,
    inReplyTo: null,
    referenzen: [],
    vonAdresse: 'eva@kunde.example',
    vonName: 'Eva Muster',
    anAdresse: 'party@party.example',
    betreff: 'Anfrage Geburtstag',
    text: 'Hallo, habt ihr am 14.3. Platz?',
    anhaenge: [],
    zeitpunkt: new Date(Date.UTC(2020, 0, 1, 10, uid)),
    ...extra,
  });

  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
      await t.push.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      });
    }
    // 'a' is admin (right via role), 'v' holds the right through a Posten, 'm2' has no right.
    t.userAdmin.rollen.mockResolvedValue(new Map([['a', ['admin']]]));
    t.posten.inhaberMitRecht.mockResolvedValue(['v']);
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['privatpartys:verwalten' as const] : [],
    );
    // Prime the position (first run imports nothing).
    t.partymail.uidValidity = '1';
    await t.privatpartys.abrufStandSetzen({ uidValidity: '1', letzteUid: 0 });
    t.gesendet.length = 0;
    const abrufen = async () =>
      t.app.request('/api/privatpartys/mail/abrufen', json('admin-token', 'POST'));
    const liste = async () =>
      (await (
        await t.app.request('/api/privatpartys?status=alle', json('admin-token', 'GET'))
      ).json()) as {
        id: string;
        unbeantwortet: boolean;
        mailAdresse: string | null;
        person: unknown;
      }[];
    const holen = async (id: string) =>
      (await (
        await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'GET'))
      ).json()) as PrivatpartyDetailDto;
    return { ...t, abrufen, liste, holen };
  }

  it('creates a blank entry for a new thread and notifies only the right holders', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail());
    const res = await t.abrufen();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ neu: 1 });
    const [eintrag] = await t.liste();
    expect(eintrag).toMatchObject({
      unbeantwortet: true,
      mailAdresse: 'eva@kunde.example',
      person: null,
    });
    const d = await t.holen(eintrag!.id);
    expect(d).toMatchObject({ status: 'offen', mailEingerichtet: true, termine: [] });
    expect(d.nachrichten).toMatchObject([{ richtung: 'ein', betreff: 'Anfrage Geburtstag' }]);
    expect(t.gesendet.map((g) => g.endpoint).sort()).toEqual([
      'https://push.example/a',
      'https://push.example/v',
    ]);
    expect(t.gesendet[0]).toMatchObject({ url: `/app/privatpartys/${eintrag!.id}` });
  });

  it('adds a reply in the thread to the same entry and skips duplicates', async () => {
    const t = await setup();
    const erste = mail();
    t.partymail.eingang.push(erste);
    await t.abrufen();
    t.gesendet.length = 0;
    const [eintrag] = await t.liste();
    t.partymail.eingang.push(
      mail({ inReplyTo: '<unbekannt@x>', referenzen: [erste.messageId, '<unbekannt@x>'] }),
    );
    // The same Message-ID again (e.g. a copy) is ignored.
    t.partymail.eingang.push(mail({ messageId: erste.messageId }));
    expect(await (await t.abrufen()).json()).toEqual({ neu: 1 });
    expect(await t.liste()).toHaveLength(1);
    expect((await t.holen(eintrag!.id)).nachrichten).toHaveLength(2);
    expect(t.gesendet.length).toBe(2);
    // The notification text of a follow-up differs from a new request.
    expect(t.gesendet[0]!.titel).toBe('Neue Nachricht zu einer Privatparty');
    // Unthreaded mail = new entry.
    t.partymail.eingang.push(mail());
    await t.abrufen();
    expect(await t.liste()).toHaveLength(2);
  });

  it('imports nothing when the mailbox was replaced and reports errors', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail());
    t.partymail.uidValidity = '2';
    expect(await (await t.abrufen()).json()).toEqual({ neu: 0 });
    expect(await t.liste()).toHaveLength(0);
    t.partymail.fehler = 'IMAP down';
    expect((await t.abrufen()).status).toBe(502);
    const status = await (
      await t.app.request('/api/privatpartys/mail-status', json('admin-token', 'GET'))
    ).json();
    expect(status).toMatchObject({ eingerichtet: true, fehler: 'IMAP down' });
  });

  it('stops at a mail that cannot be stored and retries it in the next run', async () => {
    const t = await setup();
    const [a, kaputt, c] = [mail(), mail(), mail()];
    t.partymail.eingang.push(a, kaputt, c);
    const echt = t.privatpartys.nachrichtAnlegen.bind(t.privatpartys);
    let ausfall = true;
    vi.spyOn(t.privatpartys, 'nachrichtAnlegen').mockImplementation(async (daten) => {
      if (ausfall && daten.messageId === kaputt.messageId) throw new Error('insert failed');
      return echt(daten);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await (await t.abrufen()).json()).toEqual({ neu: 1 });
    const stand = await t.privatpartys.abrufStand();
    expect(stand.letzteUid).toBe(a.uid);
    expect(stand.fehler).toBe(
      'Eine Mail konnte nicht gespeichert werden. Der Abruf versucht es beim nächsten Mal erneut.',
    );
    // The empty request created for the failing mail is removed again.
    expect(await t.liste()).toHaveLength(1);
    ausfall = false;
    expect(await (await t.abrufen()).json()).toEqual({ neu: 2 });
    expect(await t.liste()).toHaveLength(3);
    const danach = await t.privatpartys.abrufStand();
    expect(danach.letzteUid).toBe(c.uid);
    expect(danach.fehler).toBeNull();
  });

  it('truncates an oversized mail text to the outgoing limit', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail({ text: 'x'.repeat(30000) }));
    await t.abrufen();
    const d = await t.holen((await t.liste())[0]!.id);
    expect(d.nachrichten[0]!.text).toHaveLength(20000);
  });

  it('answers with thread headers, the sender and no notification', async () => {
    const t = await setup();
    const erste = mail({ betreff: 'Re: Anfrage' });
    t.partymail.eingang.push(erste);
    await t.abrufen();
    t.gesendet.length = 0;
    const id = (await t.liste())[0]!.id;
    const res = await t.app.request(
      `/api/privatpartys/${id}/nachrichten`,
      json('admin-token', 'POST', { text: 'Ja, der 14.3. geht.' }),
    );
    expect(res.status).toBe(201);
    expect(t.partymail.gesendet).toMatchObject([
      {
        an: 'eva@kunde.example',
        betreff: 'Re: Anfrage',
        inReplyTo: erste.messageId,
        referenzen: [erste.messageId],
        text: 'Ja, der 14.3. geht.',
      },
    ]);
    expect(t.partymail.abgelegt).toHaveLength(1);
    expect(t.gesendet).toHaveLength(0);
    const d = await t.holen(id);
    expect(d.unbeantwortet).toBe(false);
    expect(d.antwortAn).toBe('eva@kunde.example');
    expect(d.nachrichten[1]).toMatchObject({
      richtung: 'aus',
      gesendetVon: { sub: 'a', username: 'user-a' },
    });
    // A mail answering ours lands in the same entry.
    t.partymail.eingang.push(mail({ inReplyTo: t.partymail.gesendet[0]!.messageId }));
    await t.abrufen();
    expect(await t.liste()).toHaveLength(1);
  });

  it('refuses to answer without Party-Mail or address', async () => {
    const t = await setup();
    const personRes = await t.app.request(
      '/api/privatpartys/personen',
      json('admin-token', 'POST', { name: 'Ohne Mail' }),
    );
    const personId = ((await personRes.json()) as { id: string }).id;
    const neu = await t.app.request(
      '/api/privatpartys',
      json('admin-token', 'POST', {
        personId,
        termine: [{ datum: '2099-03-14', beginn: '19:00', ende: '02:00', stufe: 'bevorzugt' }],
      }),
    );
    const id = ((await neu.json()) as { id: string }).id;
    const antwort = (token = 'admin-token') =>
      t.app.request(`/api/privatpartys/${id}/nachrichten`, json(token, 'POST', { text: 'Hi' }));
    expect((await antwort()).status).toBe(400);
    expect((await antwort('member-token')).status).toBe(403);
    t.partymail.eingerichtet = false;
    const res = await antwort();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'Die Party-Mail ist nicht eingerichtet.' });
    expect((await t.abrufen()).status).toBe(409);
    expect((await t.holen(id)).mailEingerichtet).toBe(false);
    expect((await t.holen(id)).antwortAn).toBeNull();
  });

  it('uses the person address and a default subject for the first mail', async () => {
    const t = await setup();
    const personRes = await t.app.request(
      '/api/privatpartys/personen',
      json('admin-token', 'POST', { name: 'Eva', email: 'eva@x.de' }),
    );
    const personId = ((await personRes.json()) as { id: string }).id;
    const neu = await t.app.request(
      '/api/privatpartys',
      json('admin-token', 'POST', {
        personId,
        termine: [{ datum: '2099-03-14', beginn: '19:00', ende: '02:00', stufe: 'bevorzugt' }],
      }),
    );
    const id = ((await neu.json()) as { id: string }).id;
    await t.app.request(
      `/api/privatpartys/${id}/nachrichten`,
      json('admin-token', 'POST', { text: 'Hallo' }),
    );
    expect(t.partymail.gesendet[0]).toMatchObject({
      an: 'eva@x.de',
      betreff: 'Deine Anfrage beim C4',
      inReplyTo: null,
      referenzen: [],
    });
  });

  it('clamps the time of a mail with a Date header in the future to now', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail({ zeitpunkt: new Date('2099-01-01T00:00:00Z') }));
    const vorher = Date.now();
    await t.abrufen();
    const [eintrag] = await t.liste();
    const nachricht = (await t.holen(eintrag!.id)).nachrichten[0]!;
    expect(Date.parse(nachricht.zeitpunkt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(nachricht.zeitpunkt)).toBeGreaterThanOrEqual(vorher - 1000);
  });

  it('refuses to reply to an invalid reply address', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail({ vonAdresse: 'kein mail@' }));
    await t.abrufen();
    const [eintrag] = await t.liste();
    const res = await t.app.request(
      `/api/privatpartys/${eintrag!.id}/nachrichten`,
      json('admin-token', 'POST', { text: 'Hi' }),
    );
    expect(res.status).toBe(400);
    expect(t.partymail.gesendet).toHaveLength(0);
  });

  it('moves a message to another open request and deletes the emptied entry', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail(), mail({ vonAdresse: 'x@y.de' }));
    await t.abrufen();
    const alle = await t.liste();
    expect(alle).toHaveLength(2);
    const quelle = alle.find((e) => e.mailAdresse === 'x@y.de')!;
    const ziel = alle.find((e) => e.id !== quelle.id)!;
    const nachricht = (await t.holen(quelle.id)).nachrichten[0]!;
    const zuordnen = (nid: string, pid: string) =>
      t.app.request(
        `/api/privatpartys/nachrichten/${nid}/zuordnen`,
        json('admin-token', 'POST', { privatpartyId: pid }),
      );
    expect((await zuordnen(nachricht.id, quelle.id)).status).toBe(400);
    // Not open: refused.
    await t.app.request(
      `/api/privatpartys/${ziel.id}/status`,
      json('admin-token', 'PUT', { status: 'abgesagt' }),
    );
    expect((await zuordnen(nachricht.id, ziel.id)).status).toBe(409);
    await t.app.request(
      `/api/privatpartys/${ziel.id}/status`,
      json('admin-token', 'PUT', { status: 'offen' }),
    );
    const res = await zuordnen(nachricht.id, ziel.id);
    expect(await res.json()).toEqual({ ok: true, geloescht: true, id: ziel.id });
    expect(await t.liste()).toHaveLength(1);
    const d = await t.holen(ziel.id);
    expect(d.nachrichten).toHaveLength(2);
    expect(d.mailAdresse).toBe('x@y.de');
  });

  it('moves a message into a new blank request', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail({ vonAdresse: 'alt@y.de' }));
    await t.abrufen();
    const quelle = (await t.liste())[0]!;
    const nachricht = (await t.holen(quelle.id)).nachrichten[0]!;
    const post = (body: unknown) =>
      t.app.request(
        `/api/privatpartys/nachrichten/${nachricht.id}/zuordnen`,
        json('admin-token', 'POST', body),
      );
    expect((await post({})).status).toBe(400);
    const res = await post({ neu: true });
    const antwort = (await res.json()) as { ok: boolean; geloescht: boolean; id: string };
    expect(antwort).toMatchObject({ ok: true, geloescht: true });
    const alle = await t.liste();
    expect(alle).toHaveLength(1);
    const d = await t.holen(antwort.id);
    expect(antwort.id).not.toBe(quelle.id);
    expect(d.status).toBe('offen');
    expect(d.person).toBeNull();
    expect(d.termine).toHaveLength(0);
    expect(d.mailAdresse).toBe('alt@y.de');
    expect(d.nachrichten).toHaveLength(1);
  });
});

describe('finanzen', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  /** v may read, r may check the chain; admin (a) has all four Finanzen rights. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
    }
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['finanzen:lesen' as const] : sub === 'r' ? ['finanzen:pruefen' as const] : [],
    );
    const roh = (token: string, method: string, pfad: string, body?: unknown) =>
      t.app.request(`/api/finanzen${pfad}`, json(token, method, body));
    // Bookings and reversals need an idempotency key; tests get a fresh one unless they bring their own.
    const anfrage = (token: string, method: string, pfad: string, body?: unknown) =>
      roh(
        token,
        method,
        pfad,
        method === 'POST' &&
          (pfad === '/buchungen' || pfad === '/zaehlungen' || pfad.endsWith('/storno')) &&
          body &&
          typeof body === 'object' &&
          !('idempotenzSchluessel' in body)
          ? { idempotenzSchluessel: crypto.randomUUID(), ...body }
          : body,
      );
    const buchen = (body: Record<string, unknown>, token = 'admin-token') =>
      anfrage(token, 'POST', '/buchungen', body);
    /** Moves `betragCent` from the Bank to the Geldtransit. */
    const umbuchung = (betragCent = 500, extra: Record<string, unknown> = {}) =>
      buchen({
        datum: '2027-01-05',
        text: 'Umbuchung',
        quelleTyp: 'umbuchung',
        zeilen: [
          { kontoId: 'geldtransit', betragCent },
          { kontoId: 'bank', betragCent: -betragCent },
        ],
        ...extra,
      });
    const lesen = async <T>(token: string, pfad: string) =>
      (await (await anfrage(token, 'GET', pfad)).json()) as T;
    /** Creates a Fach (Stückelung account below the Safe) and returns its id. */
    const fach = async (name = 'Wechselgeld') => {
      const res = await anfrage('admin-token', 'POST', '/konten', {
        name,
        art: 'bargeld',
        stueckelung: true,
        parentId: 'safe',
      });
      return ((await res.json()) as { id: string }).id;
    };
    /** Puts a Stückelung into a Fach (opening booking). */
    const befuellen = async (kontoId: string, stueckelung: [number, number][]) => {
      const betragCent = stueckelung.reduce((sum, [n, a]) => sum + n * a, 0);
      return buchen({
        datum: '2027-01-02',
        text: 'Anfangsbestand',
        quelleTyp: 'umbuchung',
        zeilen: [
          { kontoId: 'eroeffnung', betragCent: -betragCent },
          {
            kontoId,
            betragCent,
            stueckelung: stueckelung.map(([nennwertCent, anzahl]) => ({ nennwertCent, anzahl })),
          },
        ],
      });
    };
    return { ...t, anfrage, roh, buchen, umbuchung, lesen, fach, befuellen };
  }

  it('requires the matching right on every route', async () => {
    const t = await setup();
    const routen: [string, string, string][] = [
      ['GET', '/konten', 'finanzen:lesen'],
      ['POST', '/konten', 'finanzen:verwalten'],
      ['PUT', '/konten/safe', 'finanzen:verwalten'],
      ['PUT', '/konten/safe/archiv', 'finanzen:verwalten'],
      ['GET', '/buchungen', 'finanzen:lesen'],
      ['GET', '/buchungen/x', 'finanzen:lesen'],
      ['POST', '/buchungen', 'finanzen:buchen'],
      ['POST', '/buchungen/x/storno', 'finanzen:buchen'],
      ['GET', '/kette', 'finanzen:pruefen'],
    ];
    for (const [method, pfad] of routen) {
      for (const token of ['member-token', 'reader-token']) {
        if (token === 'reader-token' && pfad === '/kette') continue; // r holds finanzen:pruefen
        const res = await t.anfrage(token, method, pfad, method === 'GET' ? undefined : {});
        expect(res.status, `${method} ${pfad} ${token}`).toBe(403);
      }
    }
    // Lesen alone neither books, manages nor checks.
    expect((await t.anfrage('vorstand-token', 'GET', '/konten')).status).toBe(200);
    expect((await t.anfrage('vorstand-token', 'POST', '/buchungen', {})).status).toBe(403);
    expect((await t.anfrage('vorstand-token', 'POST', '/konten', {})).status).toBe(403);
    expect((await t.anfrage('vorstand-token', 'GET', '/kette')).status).toBe(403);
    expect((await t.anfrage('reader-token', 'GET', '/kette')).status).toBe(200);
    expect((await t.anfrage('reader-token', 'GET', '/konten')).status).toBe(403);
  });

  it('lists the base accounts with balance and manages the chart of accounts', async () => {
    const t = await setup();
    type K = {
      id: string;
      name: string;
      saldoCent: number;
      archiviert: boolean;
      parentId: string | null;
    };
    const konten = await t.lesen<K[]>('vorstand-token', '/konten');
    expect(konten.map((k) => k.id).sort()).toEqual([
      'bank',
      'eroeffnung',
      'geldtransit',
      'kassendifferenz',
      'safe',
    ]);
    expect(konten.every((k) => k.saldoCent === 0)).toBe(true);

    const neu = await t.anfrage('admin-token', 'POST', '/konten', {
      name: 'Getränke',
      art: 'erloes',
      steuersatzStandard: 1900,
    });
    expect(neu.status).toBe(201);
    const { id } = (await neu.json()) as { id: string };
    const unter = await t.anfrage('admin-token', 'POST', '/konten', {
      name: 'Bier',
      art: 'erloes',
      parentId: id,
    });
    expect(unter.status).toBe(201);
    const { id: unterId } = (await unter.json()) as { id: string };

    // a partial change leaves the other fields alone
    expect(
      (await t.anfrage('admin-token', 'PUT', `/konten/${id}`, { name: 'Getränke 19' })).status,
    ).toBe(200);
    const nachher = (
      await t.lesen<(K & { steuersatzStandard: number })[]>('vorstand-token', '/konten')
    ).find((k) => k.id === id);
    expect(nachher).toMatchObject({
      name: 'Getränke 19',
      steuersatzStandard: 1900,
      parentId: null,
    });

    // unknown parent, itself, cycle, empty body, unknown id
    expect(
      (
        await t.anfrage('admin-token', 'POST', '/konten', {
          name: 'X',
          art: 'neutral',
          parentId: 'nix',
        })
      ).status,
    ).toBe(400);
    expect((await t.anfrage('admin-token', 'PUT', `/konten/${id}`, { parentId: id })).status).toBe(
      400,
    );
    expect(
      (await t.anfrage('admin-token', 'PUT', `/konten/${id}`, { parentId: unterId })).status,
    ).toBe(400);
    expect((await t.anfrage('admin-token', 'PUT', `/konten/${id}`, {})).status).toBe(400);
    expect((await t.anfrage('admin-token', 'PUT', '/konten/nix', { name: 'X' })).status).toBe(404);
    expect(
      (await t.anfrage('admin-token', 'PUT', '/konten/nix/archiv', { archiviert: true })).status,
    ).toBe(404);
    expect(
      (await t.anfrage('admin-token', 'POST', '/konten', { name: 'X', art: 'buch' })).status,
    ).toBe(400);

    // archive and reactivate
    expect(
      (await t.anfrage('admin-token', 'PUT', `/konten/${unterId}/archiv`, { archiviert: true }))
        .status,
    ).toBe(200);
    expect((await t.lesen<K[]>('vorstand-token', '/konten')).some((k) => k.id === unterId)).toBe(
      false,
    );
    const alle = await t.lesen<K[]>('vorstand-token', '/konten?archiviert=1');
    expect(alle.find((k) => k.id === unterId)?.archiviert).toBe(true);
  });

  it('refuses to change art, Stückelung and parent once an account has lines', async () => {
    const t = await setup();
    expect((await t.umbuchung()).status).toBe(201);
    const aendern = (body: unknown) => t.anfrage('admin-token', 'PUT', '/konten/bank', body);
    expect((await aendern({ art: 'neutral' })).status).toBe(409);
    expect((await aendern({ stueckelung: true })).status).toBe(409);
    expect((await aendern({ parentId: 'safe' })).status).toBe(409);
    // unchanged values and name/tax rate stay possible
    expect((await aendern({ art: 'bank', name: 'Bank neu', steuersatzStandard: 700 })).status).toBe(
      200,
    );
  });

  it('books, shows the entry in the journal and moves the balances', async () => {
    const t = await setup();
    const res = await t.umbuchung(500);
    expect(res.status).toBe(201);
    const ergebnis = (await res.json()) as { id: string; seq: number };
    expect(ergebnis.seq).toBe(1);
    expect((await (await t.umbuchung(250)).json()) as { seq: number }).toMatchObject({ seq: 2 });

    const saldo = async (id: string) =>
      (await t.lesen<{ id: string; saldoCent: number }[]>('vorstand-token', '/konten')).find(
        (k) => k.id === id,
      )?.saldoCent;
    expect(await saldo('geldtransit')).toBe(750);
    expect(await saldo('bank')).toBe(-750);

    const seite = await t.lesen<{
      buchungen: {
        id: string;
        seq: number;
        betragCent: number;
        erstelltVon: { username: string; sub: string } | null;
      }[];
      gekappt: boolean;
    }>('vorstand-token', '/buchungen');
    expect(seite.gekappt).toBe(false);
    expect(seite.buchungen.map((b) => b.seq)).toEqual([2, 1]);
    expect(seite.buchungen[1]).toMatchObject({
      id: ergebnis.id,
      betragCent: 500,
      text: 'Umbuchung',
      datum: '2027-01-05',
      quelleTyp: 'umbuchung',
      stornoVon: null,
      storniertDurch: null,
      erstelltVon: { sub: 'a', username: 'user-a', status: 'anwaerter' },
    });

    const detail = await t.lesen<{
      zeilen: { pos: number; kontoName: string; betragCent: number }[];
      hash: string;
      prevHash: string;
    }>('vorstand-token', `/buchungen/${ergebnis.id}`);
    expect(detail.prevHash).toBe('0'.repeat(64));
    expect(detail.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.zeilen.map((z) => [z.pos, z.kontoName, z.betragCent])).toEqual([
      [1, 'Geldtransit', 500],
      [2, 'Bank (Fyrst)', -500],
    ]);
    expect((await t.anfrage('vorstand-token', 'GET', '/buchungen/nix')).status).toBe(404);
  });

  it('filters the journal and returns all matches', async () => {
    const t = await setup();
    await t.umbuchung(100, { datum: '2027-01-01' });
    await t.umbuchung(200, { datum: '2027-02-01' });
    const f = await t.fach();
    await t.buchen({
      datum: '2027-03-01',
      text: 'Eröffnung',
      zeilen: [
        { kontoId: 'eroeffnung', betragCent: -1000 },
        {
          kontoId: f,
          betragCent: 1000,
          stueckelung: [{ nennwertCent: 1000, anzahl: 1 }],
        },
      ],
    });
    const seqs = async (abfrage: string) =>
      (
        await t.lesen<{ buchungen: { seq: number }[] }>('vorstand-token', `/buchungen${abfrage}`)
      ).buchungen.map((b) => b.seq);
    expect(await seqs('')).toEqual([3, 2, 1]);
    expect(await seqs(`?kontoId=${f}`)).toEqual([3]);
    expect(await seqs('?kontoId=bank')).toEqual([2, 1]);
    expect(await seqs('?von=2027-02-01')).toEqual([3, 2]);
    expect(await seqs('?von=2027-01-15&bis=2027-02-15')).toEqual([2]);
    expect(await seqs('?limit=2&vorSeq=2')).toEqual([3, 2, 1]);
    expect((await t.anfrage('vorstand-token', 'GET', '/buchungen?von=kaputt')).status).toBe(400);
  });

  it('shows the direction of money and the running balance per account', async () => {
    const t = await setup();
    await t.umbuchung(100, { datum: '2027-01-01' });
    await t.umbuchung(250, { datum: '2027-02-01' });
    type Eintrag = {
      seq: number;
      abgang: { kontoId: string; kontoName: string; betragCent: number }[];
      zugang: { kontoId: string; kontoName: string; betragCent: number }[];
      konto: { betragCent: number; saldoNachCent: number } | null;
    };
    const alle = await t.lesen<{ buchungen: Eintrag[] }>('vorstand-token', '/buchungen');
    expect(alle.buchungen[0]!.abgang).toEqual([
      { kontoId: 'bank', kontoName: 'Bank (Fyrst)', betragCent: 250 },
    ]);
    expect(alle.buchungen[0]!.zugang).toEqual([
      { kontoId: 'geldtransit', kontoName: 'Geldtransit', betragCent: 250 },
    ]);
    expect(alle.buchungen.map((b) => b.konto)).toEqual([null, null]);
    // Account statement: the balance follows `seq`, not the display order.
    const konto = await t.lesen<{ buchungen: Eintrag[] }>(
      'vorstand-token',
      '/buchungen?kontoId=bank',
    );
    expect(konto.buchungen.map((b) => b.konto)).toEqual([
      { betragCent: -250, saldoNachCent: -350 },
      { betragCent: -100, saldoNachCent: -100 },
    ]);
    const gefiltert = await t.lesen<{ buchungen: Eintrag[] }>(
      'vorstand-token',
      '/buchungen?kontoId=bank&von=2027-02-01',
    );
    expect(gefiltert.buchungen.map((b) => b.konto?.saldoNachCent)).toEqual([-350]);
  });

  it('keeps the running balance right when other bookings are filtered out', async () => {
    const t = await setup();
    await t.umbuchung(100, { datum: '2027-03-01' });
    await t.umbuchung(200, { datum: '2027-01-01' });
    await t.umbuchung(300, { datum: '2027-03-02' });
    const res = await t.lesen<{
      buchungen: { seq: number; konto: { saldoNachCent: number } | null }[];
    }>('vorstand-token', '/buchungen?kontoId=bank&von=2027-03-01');
    expect(res.buchungen.map((b) => [b.seq, b.konto?.saldoNachCent])).toEqual([
      [3, -600],
      [1, -100],
    ]);
  });

  it('filters the journal to Stornos and the bookings they reversed', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(100, { datum: '2027-01-01' })).json()) as {
      id: string;
    };
    await t.umbuchung(200, { datum: '2027-01-02' });
    await t.umbuchung(300, { datum: '2027-02-01' });
    await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-02-02',
      text: 'Falsch',
    });
    const seqs = async (abfrage: string) =>
      (
        await t.lesen<{ buchungen: { seq: number }[] }>('vorstand-token', `/buchungen${abfrage}`)
      ).buchungen.map((b) => b.seq);
    expect(await seqs('')).toEqual([4, 3, 2, 1]);
    expect(await seqs('?storno=1')).toEqual([4, 1]);
    expect(await seqs('?storno=0')).toEqual([4, 3, 2, 1]);
    expect(await seqs('?storno=1&von=2027-02-01')).toEqual([4]);
    expect(await seqs('?storno=1&kontoId=bank&bis=2027-01-31')).toEqual([1]);
    expect((await t.anfrage('vorstand-token', 'GET', '/buchungen?storno=x')).status).toBe(400);
  });

  it('rejects invalid bookings with 400 and German messages', async () => {
    const t = await setup();
    const fehler = async (body: Record<string, unknown>) => {
      const res = await t.buchen(body);
      expect(res.status).toBe(400);
      return res.text();
    };
    const basis = { datum: '2027-01-05', text: 'Test' };
    expect(
      await fehler({
        ...basis,
        zeilen: [
          { kontoId: 'bank', betragCent: -500 },
          { kontoId: 'geldtransit', betragCent: 400 },
        ],
      }),
    ).toContain('geht nicht auf');
    expect(
      await fehler({
        ...basis,
        zeilen: [
          { kontoId: 'bank', betragCent: -500 },
          { kontoId: 'nix', betragCent: 500 },
        ],
      }),
    ).toContain('Das Konto gibt es nicht');
    expect(
      await fehler({
        ...basis,
        zeilen: [
          { kontoId: await t.fach(), betragCent: 500 },
          { kontoId: 'bank', betragCent: -500 },
        ],
      }),
    ).toContain('Stückelung');
    expect(await fehler({ ...basis, zeilen: [{ kontoId: 'bank', betragCent: 0 }] })).toContain(
      'mindestens zwei',
    );
    expect(
      await fehler({
        ...basis,
        zeilen: [
          { kontoId: 'bank', betragCent: -1.5 },
          { kontoId: 'geldtransit', betragCent: 1.5 },
        ],
      }),
    ).toContain('ganze Cent');
    expect(await fehler({ ...basis, quelleTyp: 'storno', zeilen: [] })).toBeTruthy();

    await t.anfrage('admin-token', 'PUT', '/konten/geldtransit/archiv', { archiviert: true });
    expect((await t.umbuchung()).status).toBe(400);
    // nothing was booked
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(0);
  });

  it('stores the denominations of a booking on a Stückelung account', async () => {
    const t = await setup();
    const f = await t.fach();
    const res = await t.buchen({
      datum: '2027-01-05',
      text: 'Anfangsbestand',
      zeilen: [
        { kontoId: 'eroeffnung', betragCent: -2500 },
        {
          kontoId: f,
          betragCent: 2500,
          stueckelung: [
            { nennwertCent: 2000, anzahl: 1 },
            { nennwertCent: 500, anzahl: 1 },
          ],
        },
      ],
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const detail = await t.lesen<{ zeilen: { kontoId: string; stueckelung: unknown[] }[] }>(
      'vorstand-token',
      `/buchungen/${id}`,
    );
    expect(detail.zeilen.find((z) => z.kontoId === f)?.stueckelung).toEqual([
      { nennwertCent: 500, anzahl: 1 },
      { nennwertCent: 2000, anzahl: 1 },
    ]);
  });

  it('books only once per idempotency key', async () => {
    const t = await setup();
    const key = crypto.randomUUID();
    const erste = await t.umbuchung(500, { idempotenzSchluessel: key });
    expect(erste.status).toBe(201);
    const { id, seq } = (await erste.json()) as { id: string; seq: number };
    const zweite = await t.umbuchung(500, { idempotenzSchluessel: key });
    expect(zweite.status).toBe(200);
    expect(await zweite.json()).toEqual({ id, seq, wiederholt: true });
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(1);

    // the same for a reversal
    const stornoKey = crypto.randomUUID();
    const storno = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Falscher Betrag',
      idempotenzSchluessel: stornoKey,
    });
    expect(storno.status).toBe(201);
    const { id: stornoId } = (await storno.json()) as { id: string };
    const nochmal = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Falscher Betrag',
      idempotenzSchluessel: stornoKey,
    });
    expect(nochmal.status).toBe(200);
    expect(((await nochmal.json()) as { id: string }).id).toBe(stornoId);
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(2);
  });

  it('requires a valid idempotency key', async () => {
    const t = await setup();
    const body = {
      datum: '2027-01-05',
      text: 'x',
      zeilen: [
        { kontoId: 'geldtransit', betragCent: 5 },
        { kontoId: 'bank', betragCent: -5 },
      ],
    };
    expect((await t.roh('admin-token', 'POST', '/buchungen', body)).status).toBe(400);
    const kaputt = await t.roh('admin-token', 'POST', '/buchungen', {
      ...body,
      idempotenzSchluessel: 'abc',
    });
    expect(kaputt.status).toBe(400);
    expect(await kaputt.text()).toContain('UUID');
    expect(
      (
        await t.roh('admin-token', 'POST', '/buchungen/x/storno', {
          datum: '2027-01-05',
          text: 'x',
        })
      ).status,
    ).toBe(400);
  });

  it('reverses a booking once and never a reversal', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    const storno = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Doppelt erfasst',
    });
    expect(storno.status).toBe(201);
    const { id: stornoId, seq } = (await storno.json()) as { id: string; seq: number };
    expect(seq).toBe(2);

    const original = await t.lesen<{ storniertDurch: { id: string; seq: number } | null }>(
      'vorstand-token',
      `/buchungen/${id}`,
    );
    expect(original.storniertDurch).toEqual({ id: stornoId, seq: 2 });
    const detail = await t.lesen<{
      text: string;
      quelleTyp: string;
      stornoVon: { id: string; seq: number } | null;
      zeilen: { kontoId: string; betragCent: number }[];
    }>('vorstand-token', `/buchungen/${stornoId}`);
    expect(detail).toMatchObject({
      text: 'Storno von Nr. 1: Doppelt erfasst',
      quelleTyp: 'storno',
      stornoVon: { id, seq: 1 },
    });
    expect(detail.zeilen.map((z) => [z.kontoId, z.betragCent])).toEqual([
      ['geldtransit', -500],
      ['bank', 500],
    ]);
    const konten = await t.lesen<{ id: string; saldoCent: number }[]>('vorstand-token', '/konten');
    expect(konten.find((k) => k.id === 'bank')?.saldoCent).toBe(0);

    // twice, and a Storno of a Storno
    const nochmal = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-07',
      text: 'Nochmal',
    });
    expect(nochmal.status).toBe(409);
    expect(await nochmal.text()).toContain('bereits storniert');
    expect(
      (
        await t.anfrage('admin-token', 'POST', `/buchungen/${stornoId}/storno`, {
          datum: '2027-01-07',
          text: 'Nochmal',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await t.anfrage('admin-token', 'POST', '/buchungen/nix/storno', {
          datum: '2027-01-07',
          text: 'x',
        })
      ).status,
    ).toBe(404);
    expect(
      (await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, { datum: 'x', text: 'x' }))
        .status,
    ).toBe(400);
  });

  it('requires a reason for a Storno', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    for (const text of [undefined, '', '   ']) {
      const res = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
        datum: '2027-01-06',
        ...(text !== undefined && { text }),
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Begründung');
    }
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(1);
  });

  it('uses the reason as Storno text and may reverse into archived accounts', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    await t.anfrage('admin-token', 'PUT', '/konten/geldtransit/archiv', { archiviert: true });
    const res = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Falscher Betrag',
    });
    expect(res.status).toBe(201);
    const { id: stornoId } = (await res.json()) as { id: string };
    expect((await t.lesen<{ text: string }>('vorstand-token', `/buchungen/${stornoId}`)).text).toBe(
      'Storno von Nr. 1: Falscher Betrag',
    );
  });

  it('verifies the chain and detects manipulation', async () => {
    const t = await setup();
    const leer = await t.lesen<{ ok: boolean; anzahl: number; kopfHash: string }>(
      'reader-token',
      '/kette',
    );
    expect(leer).toMatchObject({ ok: true, anzahl: 0, kopfHash: '0'.repeat(64) });

    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    await t.umbuchung(300);
    await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Test',
    });
    const intakt = await t.lesen<{
      ok: boolean;
      anzahl: number;
      zaehlerPasst: boolean;
      fehler: unknown[];
      letzteSeq: number;
    }>('reader-token', '/kette');
    expect(intakt).toMatchObject({
      ok: true,
      anzahl: 3,
      zaehlerPasst: true,
      fehler: [],
      letzteSeq: 3,
    });

    // tamper with an amount in the stored journal
    t.finanzenFake.buchungen[1]!.zeilen = t.finanzenFake.buchungen[1]!.zeilen.map((z) =>
      z.pos === 1 ? { ...z, betragCent: 301 } : z,
    );
    const kaputt = await t.lesen<{ ok: boolean; fehler: { seq: number; art: string }[] }>(
      'reader-token',
      '/kette',
    );
    expect(kaputt.ok).toBe(false);
    expect(kaputt.fehler).toContainEqual({ seq: 2, art: 'hash' });
    expect(kaputt.fehler).toContainEqual({ seq: 2, art: 'summe' });
  });

  it('notices a counter that does not match the last booking', async () => {
    const t = await setup();
    await t.umbuchung(500);
    t.finanzenFake.zaehler.wert = 2;
    const res = await t.lesen<{ ok: boolean; zaehlerPasst: boolean; fehler: unknown[] }>(
      'reader-token',
      '/kette',
    );
    expect(res).toMatchObject({ ok: false, zaehlerPasst: false, fehler: [] });
  });

  it('has no routes to change or delete bookings', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      for (const pfad of ['/buchungen', `/buchungen/${id}`, `/buchungen/${id}/storno`]) {
        const res = await t.anfrage('admin-token', method, pfad, {});
        expect([404, 405], `${method} ${pfad}`).toContain(res.status);
      }
    }
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(1);
  });
  describe('Bargeld', () => {
    type Fehler = { error?: string; message?: string };
    const meldung = async (res: Response) => {
      const b = (await res.json()) as Fehler;
      return b.error ?? b.message ?? '';
    };
    const zaehlen = (
      t: Awaited<ReturnType<typeof setup>>,
      kontoId: string,
      ist: [number, number][],
      extra: Record<string, unknown> = {},
      token = 'admin-token',
    ) =>
      t.anfrage(token, 'POST', '/zaehlungen', {
        kontoId,
        datum: '2027-01-10',
        ist: ist.map(([nennwertCent, anzahl]) => ({ nennwertCent, anzahl })),
        ...extra,
      });
    const umbuchenFach = (
      t: Awaited<ReturnType<typeof setup>>,
      von: string,
      nach: string,
      nennwertCent: number,
      anzahl: number,
      zeilen: 'beide' | 'nur-von' = 'beide',
    ) =>
      t.buchen({
        datum: '2027-01-11',
        text: 'Umbuchung',
        quelleTyp: 'umbuchung',
        zeilen: [
          {
            kontoId: von,
            betragCent: -nennwertCent * anzahl,
            stueckelung: [{ nennwertCent, anzahl: -anzahl }],
          },
          zeilen === 'beide'
            ? {
                kontoId: nach,
                betragCent: nennwertCent * anzahl,
                stueckelung: [{ nennwertCent, anzahl }],
              }
            : { kontoId: nach, betragCent: nennwertCent * anzahl },
        ],
      });
    type Bargeld = {
      faecher: {
        id: string;
        name: string;
        saldoCent: number;
        bestand: { nennwertCent: number; anzahl: number }[];
      }[];
      summeBestand: { nennwertCent: number; anzahl: number }[];
      summeCent: number;
    };
    const anzahl = (b: { nennwertCent: number; anzahl: number }[], n: number) =>
      b.find((x) => x.nennwertCent === n)?.anzahl;

    it('requires the matching right on the Bargeld routes', async () => {
      const t = await setup();
      for (const token of ['member-token', 'reader-token']) {
        for (const [method, pfad] of [
          ['GET', '/bargeld'],
          ['GET', '/zaehlungen'],
          ['GET', '/zaehlungen/x'],
          ['POST', '/zaehlungen'],
        ]) {
          const res = await t.anfrage(token, method!, pfad!, method === 'GET' ? undefined : {});
          expect(res.status, `${method} ${pfad} ${token}`).toBe(403);
        }
      }
      expect((await t.anfrage('vorstand-token', 'GET', '/bargeld')).status).toBe(200);
      expect((await t.anfrage('vorstand-token', 'GET', '/zaehlungen')).status).toBe(200);
      expect((await t.anfrage('vorstand-token', 'POST', '/zaehlungen', {})).status).toBe(403);
    });

    it('rejects bookings on a group account and sub accounts below an account with lines', async () => {
      const t = await setup();
      await t.fach();
      const res = await t.buchen({
        datum: '2027-01-05',
        text: 'Safe',
        zeilen: [
          { kontoId: 'safe', betragCent: 100 },
          { kontoId: 'bank', betragCent: -100 },
        ],
      });
      expect(res.status).toBe(400);
      expect(await meldung(res)).toContain('Unterkonten');

      await t.umbuchung(100);
      const unter = await t.anfrage('admin-token', 'POST', '/konten', {
        name: 'Unter Bank',
        art: 'bank',
        parentId: 'bank',
      });
      expect(unter.status).toBe(409);
      expect(await meldung(unter)).toContain('hat schon Buchungen und kann keine Unterkonten');
    });

    it('refuses a Storno that would book on an account with sub accounts', async () => {
      const t = await setup();
      // a parent that has lines cannot get children, so the rule only bites through the fake's own
      // state: book on a Fach, then give the Fach a child by a direct store call.
      const f = await t.fach();
      const b = (await (await t.befuellen(f, [[100, 5]])).json()) as { id: string };
      t.finanzenFake.konten.set('kind', {
        id: 'kind',
        name: 'Kind',
        art: 'bargeld',
        parentId: f,
        stueckelung: true,
        steuersatzStandard: null,
        archiviert: false,
      });
      const res = await t.anfrage('admin-token', 'POST', `/buchungen/${b.id}/storno`, {
        datum: '2027-01-12',
        text: 'Irrtum',
      });
      expect(res.status).toBe(400);
      expect(await meldung(res)).toContain('Unterkonten');
    });

    it('blocks bookings that would make a balance or a count negative', async () => {
      const t = await setup();
      const f = await t.fach('Wechselgeld');
      const g = await t.fach('Kleingeld');
      await t.befuellen(f, [
        [200, 3],
        [100, 4],
      ]);
      const zuViel = await umbuchenFach(t, f, g, 200, 4);
      expect(zuViel.status).toBe(400);
      expect(await meldung(zuViel)).toContain(
        'Im Fach „Wechselgeld“ sind nur 3 × 2,00 € vorhanden.',
      );
      // saldo check on a Bargeld account without Stückelung
      const kasse = await t.anfrage('admin-token', 'POST', '/konten', {
        name: 'Kasse',
        art: 'bargeld',
      });
      const { id: kasseId } = (await kasse.json()) as { id: string };
      const minus = await t.buchen({
        datum: '2027-01-11',
        text: 'Minus',
        zeilen: [
          { kontoId: kasseId, betragCent: -100 },
          { kontoId: 'bank', betragCent: 100 },
        ],
      });
      expect(minus.status).toBe(400);
      expect(await meldung(minus)).toContain('sind nur 0,00 € vorhanden');
      // within the stock it works
      expect((await umbuchenFach(t, f, g, 200, 3)).status).toBe(201);
      // a reversal of the Anfangsbestand would now take 2 EUR coins that are gone
      const journal = await t.lesen<{ buchungen: { id: string; text: string }[] }>(
        'vorstand-token',
        '/buchungen',
      );
      const anfang = journal.buchungen.find((b) => b.text === 'Anfangsbestand')!;
      const storno = await t.anfrage('admin-token', 'POST', `/buchungen/${anfang.id}/storno`, {
        datum: '2027-01-12',
        text: 'Irrtum',
      });
      expect(storno.status).toBe(400);
      expect(await meldung(storno)).toContain('Im Fach „Wechselgeld“ gibt es keine 2,00 €.');
    });

    it('allows changing money inside one Fach (Wechseln)', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[500, 1]]);
      const res = await t.buchen({
        datum: '2027-01-11',
        text: 'Wechseln',
        quelleTyp: 'umbuchung',
        zeilen: [
          { kontoId: f, betragCent: -500, stueckelung: [{ nennwertCent: 500, anzahl: -1 }] },
          { kontoId: f, betragCent: 500, stueckelung: [{ nennwertCent: 100, anzahl: 5 }] },
        ],
      });
      expect(res.status).toBe(201);
      const b = await t.lesen<Bargeld>('vorstand-token', '/bargeld');
      expect(anzahl(b.faecher[0]!.bestand, 100)).toBe(5);
      expect(anzahl(b.faecher[0]!.bestand, 500)).toBe(0);
    });

    it('shows the stock of the Fächer with totals', async () => {
      const t = await setup();
      const f = await t.fach('Wechselgeld');
      const g = await t.fach('Barkasse');
      await t.befuellen(f, [
        [200, 3],
        [100, 4],
      ]);
      await t.befuellen(g, [[100, 2]]);
      const archiviert = await t.fach('Alt');
      await t.anfrage('admin-token', 'PUT', `/konten/${archiviert}/archiv`, { archiviert: true });
      const b = await t.lesen<Bargeld>('vorstand-token', '/bargeld');
      expect(b.faecher.map((x) => x.name)).toEqual(['Barkasse', 'Wechselgeld']);
      expect(b.faecher.map((x) => x.saldoCent)).toEqual([200, 1000]);
      expect(b.faecher[0]!.bestand).toHaveLength(13);
      expect(anzahl(b.summeBestand, 100)).toBe(6);
      expect(anzahl(b.summeBestand, 200)).toBe(3);
      expect(b.summeCent).toBe(1200);
      // the Safe shows the rolled-up balance
      const konten = await t.lesen<{ id: string; saldoCent: number; saldoGesamtCent: number }[]>(
        'vorstand-token',
        '/konten',
      );
      expect(konten.find((k) => k.id === 'safe')).toMatchObject({
        saldoCent: 0,
        saldoGesamtCent: 1200,
      });
    });

    it('stores a Zählung without difference as protocol and books nothing', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[100, 4]]);
      const res = await zaehlen(t, f, [[100, 4]]);
      expect(res.status).toBe(201);
      const z = (await res.json()) as {
        id: string;
        buchungId: string | null;
        differenzCent: number;
      };
      expect(z).toMatchObject({ buchungId: null, differenzCent: 0 });
      const journal = await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen');
      expect(journal.buchungen).toHaveLength(1);
      const detail = await t.lesen<{
        sollCent: number;
        istCent: number;
        buchung: unknown;
        gezaehltVon: { username: string; status: string } | null;
        posten: { nennwertCent: number; sollAnzahl: number; istAnzahl: number }[];
      }>('vorstand-token', `/zaehlungen/${z.id}`);
      expect(detail).toMatchObject({
        sollCent: 400,
        istCent: 400,
        buchung: null,
        gezaehltVon: { username: 'user-a' },
      });
      expect(detail.posten).toHaveLength(13);
      expect(detail.posten.find((p) => p.nennwertCent === 100)).toMatchObject({
        sollAnzahl: 4,
        istAnzahl: 4,
      });
    });

    it('books the net difference on Kassendifferenz', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [
        [200, 3],
        [100, 4],
      ]);
      const res = await zaehlen(t, f, [
        [200, 3],
        [100, 2],
      ]);
      expect(res.status).toBe(201);
      const z = (await res.json()) as {
        id: string;
        buchungId: string;
        buchungSeq: number;
        differenzCent: number;
      };
      expect(z.differenzCent).toBe(-200);
      expect(z.buchungSeq).toBe(2);
      const buchung = await t.lesen<{
        quelleTyp: string;
        quelleId: string;
        text: string;
        zeilen: { kontoId: string; betragCent: number; stueckelung: unknown[] }[];
      }>('vorstand-token', `/buchungen/${z.buchungId}`);
      expect(buchung).toMatchObject({ quelleTyp: 'zaehlung', quelleId: z.id });
      expect(buchung.text).toContain('Zählung Wechselgeld: Differenz');
      expect(buchung.zeilen.map((x) => [x.kontoId, x.betragCent])).toEqual([
        [f, -200],
        ['kassendifferenz', 200],
      ]);
      const b = await t.lesen<Bargeld>('vorstand-token', '/bargeld');
      expect(anzahl(b.faecher[0]!.bestand, 100)).toBe(2);
      const liste = await t.lesen<{
        zaehlungen: { id: string; kontoName: string; differenzCent: number }[];
      }>('vorstand-token', `/zaehlungen?kontoId=${f}`);
      expect(liste.zaehlungen).toMatchObject([
        { id: z.id, kontoName: 'Wechselgeld', differenzCent: -200 },
      ]);
      expect(
        (await t.lesen<{ zaehlungen: unknown[] }>('vorstand-token', '/zaehlungen?kontoId=nix'))
          .zaehlungen,
      ).toHaveLength(0);
    });

    it('books a surplus and a missing coin of another value as two Fach lines plus Kassendifferenz', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[200, 3]]);
      const res = await zaehlen(t, f, [
        [200, 2],
        [500, 1],
      ]);
      const z = (await res.json()) as { buchungId: string; differenzCent: number };
      expect(z.differenzCent).toBe(-200 + 500);
      const buchung = await t.lesen<{ zeilen: { kontoId: string; betragCent: number }[] }>(
        'vorstand-token',
        `/buchungen/${z.buchungId}`,
      );
      expect(buchung.zeilen.map((x) => [x.kontoId, x.betragCent])).toEqual([
        [f, 500],
        [f, -200],
        ['kassendifferenz', -300],
      ]);
    });

    it('books only the Stückelung when just the mix differs', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[500, 1]]);
      const res = await zaehlen(t, f, [[100, 5]]);
      const z = (await res.json()) as { buchungId: string; differenzCent: number };
      expect(z.differenzCent).toBe(0);
      const buchung = await t.lesen<{ zeilen: { kontoId: string; betragCent: number }[] }>(
        'vorstand-token',
        `/buchungen/${z.buchungId}`,
      );
      expect(buchung.zeilen.map((x) => [x.kontoId, x.betragCent])).toEqual([
        [f, 500],
        [f, -500],
      ]);
    });

    it('counts only once per idempotency key', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[100, 4]]);
      const key = crypto.randomUUID();
      const erste = await zaehlen(t, f, [[100, 3]], { idempotenzSchluessel: key });
      expect(erste.status).toBe(201);
      const e = (await erste.json()) as { id: string; buchungId: string };
      const zweite = await zaehlen(t, f, [[100, 3]], { idempotenzSchluessel: key });
      expect(zweite.status).toBe(200);
      expect(await zweite.json()).toMatchObject({
        id: e.id,
        buchungId: e.buchungId,
        wiederholt: true,
      });
      expect(
        (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
      ).toHaveLength(2);
      expect(
        (await t.lesen<{ zaehlungen: unknown[] }>('vorstand-token', '/zaehlungen')).zaehlungen,
      ).toHaveLength(1);
    });

    it('rejects a Zählung of an unknown, archived or non-Fach account and invalid counts', async () => {
      const t = await setup();
      const f = await t.fach();
      expect((await zaehlen(t, 'nix', [])).status).toBe(400);
      expect((await zaehlen(t, 'bank', [])).status).toBe(400);
      expect((await zaehlen(t, 'safe', [])).status).toBe(400);
      expect((await zaehlen(t, f, [[100, -1]])).status).toBe(400);
      expect((await zaehlen(t, f, [[100, 1.5]])).status).toBe(400);
      expect((await zaehlen(t, f, [[3, 1]])).status).toBe(400);
      expect((await t.anfrage('admin-token', 'GET', '/zaehlungen/nix')).status).toBe(404);
      await t.anfrage('admin-token', 'PUT', `/konten/${f}/archiv`, { archiviert: true });
      expect((await zaehlen(t, f, [])).status).toBe(400);
    });
  });
});
