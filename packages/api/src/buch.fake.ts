import { randomUUID } from 'node:crypto';
import type { BuchEintragRow, BuchSeiteRow, BuchTarifRow } from './db/schema';
import {
  abrechnungsEintrag,
  BuchKonflikt,
  EINTRAG_SCHON_STORNIERT,
  SEITE_MITGLIED_VORHANDEN,
  SEITE_NICHT_AKTIV,
  SEITE_NUMMER_VERGEBEN,
  STORNO_NICHT_STORNIERBAR,
  stornoEintrag,
  type BuchAbrechnungErgebnis,
  type BuchSeiteMitSaldo,
  type BuchStore,
} from './buch';

/** Array-backed Buch store for tests. */
export function createFakeBuchStore() {
  const seiten: BuchSeiteRow[] = [];
  const tarife: BuchTarifRow[] = [];
  const eintraege: BuchEintragRow[] = [];
  const abrechnungen = new Map<string, { id: string; eintraege: BuchEintragRow[] }>();

  const saldo = (seiteId: string) =>
    eintraege.filter((e) => e.seiteId === seiteId).reduce((s, e) => s + e.betragCent, 0);
  const mitSaldo = (rows: BuchSeiteRow[]): BuchSeiteMitSaldo[] =>
    rows
      .map((seite) => ({ seite: { ...seite }, saldoCent: saldo(seite.id) }))
      .sort((a, b) => a.seite.nummer - b.seite.nummer);
  const saldi = (ids: string[]) =>
    seiten
      .filter((s) => ids.includes(s.id))
      .map((s) => ({ seiteId: s.id, nummer: s.nummer, saldoCent: saldo(s.id) }));

  const store: BuchStore = {
    async seiten(archiviert) {
      return mitSaldo(seiten.filter((s) => (s.archiviertAm !== null) === archiviert));
    },
    async seite(id) {
      const s = seiten.find((x) => x.id === id);
      return s ? mitSaldo([s])[0] : undefined;
    },
    async seitenVon(sub) {
      return mitSaldo(seiten.filter((s) => s.mitgliedSub === sub && s.archiviertAm === null));
    },
    async seiteAnlegen(daten, sub) {
      const offen = seiten.filter((s) => s.archiviertAm === null);
      if (offen.some((s) => s.nummer === daten.nummer))
        throw new BuchKonflikt(SEITE_NUMMER_VERGEBEN);
      if (daten.mitgliedSub && offen.some((s) => s.mitgliedSub === daten.mitgliedSub))
        throw new BuchKonflikt(SEITE_MITGLIED_VORHANDEN);
      const id = randomUUID();
      seiten.push({
        id,
        nummer: daten.nummer,
        mitgliedSub: daten.mitgliedSub,
        externName: daten.externName,
        angelegtVon: sub,
        angelegtAm: new Date(),
        archiviertAm: null,
      });
      return id;
    },
    async seiteArchivieren(id) {
      const s = seiten.find((x) => x.id === id);
      if (!s) return false;
      s.archiviertAm ??= new Date();
      return true;
    },
    async verlauf(seiteId) {
      const rows = eintraege.filter((e) => e.seiteId === seiteId).reverse();
      const storniert = new Set(rows.flatMap((r) => (r.stornoVon ? [r.stornoVon] : [])));
      return rows.map((row) => ({ row: { ...row }, storniert: storniert.has(row.id) }));
    },
    async tarife() {
      return [...tarife].sort(
        (a, b) =>
          b.gueltigAb.localeCompare(a.gueltigAb) || b.erstelltAm.getTime() - a.erstelltAm.getTime(),
      );
    },
    async tarifAnlegen(daten, sub) {
      const id = randomUUID();
      tarife.push({ id, ...daten, erstelltVon: sub, erstelltAm: new Date() });
      return id;
    },
    async abrechnen(eingabe, sub) {
      const schon = abrechnungen.get(eingabe.idempotenzSchluessel);
      if (schon) {
        const ids = [...new Set(schon.eintraege.map((e) => e.seiteId))];
        return {
          id: schon.id,
          eintraege: schon.eintraege.length,
          saldi: saldi(ids),
          wiederholt: true,
        } satisfies BuchAbrechnungErgebnis;
      }
      const ids = eingabe.zeilen.map((z) => z.seiteId);
      const aktiv = seiten.filter((s) => ids.includes(s.id) && s.archiviertAm === null);
      if (aktiv.length !== new Set(ids).size) throw new BuchKonflikt(SEITE_NICHT_AKTIV);
      const id = randomUUID();
      const jetzt = new Date();
      const neu = eingabe.zeilen.map((z) => abrechnungsEintrag(z, id, sub, jetzt));
      eintraege.push(...neu);
      abrechnungen.set(eingabe.idempotenzSchluessel, { id, eintraege: neu });
      return { id, eintraege: neu.length, saldi: saldi(ids) };
    },
    async stornieren(eintragId, eingabe, sub) {
      const schon = eintraege.find((e) => e.idempotenzSchluessel === eingabe.idempotenzSchluessel);
      if (schon) return { id: schon.id, seiteId: schon.seiteId, wiederholt: true };
      const original = eintraege.find((e) => e.id === eintragId);
      if (!original) return undefined;
      if (original.stornoVon !== null) throw new BuchKonflikt(STORNO_NICHT_STORNIERBAR);
      if (eintraege.some((e) => e.stornoVon === eintragId))
        throw new BuchKonflikt(EINTRAG_SCHON_STORNIERT);
      const neu = stornoEintrag(original, eingabe, sub, new Date());
      eintraege.push(neu);
      return { id: neu.id, seiteId: neu.seiteId };
    },
    async fuerRangliste() {
      return eintraege.flatMap((e) => {
        const s = seiten.find((x) => x.id === e.seiteId);
        return s
          ? [
              {
                mitgliedSub: s.mitgliedSub,
                externName: s.externName,
                seiteId: s.id,
                erstelltAm: e.erstelltAm,
                striche: e.striche,
                strichwertCent: e.strichwertCent,
                barCent: e.barCent,
              },
            ]
          : [];
      });
    },
  };
  return { store, seiten, tarife, eintraege };
}
