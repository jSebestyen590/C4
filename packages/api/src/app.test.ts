import { describe, expect, it, vi } from 'vitest';
import {
  ausleihFehler,
  ausleiheTage,
  bodenNamenFehler,
  gebindeDoppelt,
  kinderArtNach,
  lagerortArtAenderungFehler,
  lagerortArtFehler,
  tagVorher,
  type AdminUser,
  type MitgliedStatus,
  type PostenRecht,
  ifcoPlatzHatIfcosFehler,
  ifcoPlatzHatWareFehler,
} from '@c4/shared';
import { createApp } from './app';
import { createBenachrichtigungen, type PushErgebnis } from './benachrichtigungen';
import { createFakeBenachrichtigungenStore } from './benachrichtigungen.fake';
import { UsernameTakenError, type Konto } from './admin';
import { CodeUngueltig, EmailVergeben, NeuAnmeldungNoetig } from './emailaenderung';
import type { AuthUser } from './auth';
import type { MitgliedRow } from './db/schema';
import type { MitgliedDaten } from './mitglieder';
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
  KalenderUngueltig,
  tokenHash,
  type DienstInfo,
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
    })),
    eventLoeschen: vi.fn<KalenderStore['eventLoeschen']>(async () => true),
    absageSetzen: vi.fn<KalenderStore['absageSetzen']>(async () => ({
      geaendert: true,
      mitgliedSubs: [],
      teilnehmerSubs: [],
    })),
    dienstEintragen: vi.fn<KalenderStore['dienstEintragen']>(async () => 'd-neu'),
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
    eventAboSetzen: vi.fn<KalenderStore['eventAboSetzen']>(async () => true),
    erinnerungsTeilnahmen: vi.fn<KalenderStore['erinnerungsTeilnahmen']>(async () => []),
    erinnerungsDienste: vi.fn<KalenderStore['erinnerungsDienste']>(async () => []),
    erinnerungen: vi.fn<KalenderStore['erinnerungen']>(async () => [10080, 2880, 1440]),
    erinnerungenSetzen: vi.fn<KalenderStore['erinnerungenSetzen']>(async () => undefined),
  } satisfies KalenderStore;
  return { fake, dienste };
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
  };
  const emailAenderung = {
    anfordern: vi.fn<(token: string, email: string) => Promise<void>>(async () => {}),
    bestaetigen: vi.fn<(token: string, code: string) => Promise<void>>(async () => {}),
  };
  const zeilen = new Map<string, MitgliedRow>();
  const mitglieder = {
    holen: vi.fn(async (sub: string) => zeilen.get(sub)),
    alle: vi.fn(async () => [...zeilen.values()]),
    speichern: vi.fn(async (sub: string, daten: MitgliedDaten, statusNeu?: MitgliedStatus) => {
      zeilen.set(sub, {
        sub,
        ...daten,
        status: zeilen.get(sub)?.status ?? statusNeu ?? 'anwaerter',
        aktualisiertAm: new Date(),
      });
    }),
    statusSetzen: vi.fn(async (sub: string, status: MitgliedStatus) => {
      const row = zeilen.get(sub);
      if (!row) return false;
      zeilen.set(sub, { ...row, status });
      return true;
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
    aktuelleNachMitglied: vi.fn(async () => new Map<string, AktuellerPosten[]>()),
    rechteVon: vi.fn(async (sub: string) =>
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
  const { fake: kalender, dienste: kalenderDienste } = makeKalenderFake();
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
    benachrichtigungen,
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
      });
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
        const res = await app.request(url, json('reader-token', method, {}));
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
      expect.objectContaining({ titel: 'Offener Abend', kategorieId: null }),
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

  it('lets members enter themselves and Externe, but others only for Verwalter', async () => {
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

    const fremd = await post('member-token', { dienstformId: 'f1', mitgliedSub: 'r' });
    expect(fremd.status).toBe(403);
    expect(t.kalender.dienstEintragen).toHaveBeenCalledTimes(3);
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

  it('removes Dienste only for the person, the enterer of an Externe, or Verwalter', async () => {
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
    // m2 entered someone else (as Verwalter earlier); that does not give m2 the right to remove it.
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

    expect((await entfernen('member-token', 'fremd')).status).toBe(403);
    expect((await entfernen('member-token', 'von-mir')).status).toBe(403);
    expect((await entfernen('reader-token', 'extern')).status).toBe(403);
    expect((await entfernen('member-token', 'eigen')).status).toBe(200);
    expect((await entfernen('member-token', 'extern')).status).toBe(200);
    expect((await entfernen('vorstand-token', 'extern2')).status).toBe(200);
    expect((await entfernen('vorstand-token', 'fremd')).status).toBe(200);
    expect((await entfernen('vorstand-token', 'fremd')).status).toBe(404);
    expect(t.kalender.dienstEntfernen).toHaveBeenCalledTimes(4);
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
      beschreibung: null,
      kategorie: null,
      beginn: eventBody.beginn,
      ende: eventBody.ende,
      abgesagt: false,
      serie: null,
      bewertung: 'gruen',
      teilnahmeStatus: null,
      teilnahmen: [],
      ichNehmeTeil: null,
      imAbo: false,
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
    const body = (await res.json()) as { schichten: { dienste: { person: unknown }[] }[] };
    expect(body.schichten[0]!.dienste[0]!.person).toMatchObject({ username: 'max' });
    expect(body.schichten[0]!.dienste[1]!.person).toMatchObject({ art: 'extern', name: 'Eva' });

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
          json('vorstand-token', 'POST', { name: 'Konzert', farbe: 'red' }),
        )
      ).status,
    ).toBe(201);
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
        beschreibung: null,
        kategorie: null,
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
        imAbo: false,
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
      beschreibung: null,
      kategorie: null,
      beginn,
      ende: '2026-10-23T22:00:00.000Z',
      abgesagt: false,
      serie: null,
      bewertung: 'gruen' as const,
      schichten: [],
      teilnahmeStatus: null,
      teilnahmen: [],
      ichNehmeTeil: null,
      imAbo: false,
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
      ]);
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
          titel: 'Dienst entfernt',
          text: expect.stringContaining(
            'Du wurdest aus der Schicht „Betrieb 19:00–23:00“ bei „Offener Abend“',
          ),
          url: '/app/kalender/events/e1',
        },
      ]);
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
