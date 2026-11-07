import type { TodoDaten, TodosStore } from './todos';
import { offeneSubsVon } from './todos';

/** Map-backed Todos store for tests, with the same rules as the real one. */
export function createFakeTodosStore() {
  const liste = new Map<string, TodoDaten>();
  let naechste = 1;
  const kopie = (t: TodoDaten): TodoDaten => structuredClone(t);
  const store: TodosStore = {
    async meine(sub) {
      return [...liste.values()].filter((t) => t.zustaendige.some((z) => z.sub === sub)).map(kopie);
    },
    async byId(id) {
      const t = liste.get(id);
      return t && kopie(t);
    },
    async byIds(ids) {
      return ids.flatMap((id) => {
        const t = liste.get(id);
        return t ? [kopie(t)] : [];
      });
    },
    async anlegen(daten) {
      const id = `t${naechste++}`;
      const { subs, ...rest } = daten;
      liste.set(id, {
        id,
        ...rest,
        erledigtAm: null,
        erledigtVon: null,
        erstelltAm: new Date(),
        zustaendige: [...new Set(subs)].sort().map((sub) => ({ sub, erledigtAm: null })),
      });
      return id;
    },
    async aendern(id, daten) {
      const t = liste.get(id);
      if (!t) return false;
      if (t.modus !== daten.modus) {
        t.erledigtAm = null;
        t.erledigtVon = null;
        for (const z of t.zustaendige) z.erledigtAm = null;
      }
      Object.assign(t, daten);
      return true;
    },
    async loeschen(id) {
      return liste.delete(id);
    },
    async abhaken(id, sub, erledigt) {
      const t = liste.get(id);
      if (!t) return 'nicht_gefunden';
      const z = t.zustaendige.find((x) => x.sub === sub);
      if (!z) return 'nicht_zustaendig';
      const am = erledigt ? new Date() : null;
      if (t.modus === 'gemeinsam') {
        t.erledigtAm = am;
        t.erledigtVon = erledigt ? sub : null;
      } else {
        z.erledigtAm = am;
      }
      return 'ok';
    },
    async zustaendigeSetzen(id, subs) {
      const t = liste.get(id);
      if (!t) return false;
      const soll = new Set(subs);
      t.zustaendige = [
        ...t.zustaendige.filter((z) => soll.has(z.sub)),
        ...[...soll]
          .filter((s) => !t.zustaendige.some((z) => z.sub === s))
          .map((sub) => ({ sub, erledigtAm: null })),
      ].sort((a, b) => a.sub.localeCompare(b.sub));
      return true;
    },
    async offeneFaelligZwischen(von, bis) {
      return [...liste.values()]
        .filter((t) => t.faelligAm >= von && t.faelligAm <= bis)
        .map((t) => ({ todo: kopie(t), offeneSubs: offeneSubsVon(t) }))
        .filter((o) => o.offeneSubs.length > 0);
    },
  };
  return { store, liste };
}
