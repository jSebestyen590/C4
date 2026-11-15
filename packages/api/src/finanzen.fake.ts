import { randomUUID } from 'node:crypto';
import {
  berechneZaehlung,
  GENESIS_HASH,
  pruefeBestand,
  pruefeBuchung,
  pruefeGruppenregel,
  saldoGesamt,
  SAFE_KONTO_ID,
  stornoZeilen,
  stueckelungVollstaendig,
  zaehlungBuchungstext,
  type BestandKonto,
  type PruefKonto,
  type ZaehlungDetailEintrag,
  type ZaehlungListeEintrag,
  type BuchungDetailEintrag,
  type BuchungListeEintrag,
  type JournalEintrag,
  type BuchungRichtungDto,
  type KettenBuchung,
  type KontoDto,
} from '@c4/shared';
import {
  bargeldUebersicht,
  BuchungUngueltig,
  buchungErzeugen,
  entwurfZeilen,
  KontoKonflikt,
  KontoUngueltig,
  ohnePos,
  StornoKonflikt,
  stornoText,
  zaehlungKontoFehler,
  type FinanzenStore,
} from './finanzen';

/** Map-backed Finanzen store for tests; seeded like migrations 0148 and 0149. */
export function createFakeFinanzenStore() {
  const konten = new Map<string, Omit<KontoDto, 'saldoCent' | 'saldoGesamtCent'>>();
  for (const k of [
    { id: 'safe', name: 'Safe', art: 'bargeld', stueckelung: false },
    { id: 'bank', name: 'Bank (Fyrst)', art: 'bank', stueckelung: false },
    { id: 'geldtransit', name: 'Geldtransit', art: 'durchlauf', stueckelung: false },
    { id: 'eroeffnung', name: 'Eröffnung / Saldovortrag', art: 'neutral', stueckelung: false },
    { id: 'kassendifferenz', name: 'Kassendifferenz', art: 'neutral', stueckelung: false },
  ] as const) {
    konten.set(k.id, { ...k, parentId: null, steuersatzStandard: null, archiviert: false });
  }
  /** Ordered by seq. */
  const buchungen: KettenBuchung[] = [];
  const zaehler = { wert: 0, letzterHash: GENESIS_HASH };
  /** Zählungen in insertion order; the idempotency key is unique like the index. */
  const zaehlungenListe: (ZaehlungDetailEintrag & { schluessel: string })[] = [];
  /** Idempotency key -> booking, like the unique index. */
  const schluessel = new Map<string, { id: string; seq: number }>();

  const saldo = (id: string) =>
    buchungen.reduce(
      (s, b) => s + b.zeilen.filter((z) => z.kontoId === id).reduce((t, z) => t + z.betragCent, 0),
      0,
    );
  const hatZeilen = (id: string) => buchungen.some((b) => b.zeilen.some((z) => z.kontoId === id));
  const hatUnterkonten = (id: string) => [...konten.values()].some((k) => k.parentId === id);
  const pruefKonten = (): PruefKonto[] =>
    [...konten.values()].map((k) => ({ ...k, hatUnterkonten: hatUnterkonten(k.id) }));
  const bestandKonto = (id: string): BestandKonto | undefined => {
    const k = konten.get(id);
    if (!k) return undefined;
    const anzahl = new Map<number, number>();
    for (const b of buchungen)
      for (const z of b.zeilen)
        if (z.kontoId === id)
          for (const s of z.stueckelung)
            anzahl.set(s.nennwertCent, (anzahl.get(s.nennwertCent) ?? 0) + s.anzahl);
    return {
      id,
      name: k.name,
      art: k.art,
      stueckelung: k.stueckelung,
      saldoCent: saldo(id),
      anzahl,
    };
  };
  const alleBestand = () => [...konten.keys()].flatMap((id) => bestandKonto(id) ?? []);
  const bestimmeParent = (id: string | null, parentId: string) => {
    if (id !== null && parentId === id)
      throw new KontoUngueltig('Ein Konto kann nicht sein eigenes Unterkonto sein.');
    if (!konten.has(parentId)) throw new KontoUngueltig('Das übergeordnete Konto gibt es nicht.');
    for (let p: string | null | undefined = parentId; p; p = konten.get(p)?.parentId) {
      if (id !== null && p === id)
        throw new KontoUngueltig('Das übergeordnete Konto liegt selbst unter diesem Konto.');
    }
    const bisher = id === null ? null : (konten.get(id)?.parentId ?? null);
    if (parentId !== bisher && hatZeilen(parentId))
      throw new KontoKonflikt(
        `Das Konto „${konten.get(parentId)!.name}“ hat schon Buchungen und kann keine Unterkonten bekommen.`,
      );
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
      const gesamt = saldoGesamt(
        [...konten.values()].map((k) => ({ ...k, saldoCent: saldo(k.id) })),
      );
      return [...konten.values()]
        .filter((k) => mitArchiv || !k.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((k) => ({ ...k, saldoCent: saldo(k.id), saldoGesamtCent: gesamt.get(k.id) ?? 0 }));
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
      const fehler = [
        ...pruefeBuchung(eingabe, pruefKonten()),
        ...pruefeBestand(eingabe.zeilen, alleBestand()),
      ];
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
      const zeilen = stornoZeilen(structuredClone(original.zeilen));
      const fehler = [
        ...pruefeGruppenregel(zeilen, pruefKonten()),
        ...pruefeBestand(zeilen, alleBestand()),
      ];
      if (fehler.length > 0) throw new BuchungUngueltig(fehler);
      return anhaengen({
        datum: eingabe.datum,
        text: stornoText(original, eingabe.text),
        quelleTyp: 'storno',
        quelleId: original.id,
        eventId: original.eventId,
        stornoVon: original.id,
        erstelltVon: sub,
        idempotenzSchluessel: eingabe.idempotenzSchluessel,
        zeilen: zeilen.map(ohnePos),
      });
    },
    async journal({ von, bis, kontoId, storno, limit }) {
      const seite = [...buchungen]
        .reverse()
        .filter(
          (b) =>
            (!von || b.datum >= von) &&
            (!bis || b.datum <= bis) &&
            (!kontoId || b.zeilen.some((z) => z.kontoId === kontoId)) &&
            (!storno || b.stornoVon !== null || buchungen.some((s) => s.stornoVon === b.id)),
        )
        .slice(0, limit);
      const kontoSumme = (b: KettenBuchung) =>
        b.zeilen.filter((z) => z.kontoId === kontoId).reduce((t, z) => t + z.betragCent, 0);
      return seite.map((b): JournalEintrag => {
        const richtung = (vorzeichen: 1 | -1): BuchungRichtungDto[] => {
          const proKonto = new Map<string, BuchungRichtungDto>();
          for (const z of b.zeilen) {
            if (Math.sign(z.betragCent) !== vorzeichen) continue;
            const alt = proKonto.get(z.kontoId);
            proKonto.set(z.kontoId, {
              kontoId: z.kontoId,
              kontoName: konten.get(z.kontoId)?.name ?? z.kontoId,
              betragCent: (alt?.betragCent ?? 0) + Math.abs(z.betragCent),
            });
          }
          return [...proKonto.values()];
        };
        let konto: JournalEintrag['konto'] = null;
        if (kontoId) {
          const saldoNach = buchungen
            .filter((x) => x.seq <= b.seq)
            .reduce((summe, x) => summe + kontoSumme(x), 0);
          konto = { betragCent: kontoSumme(b), saldoNachCent: saldoNach };
        }
        return { ...eintrag(b), abgang: richtung(-1), zugang: richtung(1), konto };
      });
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
    async bargeld() {
      const faecher = [...konten.values()]
        .filter((k) => k.parentId === SAFE_KONTO_ID && k.stueckelung && !k.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((k) => bestandKonto(k.id) ?? []);
      return bargeldUebersicht(faecher);
    },
    async zaehlen(eingabe, sub) {
      const schon = zaehlungenListe.find((z) => z.schluessel === eingabe.idempotenzSchluessel);
      if (schon)
        return {
          id: schon.id,
          buchungId: schon.buchung?.id ?? null,
          buchungSeq: schon.buchung?.seq ?? null,
          differenzCent: schon.differenzCent,
          wiederholt: true,
        };
      const fach = pruefKonten().find((k) => k.id === eingabe.kontoId);
      const fehler = zaehlungKontoFehler(fach);
      const fachBestand = bestandKonto(eingabe.kontoId);
      if (fehler.length > 0 || !fach || !fachBestand) throw new BuchungUngueltig(fehler);
      const ergebnis = berechneZaehlung(
        fach.id,
        stueckelungVollstaendig(fachBestand.anzahl),
        eingabe.ist,
      );
      const id = randomUUID();
      let gebucht: { id: string; seq: number } | undefined;
      if (ergebnis.zeilen.length > 0) {
        const zeilen = ergebnis.zeilen.map((z) => ({
          kontoId: z.kontoId,
          betragCent: z.betragCent,
          nettoCent: null,
          steuerCent: null,
          steuersatz: null,
          steuerArt: 'keine' as const,
          stueckelung: z.stueckelung,
        }));
        const buchungFehler = pruefeBuchung({ zeilen }, pruefKonten());
        if (buchungFehler.length > 0) throw new BuchungUngueltig(buchungFehler);
        gebucht = await anhaengen({
          datum: eingabe.datum,
          text: eingabe.text ?? zaehlungBuchungstext(fach.name, ergebnis.differenzCent),
          quelleTyp: 'zaehlung',
          quelleId: id,
          eventId: null,
          stornoVon: null,
          erstelltVon: sub,
          zeilen,
        });
      }
      zaehlungenListe.push({
        id,
        kontoId: fach.id,
        kontoName: fach.name,
        datum: eingabe.datum,
        gezaehltVon: sub,
        gezaehltAm: new Date().toISOString(),
        sollCent: ergebnis.sollCent,
        istCent: ergebnis.istCent,
        differenzCent: ergebnis.differenzCent,
        buchung: gebucht ?? null,
        text: eingabe.text,
        posten: ergebnis.posten,
        schluessel: eingabe.idempotenzSchluessel,
      });
      return {
        id,
        buchungId: gebucht?.id ?? null,
        buchungSeq: gebucht?.seq ?? null,
        differenzCent: ergebnis.differenzCent,
      };
    },
    async zaehlungen({ kontoId, limit }) {
      return [...zaehlungenListe]
        .reverse()
        .filter((z) => !kontoId || z.kontoId === kontoId)
        .slice(0, limit)
        .map((z): ZaehlungListeEintrag => ({
          id: z.id,
          kontoId: z.kontoId,
          kontoName: z.kontoName,
          datum: z.datum,
          gezaehltVon: z.gezaehltVon,
          gezaehltAm: z.gezaehltAm,
          sollCent: z.sollCent,
          istCent: z.istCent,
          differenzCent: z.differenzCent,
          buchung: z.buchung,
        }));
    },
    async zaehlung(id) {
      const z = zaehlungenListe.find((x) => x.id === id);
      if (!z) return undefined;
      const detail: ZaehlungDetailEintrag = structuredClone({ ...z, schluessel: undefined });
      delete (detail as Partial<typeof z>).schluessel;
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
