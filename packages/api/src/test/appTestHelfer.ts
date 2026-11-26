import { vi } from 'vitest';
import { Readable } from 'node:stream';
import type { DatenexportAuftrag } from '@c4/shared';
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
  statusVerlaufSortieren,
  type StatusEintrag,
  type StatusEintragEingabe,
  tagVorher,
  type AdminUser,
  type MitgliedStatus,
  type PostenRecht,
  halterGleich,
  SCHLUESSEL_VERLAUF_MAX,
  type Halter,
} from '@c4/shared';
import { createApp } from '../app';
import { createBenachrichtigungen, type PushErgebnis } from '../benachrichtigungen';
import { createFakeBenachrichtigungenStore } from '../benachrichtigungen.fake';
import { type Konto } from '../admin';
import { type AuthUser } from '../auth';
import { type MitgliedRow, type GebindeRow, type LagerortRow } from '../db/schema';
import {
  LetzterStatusEintrag,
  StatusDatumDoppelt,
  vcardTokenHash,
  type MitgliedDaten,
} from '../mitglieder';
import {
  GEBINDE_DOPPELT,
  verwendetMeldung,
  WarenKonflikt,
  WarenUngueltig,
  zyklusFehler,
  type GebindeDaten,
  type LagerortDaten,
  type WarenStore,
} from '../waren';
import { type InventarStore } from '../inventar';
import { tokenHash, type DienstInfo, type KalenderStore } from '../kalender';
import {
  AblosungUngueltig,
  BesetzungUeberschneidung,
  ueberschneiden,
  type AktuellerPosten,
  type VorstandBesetzung,
  type BesetzungDaten,
  type PostenDaten,
  type PostenDetails,
} from '../posten';
import { UebergabeKonflikt, type SchluesselDetails, type SchluesselStore } from '../schluessel';
import { createFakeOneDrive } from '../onedrive.fake';
import { createMemoryFreigabenStore, createMemoryOrdnerCacheStore } from '../onedrive';
import { createFakePartyMail } from '../partymail.fake';
import { createFakePrivatpartysStore } from '../privatpartys.fake';
import { createFakeProtokolleStore } from '../protokolle.fake';
import { createFakeSchluesselAnfragenStore } from '../schluesselAnfragen.fake';
import { createFakeTodosStore } from '../todos.fake';
import { createFakeTrichterStore } from '../trichter.fake';
import { createFakeLagerAbgleichStore } from '../lagerAbgleich.fake';
import { createFakeFinanzenStore } from '../finanzen.fake';
import { createFakeBuchStore } from '../buch.fake';
import { createFakeUmfragenStore } from '../umfragen.fake';

