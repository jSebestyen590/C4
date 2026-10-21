import type { GegenstandEintrag, IfcoEintrag } from './inventarDaten';

/** The Inventar located at one Lagerort: Ifcos standing there and Gegenstände assigned directly. */
export interface LagerInventar {
  ifcos: { id: string; name: string; stueck: number }[];
  gegenstaende: {
    id: string;
    name: string;
    anzahl: number;
    verliehen: number;
    vorgemerkt: number;
  }[];
}

const nachName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de');

/** Inventar per Lagerort id; archived Gegenstände and Ifcos are left out. */
export function inventarJeLagerort(
  gegenstaende: GegenstandEintrag[],
  ifcos: IfcoEintrag[],
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
        verliehen: p.verliehen,
        vorgemerkt: p.vorgemerkt,
      });
    }
  }
  for (const e of karte.values()) {
    e.ifcos.sort(nachName);
    e.gegenstaende.sort(nachName);
  }
  return karte;
}
