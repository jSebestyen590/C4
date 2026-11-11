import { randomUUID } from 'node:crypto';
import {
  GENESIS_HASH,
  pruefeBuchung,
  stornoZeilen,
  type BuchungDetailEintrag,
  type BuchungListeEintrag,
  type KettenBuchung,
  type KontoDto,
} from '@c4/shared';
import {
  BuchungUngueltig,
  buchungErzeugen,
  entwurfZeilen,
  KontoKonflikt,
  KontoUngueltig,
  ohnePos,
  StornoKonflikt,
  stornoText,
  type FinanzenStore,
} from './finanzen';

/** Map-backed Finanzen store for tests; seeded like migrations 0144 and 0145. */
export function createFakeFinanzenStore() {
  const konten = new Map<string, Omit<KontoDto, 'saldoCent'>>();
  for (const k of [
    { id: 'safe', name: 'Safe', art: 'bargeld', stueckelung: true },
    { id: 'bank', name: 'Bank (Fyrst)', art: 'bank', stueckelung: false },
    { id: 'geldtransit', name: 'Geldtransit', art: 'durchlauf', stueckelung: false },
    { id: 'eroeffnung', name: 'Eröffnung / Saldovortrag', art: 'neutral', stueckelung: false },
  ] as const) {
    konten.set(k.id, { ...k, parentId: null, steuersatzStandard: null, archiviert: false });
  }
  /** Ordered by seq. */
  const buchungen: KettenBuchung[] = [];
  const zaehler = { wert: 0, letzterHash: GENESIS_HASH };
  /** Idempotency key -> booking, like the unique index. */
  const schluessel = new Map<string, { id: string; seq: number }>();

  const saldo = (id: string) =>
    buchungen.reduce(
      (s, b) => s + b.zeilen.filter((z) => z.kontoId === id).reduce((t, z) => t + z.betragCent, 0),
      0,
    );
  const hatZeilen = (id: string) => buchungen.some((b) => b.zeilen.some((z) => z.kontoId === id));
  const bestimmeParent = (id: string | null, parentId: string) => {
    if (id !== null && parentId === id)
      throw new KontoUngueltig('Ein Konto kann nicht sein eigenes Unterkonto sein.');
    if (!konten.has(parentId)) throw new KontoUngueltig('Das übergeordnete Konto gibt es nicht.');
    for (let p: string | null | undefined = parentId; p; p = konten.get(p)?.parentId) {
      if (id !== null && p === id)
        throw new KontoUngueltig('Das übergeordnete Konto liegt selbst unter diesem Konto.');
    }
  };

  const eintrag = (b: KettenBuchung): BuchungListeEintrag => {
    const original = b.stornoVon ? buchungen.find((x) => x.id === b.stornoVon) : undefined;
    const durch = buchungen.find((x) => x.stornoVon === b.id);
    return {
      id: b.id,
      seq: b.seq,
      datum: b.datum,
      text: b.text,
      quelleTyp: b.quelleTyp,
      eventId: b.eventId,
      stornoVon: original ? { id: original.id, seq: original.seq } : null,
      storniertDurch: durch ? { id: durch.id, seq: durch.seq } : null,
      betragCent: b.zeilen.filter((z) => z.betragCent > 0).reduce((s, z) => s + z.betragCent, 0),
      erstelltVon: b.erstelltVon,
      erstelltAm: new Date(b.erstelltAm).toISOString(),
    };
  };

  const vorhandene = (key: string) => {
    const b = schluessel.get(key);
    return b ? { ...b, wiederholt: true } : undefined;
  };

  const anhaengen = async (entwurf: Parameters<typeof buchungErzeugen>[0]) => {
    const { buchung } = await buchungErzeugen(
      entwurf,
      zaehler.wert + 1,
      zaehler.letzterHash,
      new Date(),
    );
    buchungen.push(buchung);
    zaehler.wert = buchung.seq;
    zaehler.letzterHash = buchung.hash;
    if (entwurf.idempotenzSchluessel)
      schluessel.set(entwurf.idempotenzSchluessel, { id: buchung.id, seq: buchung.seq });
    return { id: buchung.id, seq: buchung.seq };
  };

  const store: FinanzenStore = {
    async konten(mitArchiv) {
      return [...konten.values()]
        .filter((k) => mitArchiv || !k.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((k) => ({ ...k, saldoCent: saldo(k.id) }));
    },
    async kontoAnlegen(daten) {
      if (daten.parentId) bestimmeParent(null, daten.parentId);
      const id = randomUUID();
      konten.set(id, { id, ...daten, archiviert: false });
      return id;
    },
    async kontoAendern(id, daten) {
      const k = konten.get(id);
      if (!k) return false;
      const strukturAendert =
        (daten.art !== undefined && daten.art !== k.art) ||
        (daten.stueckelung !== undefined && daten.stueckelung !== k.stueckelung) ||
        (daten.parentId !== undefined && daten.parentId !== k.parentId);
      if (strukturAendert && hatZeilen(id)) {
        throw new KontoKonflikt(
          'Art, Stückelung und übergeordnetes Konto lassen sich nicht mehr ändern, sobald auf dem Konto gebucht wurde.',
        );
      }
      if (daten.parentId) bestimmeParent(id, daten.parentId);
      Object.assign(k, daten);
      return true;
    },
    async kontoArchivieren(id, archiviert) {
      const k = konten.get(id);
      if (!k) return false;
      k.archiviert = archiviert;
      return true;
    },
    async buchen(eingabe, sub) {
      const schon = vorhandene(eingabe.idempotenzSchluessel);
      if (schon) return schon;
      const fehler = pruefeBuchung(eingabe, [...konten.values()]);
      if (fehler.length > 0) throw new BuchungUngueltig(fehler);
      return anhaengen({
        datum: eingabe.datum,
        text: eingabe.text,
        quelleTyp: eingabe.quelleTyp,
        quelleId: null,
        eventId: eingabe.eventId,
        stornoVon: null,
        erstelltVon: sub,
        idempotenzSchluessel: eingabe.idempotenzSchluessel,
        zeilen: entwurfZeilen(eingabe),
      });
    },
    async stornieren(id, eingabe, sub) {
      const schon = vorhandene(eingabe.idempotenzSchluessel);
      if (schon) return schon;
      const original = buchungen.find((b) => b.id === id);
      if (!original) return undefined;
      if (original.stornoVon !== null)
        throw new StornoKonflikt('Ein Storno kann nicht storniert werden.');
      if (buchungen.some((b) => b.stornoVon === id))
        throw new StornoKonflikt('Die Buchung ist bereits storniert.');
      return anhaengen({
        datum: eingabe.datum,
        text: stornoText(original, eingabe.text),
        quelleTyp: 'storno',
        quelleId: original.id,
        eventId: original.eventId,
        stornoVon: original.id,
        erstelltVon: sub,
        idempotenzSchluessel: eingabe.idempotenzSchluessel,
        zeilen: stornoZeilen(structuredClone(original.zeilen)).map(ohnePos),
      });
    },
    async journal({ von, bis, kontoId, limit, vorSeq }) {
      return [...buchungen]
        .reverse()
        .filter(
          (b) =>
            (!von || b.datum >= von) &&
            (!bis || b.datum <= bis) &&
            (!kontoId || b.zeilen.some((z) => z.kontoId === kontoId)) &&
            (vorSeq === undefined || b.seq < vorSeq),
        )
        .slice(0, limit)
        .map(eintrag);
    },
    async buchung(id) {
      const b = buchungen.find((x) => x.id === id);
      if (!b) return undefined;
      const detail: BuchungDetailEintrag = {
        ...eintrag(b),
        quelleId: b.quelleId,
        prevHash: b.prevHash,
        hash: b.hash,
        zeilen: [...structuredClone(b.zeilen)]
          .sort((x, y) => x.pos - y.pos)
          .map((z) => ({
            id: `${b.id}-${z.pos}`,
            ...z,
            kontoName: konten.get(z.kontoId)?.name ?? z.kontoId,
            stueckelung: z.stueckelung
              .map((s) => ({ ...s }))
              .sort((x, y) => x.nennwertCent - y.nennwertCent),
          })),
      };
      return detail;
    },
    async kettenDaten() {
      return {
        buchungen: structuredClone(buchungen),
        zaehlerWert: zaehler.wert,
        zaehlerHash: zaehler.letzterHash,
      };
    },
  };
  return { store, konten, buchungen, zaehler };
}