/** Map-backed fake of the key store with the same conflict and history rules as the real one. */
export function makeSchluesselFake(beiUebergabe?: (id: string, an: Halter) => void) {
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

export const users: Record<string, AuthUser> = {
  'admin-token': { sub: 'a', groups: ['admin'] },
  'reader-token': { sub: 'r', groups: [] },
  'vorstand-token': { sub: 'v', groups: [] },
  'member-token': { sub: 'm2', groups: [] },
};

/** Map-backed fake of the lagerorte/gebinde parts; the rest records its calls. */
export function makeWarenFake() {
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
export function makeInventarFake() {
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
export function makeKalenderFake() {
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

export function makeApp(pingDb = async () => {}, appUrl?: string) {
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
        vorstand: daten.vorstand ?? false,
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
    vorstandAm: vi.fn(async (): Promise<VorstandBesetzung[]> => []),
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
  const lagerAbgleichFake = createFakeLagerAbgleichStore();
  const lagerAbgleich = lagerAbgleichFake.store;
  const finanzenFake = createFakeFinanzenStore();
  const finanzen = finanzenFake.store;
  const buchFake = createFakeBuchStore();
  const buch = buchFake.store;
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
    kopieren: vi.fn<
      (vonId: string, nachId: string, schluessel: readonly string[]) => Promise<void>
    >(async () => {}),
    loeschen: vi.fn<(protokollId: string) => Promise<void>>(async () => {}),
  };
  /** Fake archive objects: every `exportSchreiben` adds a version; `pruefsummen` overrides a file's checksum. */
  const archivObjekte = new Map<string, string[]>();
  /** Raw bytes of binary archive objects (ZIPs), by key. */
  const archivBytes = new Map<string, Uint8Array>();
  const archivPruefsummen = new Map<string, string | null>();
  const finanzarchiv = {
    eingerichtet: true,
    uploadVorbereiten: vi.fn(
      async (d: { sha256: string; groesse: number; typ: string; schluessel?: string }) => ({
        uploadUrl: `https://s3.example/finanzarchiv-upload?size=${d.groesse}`,
        schluessel:
          d.schluessel ??
          `belege/${d.sha256}.${d.typ === 'application/pdf' ? 'pdf' : d.typ === 'image/png' ? 'png' : d.typ === 'image/heic' ? 'heic' : 'jpg'}`,
        checksumSha256: Buffer.from(d.sha256, 'hex').toString('base64'),
      }),
    ),
    anzeigeUrl: vi.fn(async (key: string) => `https://s3.example/finanzarchiv/${key}`),
    exportSchreiben: vi.fn<(schluessel: string, inhalt: string | Uint8Array) => Promise<void>>(
      async (schluessel, inhalt) => {
        if (typeof inhalt !== 'string') archivBytes.set(schluessel, inhalt);
        archivObjekte.set(schluessel, [
          ...(archivObjekte.get(schluessel) ?? []),
          typeof inhalt === 'string' ? inhalt : new TextDecoder().decode(inhalt),
        ]);
      },
    ),
    versionenAuflisten: vi.fn(async (prefix: string) =>
      [...archivObjekte.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((schluessel) => ({
          schluessel,
          versionIds: archivObjekte.get(schluessel)!.map((_, i) => String(i)),
        })),
    ),
    lesen: vi.fn(async (schluessel: string, versionId?: string) => {
      const versionen = archivObjekte.get(schluessel) ?? [];
      return versionen[versionId === undefined ? versionen.length - 1 : Number(versionId)] ?? '';
    }),
    lesenStream: vi.fn(async (schluessel: string) => {
      const bytes = archivBytes.get(schluessel);
      if (!bytes) throw new Error(`NoSuchKey: ${schluessel}`);
      return Readable.from([bytes]);
    }),
    streamSchreiben: vi.fn(async (schluessel: string, inhalt: Readable) => {
      const teile: Buffer[] = [];
      for await (const teil of inhalt) teile.push(Buffer.from(teil as Uint8Array));
      const bytes = new Uint8Array(Buffer.concat(teile));
      archivBytes.set(schluessel, bytes);
      archivObjekte.set(schluessel, [
        ...(archivObjekte.get(schluessel) ?? []),
        new TextDecoder().decode(bytes),
      ]);
    }),
    // By default a Beleg file has the checksum its key (`belege/<sha256>.<ext>`) promises.
    dateiPruefsumme: vi.fn(async (schluessel: string): Promise<string | null> => {
      if (archivPruefsummen.has(schluessel)) return archivPruefsummen.get(schluessel)!;
      const sha = /^belege\/([0-9a-f]{64})\./.exec(schluessel)?.[1];
      return sha ? Buffer.from(sha, 'hex').toString('base64') : null;
    }),
  };
  const datenexportStarten = vi.fn<(auftrag: DatenexportAuftrag) => Promise<void>>(async () => {});
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
    lagerAbgleich,
    finanzen,
    buch,
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
    finanzarchiv,
    datenexportStarten,
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
    finanzarchiv,
    archivObjekte,
    archivBytes,
    archivPruefsummen,
    datenexportStarten,
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
    lagerAbgleichFake,
    finanzenFake,
    buchFake,
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

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
