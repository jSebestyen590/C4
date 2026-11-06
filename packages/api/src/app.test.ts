import { describe, expect, it, vi } from 'vitest';
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
  type TrichterUebersichtDto,
  type UmfrageDetailDto,
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
import { LetzterStatusEintrag, StatusDatumDoppelt, type MitgliedDaten } from './mitglieder';
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
import { createFakeProtokolleStore } from './protokolle.fake';
import { createFakeTrichterStore } from './trichter.fake';
import { createFakeUmfragenStore } from './umfragen.fake';

/** Map-backed fake of the key store with the same conflict and history rules as the real one. */
function makeSchluesselFake() {
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
  const mitglieder = {
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
  };
  const { fake: waren, orte, verwendet } = makeWarenFake();
  const { fake: inventar, verwendet: inventarVerwendet } = makeInventarFake();
  const { fake: kalender, dienste: kalenderDienste, bilder: kalenderBilder } = makeKalenderFake();
  const onedrive = createFakeOneDrive();
  const freigaben = createMemoryFreigabenStore();
  const ordnerCache = createMemoryOrdnerCacheStore();
  const { fake: schluessel } = makeSchluesselFake();
  const { store: umfragen, liste: umfragenListe } = createFakeUmfragenStore();
  const { store: trichter } = createFakeTrichterStore();
  const { store: protokolle, liste: protokollListe } = createFakeProtokolleStore();
  const profilbilder = {
    uploadVorbereiten: vi.fn(async (sub: string) => ({
      uploadUrl: 'https://s3.example/upload',
      kleinUploadUrl: 'https://s3.example/upload-klein',
      key: `profilbilder/${sub}/neu.png`,
    })),
    anzeigeUrl: vi.fn(async (key: string) => `https://s3.example/${key}`),
    loeschen: vi.fn<(key: string) => Promise<void>>(async () => {}),
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
    umfragen,
    trichter,
    protokolle,
    benachrichtigungen,
    onedrive,
    freigaben,
    ordnerCache,
    ...(appUrl && { appUrl }),
    profilbilder,
    pingDb,
  });
  return {
    app,
    userAdmin,
    emailAenderung,
    mitglieder,
    posten,
    profilbilder,
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
    umfragen,
    umfragenListe,
    protokollListe,
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
        kontaktkanaele: ['mail', 'signal'],
        discordName: ' erika#1 ',
        telefon: '  ',
        ueberMich: 'Hallo',
      });
      expect(ok.status).toBe(200);
      expect(mitglieder.speichern).toHaveBeenCalledWith('r', {
        ...gueltig,
        anrede: 'weiblich',
        kontaktkanaele: 'signal,mail',
        discordName: 'erika#1',
        adresse: null,
        telefon: null,
        ueberMich: 'Hallo',
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: true,
      });
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
      });
      await mitglieder.speichern('m3', {
        ...basis,
        geburtsdatum: '1991-06-18',
        geburtstagImKalender: false,
      });
      await mitglieder.speichern('r', {
        ...basis,
        geburtsdatum: '1992-07-19',
        geburtstagImKalender: false,
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
        'umfrage.neu',
        'umfrage.erinnerung',
        'umfrage.termin',
        'umfrage.erneut_abstimmen',
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
    await t.eintragen('member-token', {
      teilnehmende: ['r'],
      volumenL: 2,
      zeitpunkt: mitte(jahr - 1),
    });
    await t.eintragen('member-token', {
      teilnehmende: ['r'],
      volumenL: 2,
      zeitpunkt: mitte(jahr - 1),
    });
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
    return { ...t, events, antworten, anlegen, holen, mitEvent };
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

    it('stores the PDF of a closed protocol under Cloud4/Sitzungen/Protokolle/<Jahr>', async () => {
      const t = await geschlossen();
      expect((await t.zu()).status).toBe(200);
      const res = await t.pdf('admin-token', {
        dateiname: '2026-11-04_Sitzung: A/B.pdf',
        base64: PDF,
      });
      expect(res.status).toBe(200);
      const pfad = 'Cloud4/Sitzungen/Protokolle/2026/2026-11-04_Sitzung AB.pdf';
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
