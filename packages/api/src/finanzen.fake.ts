import { randomUUID } from 'node:crypto';
import {
  anzahlenAus,
  berechneZaehlung,
  GENESIS_HASH,
  kassenabrechnungBuchungstext,
  kasseKontenFehler,
  stueckelungSumme,
  type KassenabrechnungDetailEintrag,
  type KassenabrechnungListeEintrag,
  type KassenKonto,
  type KassenzaehlungEintrag,
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
  baueEventKassen,
  baueKasseDto,
  eventTitelAnzeige,
  kasseNutzbarFehler,
  letzteAbrechnung,
  neuesteJeEvent,
  planeKassenabrechnung,
  type AbrechnungKurz,
} from './finanzenKassen';
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

/** Master data of a Kasse in the fake (like `fin_kassen` and `fin_kassen_grundbestand`). */
interface FakeKasse {
  erloesId: string;
  zielId: string;
  grundbestand: Map<number, number>;
  kategorieIds: Set<string>;
}

/** An event as the fake knows it (the real store reads the `events` table). */
export interface FakeEvent {
  /** Default `kat`. */
  kategorieId?: string;
  titel: string | null;
  kategorie: string;
  /** ISO timestamp. */
  beginn: string;
  abgesagt: boolean;
}

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
  /** Events the Kassen code looks up; tests seed them. */
  const events = new Map<string, FakeEvent>();
  const kassen = new Map<string, FakeKasse>();
  /** Event id -> explicitly set Kassen (absent = the Kategorie default applies). */
  const eventKassenListe = new Map<string, Set<string>>();
  /** Known event Kategorien. */
  const kategorien = new Set<string>(['kat']);
  const kategorienPruefen = (ids: readonly string[]) => {
    if (ids.some((k) => !kategorien.has(k))) throw new KontoUngueltig('Eine Event-Kategorie gibt es nicht.');
  };
  /** Dienst-Zählungen in insertion order (newest last). */
  const kassenzaehlungenListe: (KassenzaehlungEintrag & { schluessel: string })[] = [];
  const abrechnungenListe: (KassenabrechnungDetailEintrag & {
    schluessel: string;
    ereignisse: number;
  })[] = [];

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

  const kassenKonten = (): KassenKonto[] =>
    [...konten.values()].map((k) => ({ ...k, hatUnterkonten: hatUnterkonten(k.id) }));
  const kontoName = (id: string) => konten.get(id)?.name ?? id;
  const storniertIds = () => new Set(buchungen.flatMap((b) => (b.stornoVon ? [b.stornoVon] : [])));
  const abrechnungenKurz = (kontoId: string): AbrechnungKurz[] => {
    const storniert = storniertIds();
    return abrechnungenListe
      .filter((a) => a.kontoId === kontoId)
      .map((a) => ({
        id: a.id,
        datum: a.datum,
        buchung: a.buchung,
        erstelltAm: a.erstelltAm,
        storniert: a.buchung !== null && storniert.has(a.buchung.id),
      }));
  };
  const kasseDto = (kontoId: string) => {
    const kasse = kassen.get(kontoId);
    const konto = konten.get(kontoId);
    const bestand = bestandKonto(kontoId);
    if (!kasse || !konto || !bestand) return undefined;
    const abrechnungen = abrechnungenKurz(kontoId);
    const dto = baueKasseDto({
      konto,
      bestand,
      grundbestand: [...kasse.grundbestand].map(([nennwertCent, anzahl]) => ({
        nennwertCent,
        anzahl,
      })),
      erloesKonto: { id: kasse.erloesId, name: kontoName(kasse.erloesId) },
      zielFach: { id: kasse.zielId, name: kontoName(kasse.zielId) },
      standardKategorieIds: [...kasse.kategorieIds],
      abrechnungen,
      zaehlungen: kassenzaehlungenListe.filter((z) => z.kontoId === kontoId),
    });
    return { dto, seit: letzteAbrechnung(abrechnungen)?.erstelltAm ?? null };
  };
  const kassenKontenPruefen = (erloesId: string, zielId: string, kasseId: string | null) => {
    const k = kassenKonten();
    const fehler = kasseKontenFehler(
      k.find((x) => x.id === erloesId),
      k.find((x) => x.id === zielId),
      kasseId,
    );
    if (fehler.length > 0) throw new KontoUngueltig(fehler.join(' '));
  };
  const grundbestandMap = (g: readonly { nennwertCent: number; anzahl: number }[]) =>
    new Map(
      g.filter((x) => x.anzahl > 0).map((x) => [x.nennwertCent, x.anzahl] as [number, number]),
    );

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
    async kassen(mitArchiv) {
      return [...kassen.keys()]
        .flatMap((id) => kasseDto(id)?.dto ?? [])
        .filter((k) => mitArchiv || !k.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async kasseAnlegen(daten) {
      kassenKontenPruefen(daten.standardErloesKontoId, daten.standardZielFachId, null);
      kategorienPruefen(daten.standardKategorieIds);
      const id = randomUUID();
      konten.set(id, {
        id,
        name: daten.name,
        art: 'bargeld',
        parentId: SAFE_KONTO_ID,
        stueckelung: true,
        steuersatzStandard: null,
        archiviert: false,
      });
      kassen.set(id, {
        erloesId: daten.standardErloesKontoId,
        zielId: daten.standardZielFachId,
        grundbestand: grundbestandMap(daten.grundbestand),
        kategorieIds: new Set(daten.standardKategorieIds),
      });
      return id;
    },
    async kasseAendern(kontoId, daten) {
      const kasse = kassen.get(kontoId);
      if (!kasse) return false;
      kassenKontenPruefen(daten.standardErloesKontoId, daten.standardZielFachId, kontoId);
      kategorienPruefen(daten.standardKategorieIds ?? []);
      if (daten.name !== undefined) konten.get(kontoId)!.name = daten.name;
      kasse.erloesId = daten.standardErloesKontoId;
      kasse.zielId = daten.standardZielFachId;
      kasse.grundbestand = grundbestandMap(daten.grundbestand);
      if (daten.standardKategorieIds !== undefined)
        kasse.kategorieIds = new Set(daten.standardKategorieIds);
      return true;
    },
    async kassenAbrechnungVorschau(kontoId) {
      const k = kasseDto(kontoId);
      if (!k) return undefined;
      const liste = kassenzaehlungenListe
        .filter((z) => z.kontoId === kontoId && (k.seit === null || z.gezaehltAm > k.seit))
        .flatMap((z) => {
          const e = events.get(z.eventId);
          return e ? [{ ...z, e }] : [];
        });
      const zaehlungen = neuesteJeEvent(liste)
        .map((z) => ({
          id: z.id,
          eventId: z.eventId,
          eventTitel: eventTitelAnzeige(z.e.titel, z.e.kategorie),
          eventBeginn: z.e.beginn,
          summeCent: z.summeCent,
          gezaehltVon: z.gezaehltVon,
          gezaehltAm: z.gezaehltAm,
        }))
        .sort(
          (a, b) =>
            a.eventBeginn.localeCompare(b.eventBeginn) || a.eventId.localeCompare(b.eventId),
        );
      return { kasse: k.dto, zaehlungen };
    },
    async kasseAbrechnen(eingabe, sub) {
      const schon = abrechnungenListe.find((a) => a.schluessel === eingabe.idempotenzSchluessel);
      if (schon)
        return {
          id: schon.id,
          buchungId: schon.buchung?.id ?? null,
          buchungSeq: schon.buchung?.seq ?? null,
          einnahmeCent: schon.einnahmeCent,
          fehlerCent: schon.fehlerCent,
          wiederholt: true,
        };
      const stamm = kassen.get(eingabe.kontoId);
      const kasse = konten.get(eingabe.kontoId);
      const nutzbar = kasseNutzbarFehler(stamm, kasse);
      if (nutzbar.length > 0 || !stamm || !kasse) throw new BuchungUngueltig(nutzbar);
      const eventFehler: string[] = [];
      if (eingabe.events.some((e) => !events.has(e.eventId)))
        eventFehler.push('Ein Event der Zuordnung gibt es nicht.');
      for (const e of eingabe.events) {
        if (!e.zaehlungId) continue;
        const z = kassenzaehlungenListe.find((x) => x.id === e.zaehlungId);
        if (!z || z.kontoId !== eingabe.kontoId || z.eventId !== e.eventId)
          eventFehler.push(
            'Eine Dienst-Zählung der Zuordnung passt nicht zur Kasse und zum Event.',
          );
      }
      const plan = planeKassenabrechnung({
        eingabe,
        stamm: {
          kontoId: eingabe.kontoId,
          grundbestand: [...stamm.grundbestand].map(([nennwertCent, anzahl]) => ({
            nennwertCent,
            anzahl,
          })),
        },
        konten: kassenKonten(),
        bestand: alleBestand(),
      });
      const fehler = [...eventFehler, ...plan.fehler];
      if (fehler.length > 0 || !plan.rechnung) throw new BuchungUngueltig(fehler);
      const r = plan.rechnung;
      const id = randomUUID();
      const gebucht =
        r.zeilen.length > 0
          ? await anhaengen({
              datum: eingabe.datum,
              text: kassenabrechnungBuchungstext(kasse.name, r.einnahmeCent),
              quelleTyp: 'kassenabrechnung',
              quelleId: id,
              eventId: null,
              stornoVon: null,
              erstelltVon: sub,
              zeilen: r.zeilen,
            })
          : undefined;
      abrechnungenListe.push({
        id,
        kontoId: kasse.id,
        kontoName: kasse.name,
        datum: eingabe.datum,
        sollCent: r.sollCent,
        istCent: r.istCent,
        einnahmeCent: r.einnahmeCent,
        fehlerCent: r.fehlerCent,
        buchung: gebucht ?? null,
        storniert: false,
        erstelltVon: sub,
        erstelltAm: new Date().toISOString(),
        erloesKonto: { id: eingabe.erloesKontoId, name: kontoName(eingabe.erloesKontoId) },
        zielFach: { id: eingabe.zielFachId, name: kontoName(eingabe.zielFachId) },
        transferCent: r.transferCent,
        posten: r.posten,
        transfers: eingabe.transfers.map((t) => ({ ...t, fachName: kontoName(t.fachId) })),
        events: eingabe.events.map((e) => {
          const ev = events.get(e.eventId)!;
          return {
            eventId: e.eventId,
            eventTitel: eventTitelAnzeige(ev.titel, ev.kategorie),
            eventBeginn: ev.beginn,
            zaehlungId: e.zaehlungId,
            betragCent: e.betragCent,
          };
        }),
        schluessel: eingabe.idempotenzSchluessel,
        ereignisse: eingabe.events.length,
      });
      return {
        id,
        buchungId: gebucht?.id ?? null,
        buchungSeq: gebucht?.seq ?? null,
        einnahmeCent: r.einnahmeCent,
        fehlerCent: r.fehlerCent,
      };
    },
    async kassenabrechnungen({ kontoId, limit }) {
      const storniert = storniertIds();
      return [...abrechnungenListe]
        .reverse()
        .filter((a) => !kontoId || a.kontoId === kontoId)
        .slice(0, limit)
        .map((a) => {
          const detail = structuredClone(a) as Partial<typeof a> & KassenabrechnungDetailEintrag;
          const liste: KassenabrechnungListeEintrag = {
            id: detail.id,
            kontoId: detail.kontoId,
            kontoName: detail.kontoName,
            datum: detail.datum,
            sollCent: detail.sollCent,
            istCent: detail.istCent,
            einnahmeCent: detail.einnahmeCent,
            fehlerCent: detail.fehlerCent,
            buchung: detail.buchung,
            storniert: detail.buchung !== null && storniert.has(detail.buchung.id),
            erstelltVon: detail.erstelltVon,
            erstelltAm: detail.erstelltAm,
          };
          return liste;
        });
    },
    async kassenabrechnung(id) {
      const a = abrechnungenListe.find((x) => x.id === id);
      if (!a) return undefined;
      const detail: Partial<typeof a> & KassenabrechnungDetailEintrag = structuredClone(a);
      delete detail.schluessel;
      delete detail.ereignisse;
      detail.storniert = a.buchung !== null && storniertIds().has(a.buchung.id);
      return detail;
    },
    async kassenKurz() {
      return [...kassen.keys()]
        .flatMap((id) => {
          const k = konten.get(id);
          return k && !k.archiviert ? [{ kontoId: id, name: k.name }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async eventKassen(eventId) {
      const ev = events.get(eventId);
      if (!ev) return undefined;
      const liste = kassenzaehlungenListe.filter((z) => z.eventId === eventId).reverse();
      const gilt = new Set<string>();
      const aktive = [...kassen.keys()].flatMap((id) => {
        const k = kasseDto(id);
        return k && !k.dto.archiviert ? [k] : [];
      });
      const ids = new Set(aktive.map((k) => k.dto.kontoId));
      const explizit = eventKassenListe.get(eventId);
      const zugewiesen = new Set(
        explizit
          ? [...explizit]
          : [...kassen].filter(([, k]) => k.kategorieIds.has(ev.kategorieId ?? 'kat')).map(([id]) => id),
      );
      const storniert = storniertIds();
      const abgerechnet = new Map<string, number>();
      for (const a of abrechnungenListe) {
        const z = a.events.find((x) => x.eventId === eventId);
        if (!z || (a.buchung && storniert.has(a.buchung.id))) continue;
        abgerechnet.set(a.kontoId, z.betragCent);
      }
      const dto = baueEventKassen({
        eventId,
        kassen: aktive.map((k) => ({
          kontoId: k.dto.kontoId,
          name: k.dto.name,
          saldoCent: k.dto.saldoCent,
          seit: k.seit,
        })),
        zugewiesen,
        zaehlungen: kassenzaehlungenListe
          .filter((z) => ids.has(z.kontoId))
          .flatMap((z) => {
            const e = events.get(z.eventId);
            return e
              ? [{ id: z.id, kontoId: z.kontoId, eventId: z.eventId, summeCent: z.summeCent, gezaehltAm: z.gezaehltAm, eventBeginn: e.beginn }]
              : [];
          }),
        abgerechnet,
      });
      return {
        angepasst: explizit !== undefined,
        ...dto,
        zaehlungen: liste
          .filter((z) => ids.has(z.kontoId))
          .map((z) => {
            const ersetzt = gilt.has(z.kontoId);
            gilt.add(z.kontoId);
            const kopie: Partial<typeof z> & KassenzaehlungEintrag = structuredClone(z);
            delete kopie.schluessel;
            return { ...kopie, ersetzt };
          }),
      };
    },
    async eventKassenFestlegen(eventId, kontoIds) {
      if (!events.has(eventId)) return false;
      const ids = [...new Set(kontoIds ?? [])];
      if (ids.some((id) => !kassen.has(id) || konten.get(id)?.archiviert))
        throw new BuchungUngueltig(['Eine Kasse gibt es nicht oder sie ist archiviert.']);
      if (kontoIds === null) eventKassenListe.delete(eventId);
      else eventKassenListe.set(eventId, new Set(ids));
      return true;
    },
    async kasseZaehlen(eingabe, sub) {
      const schon = kassenzaehlungenListe.find(
        (z) => z.schluessel === eingabe.idempotenzSchluessel,
      );
      if (schon) return { id: schon.id, summeCent: schon.summeCent, wiederholt: true };
      const kasse = konten.get(eingabe.kontoId);
      const fehler = kasseNutzbarFehler(kassen.get(eingabe.kontoId), kasse);
      const event = events.get(eingabe.eventId);
      if (!event) fehler.push('Das Event gibt es nicht.');
      else if (event.abgesagt) fehler.push('Das Event ist abgesagt.');
      if (fehler.length > 0 || !kasse) throw new BuchungUngueltig(fehler);
      const id = randomUUID();
      const summeCent = stueckelungSumme(eingabe.ist);
      kassenzaehlungenListe.push({
        id,
        kontoId: kasse.id,
        kontoName: kasse.name,
        eventId: eingabe.eventId,
        summeCent,
        posten: stueckelungVollstaendig(anzahlenAus(eingabe.ist)),
        gezaehltVon: sub,
        gezaehltAm: new Date().toISOString(),
        ersetzt: false,
        schluessel: eingabe.idempotenzSchluessel,
      });
      return { id, summeCent };
    },
    async kettenDaten() {
      return {
        buchungen: structuredClone(buchungen),
        zaehlerWert: zaehler.wert,
        zaehlerHash: zaehler.letzterHash,
      };
    },
  };
  return { store, konten, buchungen, zaehler, events, kassen, kategorien };
}
