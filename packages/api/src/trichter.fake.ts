import type { DurchgangDaten, TrichterDaten, TrichterStore } from './trichter';

/** Map-backed Trichter store for tests. */
export function createFakeTrichterStore() {
  const trichter = new Map<string, TrichterDaten>();
  const durchgaenge = new Map<string, DurchgangDaten>();
  let naechste = 1;
  /** Newest first; positive when `a` comes after `b`. */
  const vergleich = (a: DurchgangDaten, b: DurchgangDaten) =>
    b.zeitpunkt.getTime() - a.zeitpunkt.getTime() || b.id.localeCompare(a.id);
  const store: TrichterStore = {
    async alle(mitArchiv) {
      return [...trichter.values()]
        .filter((t) => mitArchiv || !t.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async holen(id) {
      return trichter.get(id);
    },
    async anlegen(daten) {
      const id = `t${naechste++}`;
      trichter.set(id, { id, ...daten, archiviert: false, erstelltAm: new Date() });
      return id;
    },
    async aktualisieren(id, daten) {
      const t = trichter.get(id);
      if (!t) return false;
      Object.assign(t, daten);
      return true;
    },
    async durchgaenge(limit, nach) {
      return [...durchgaenge.values()]
        .sort(vergleich)
        .filter((d) => !nach || vergleich(d, { ...d, ...nach }) > 0)
        .slice(0, limit)
        .map((d) => structuredClone(d));
    },
    async fuerRangliste() {
      return [...durchgaenge.values()].map((d) => ({
        zeitpunkt: d.zeitpunkt,
        volumenMl: d.volumenMl,
        teilnehmende: d.teilnehmende,
      }));
    },
    async durchgang(id) {
      const d = durchgaenge.get(id);
      return d && structuredClone(d);
    },
    async durchgangAnlegen(daten) {
      const id = `d${naechste++}`;
      durchgaenge.set(id, {
        id,
        trichterId: daten.trichterId,
        trichterName: trichter.get(daten.trichterId)?.name ?? '',
        volumenMl: daten.volumenMl,
        zeitpunkt: daten.zeitpunkt,
        eingetragenVon: daten.eingetragenVon,
        eingetragenAm: new Date(),
        teilnehmende: [...daten.teilnehmende],
      });
      return id;
    },
    async durchgangLoeschen(id) {
      return durchgaenge.delete(id);
    },
  };
  return { store, trichter, durchgaenge };
}
