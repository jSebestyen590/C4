import { ifcoTypText } from '@c4/shared';
import type {
  GegenstandEintrag,
  IfcoAusleiheEintrag,
  IfcoEintrag,
  IfcoTypEintrag,
} from './inventarDaten';

/** The Inventar located at one Lagerort: IFCOs standing there and Gegenstände assigned directly. */
export interface LagerInventar {
  ifcos: {
    id: string;
    name: string;
    stueck: number;
    typ: string | null;
    /** Open whole-IFCO Ausleihe, or null. */
    ausleihe: IfcoAusleiheEintrag | null;
  }[];
  gegenstaende: {
    id: string;
    name: string;
    /** Amount at this Lagerort. */
    anzahl: number;
    /** Total amount of the Gegenstand (1 = lent / reserved shown without numbers). */
    gesamt: number;
    verliehen: number;
    vorgemerkt: number;
    /** Name of the parent when the Gegenstand is a part, else null. */
    teilVon: string | null;
  }[];
}

const typText = (t: IfcoTypEintrag | undefined) => (t ? ifcoTypText(t) : null);

const nachName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de');

/** Inventar per Lagerort id; archived Gegenstände and IFCOs are left out. */
export function inventarJeLagerort(
  gegenstaende: GegenstandEintrag[],
  ifcos: IfcoEintrag[],
  typen: IfcoTypEintrag[] = [],
): Map<string, LagerInventar> {
  const karte = new Map<string, LagerInventar>();
  const eintrag = (lagerortId: string) => {
    let e = karte.get(lagerortId);
    if (!e) karte.set(lagerortId, (e = { ifcos: [], gegenstaende: [] }));
    return e;
  };
  for (const i of ifcos) {
    if (i.archiviert || i.lagerortId === null) continue;
    eintrag(i.lagerortId).ifcos.push({
      id: i.id,
      name: i.name,
      stueck: i.inhalt.reduce((s, p) => s + p.anzahl, 0),
      typ: typText(typen.find((x) => x.id === i.typId)),
      ausleihe: i.ausleihe,
    });
  }
  for (const g of gegenstaende) {
    if (g.archiviert) continue;
    for (const p of g.plaetze) {
      if (p.lagerortId === null) continue;
      eintrag(p.lagerortId).gegenstaende.push({
        id: g.id,
        name: g.name,
        anzahl: p.anzahl,
        gesamt: g.anzahl,
        verliehen: p.verliehen,
        vorgemerkt: p.vorgemerkt,
        teilVon: g.teilVon ? (gegenstaende.find((x) => x.id === g.teilVon)?.name ?? null) : null,
      });
    }
  }
  for (const e of karte.values()) {
    e.ifcos.sort(nachName);
    e.gegenstaende.sort(nachName);
  }
  return karte;
}
