import { randomUUID } from 'node:crypto';
import {
  artikelVorschlaegeBilden,
  belegBerechnen,
  belegBuchungstext,
  einreichungStatus,
  belegEntwurfDatenSchema,
  belegNummer,
  gebindeBezeichnung,
  pfandGesamtCent,
  warengruppeKategorie,
  PFAND_KONTO_ID,
  offeneAuslagen,
  saldoWarnungen,
  type AuslageBelegEintrag,
  type BelegDetailEintrag,
  type BelegEntwurfDaten,
  type BelegDatei,
  type BelegEntwurfEintrag,
  type BelegKorrektur,
  type BelegListeEintrag,
  type BelegPostenDto,
  type Gebinde,
  type BelegStatus,
  type BestandKonto,
  type KettenBuchung,
  type KontoDto,
  type Zahlweg,
  postenBetrag,
} from '@c4/shared';
import {
  BelegWarnungenOffen,
  belegWarnungenBilden,
  datumBerlin,
  einreichungWarePosten,
  planeBeleg,
  planeErstattung,
  type BelegeStore,
  type EinreichungEintrag,
  type BelegKonto,
} from './finanzenBelege';
import { BuchungUngueltig, type BuchungsEntwurf } from './finanzen';

/** Minimal Waren/Lager state for the Belege fake (Ware items); tests seed it directly. */
export interface FakeLager {
  warengruppen: Map<
    string,
    {
      id: string;
      name: string;
      parentId: string | null;
      archiviert: boolean;
      kategorieId: string | null;
    }
  >;
  waren: Map<
    string,
    {
      id: string;
      name: string;
      warengruppeId: string;
      archiviert: boolean;
      gebindeIds: string[];
      aliase?: string[];
      standardGebindeId?: string | null;
    }
  >;
  gebinde: Map<string, Gebinde & { archiviert: boolean }>;
}

export const createFakeLager = (): FakeLager => ({
  warengruppen: new Map(),
  waren: new Map(),
  gebinde: new Map(),
});

/** What the Belege fake needs from the journal fake. */
export interface BelegeFakeKern {
  konten: Map<string, Omit<KontoDto, 'saldoCent' | 'saldoGesamtCent'>>;
  buchungen: KettenBuchung[];
  pruefKonten(): BelegKonto[];
  alleBestand(): BestandKonto[];
  anhaengen(entwurf: BuchungsEntwurf): Promise<{ id: string; seq: number }>;
  lager: FakeLager;
}

interface FakeBeleg {
  id: string;
  nummer: string;
  rechnungsstellerId: string;
  belegdatum: string;
  modus: 'brutto' | 'netto';
  zahlweg: Zahlweg;
  bezahldatum: string | null;
  mitgliedId: string | null;
  eigenbelegBegruendung: string | null;
  datei: BelegEntwurfDaten['datei'];
  posten: BelegPostenDto[];
  korrekturen: BelegKorrektur[];
  summeCent: number;
  buchungId: string;
  buchungSeq: number;
  schluessel: string;
  eingereichtVon: string | null;
  eingereichtAm: string | null;
  eingereichtBetragCent: number | null;
  erstelltVon: string;
  erstelltAm: string;
}

interface FakeErstattung {
  id: string;
  mitgliedId: string;
  datum: string;
  buchungId: string;
  buchungSeq: number;
  summeCent: number;
  schluessel: string;
  belegIds: string[];
}

/** Map-backed Belege store for tests; mirrors `createBelegeStore`. */
export function createFakeBelegeStore(k: BelegeFakeKern): BelegeStore {
  const steller = new Map<string, { id: string; name: string; archiviert: boolean }>();
  const entwuerfe = new Map<string, BelegEntwurfEintrag>();
  const belege: FakeBeleg[] = [];
  const erstattungen: FakeErstattung[] = [];
  const zaehler = new Map<number, number>();

  const storniert = () => new Set(k.buchungen.flatMap((b) => (b.stornoVon ? [b.stornoVon] : [])));
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const kontext = (daten: BelegEntwurfDaten) => ({
    konten: k.pruefKonten(),
    bestand: k.alleBestand(),
    rechnungssteller: daten.rechnungsstellerId ? steller.get(daten.rechnungsstellerId) : undefined,
    waren: daten.posten.flatMap((p) => {
      const w = p.art === 'ware' && p.wareId ? k.lager.waren.get(p.wareId) : undefined;
      return w
        ? [
            {
              id: w.id,
              name: w.name,
              archiviert: w.archiviert,
              gebinde: w.gebindeIds.map((id) => ({
                id,
                archiviert: k.lager.gebinde.get(id)?.archiviert ?? false,
              })),
            },
          ]
        : [];
    }),
  });
  const warnungen = (daten: BelegEntwurfDaten) => {
    const summe = daten.posten.length > 0 ? belegBerechnen(daten).summe : null;
    const plan = planeBeleg(daten, kontext(daten));
    const salden = new Map<string, number>();
    for (const b of k.buchungen)
      for (const z of b.zeilen) salden.set(z.kontoId, (salden.get(z.kontoId) ?? 0) + z.betragCent);
    const storno = storniert();
    const aktiv = belege.filter((b) => !storno.has(b.buchungId));
    return belegWarnungenBilden({
      daten,
      summeCent: summe,
      heute: datumBerlin(new Date()),
      dateiDoppelt: !!daten.datei && aktiv.some((b) => b.datei?.sha256 === daten.datei!.sha256),
      belegDoppelt:
        !!daten.rechnungsstellerId &&
        aktiv.some(
          (b) =>
            b.rechnungsstellerId === daten.rechnungsstellerId &&
            b.belegdatum === daten.belegdatum &&
            b.summeCent === summe,
        ),
      saldo: plan.buchung
        ? saldoWarnungen(
            plan.buchung.zeilen,
            [...new Set(plan.buchung.zeilen.map((z) => z.kontoId))].flatMap((id) => {
              const c = k.konten.get(id);
              return c ? [{ id, name: c.name, art: c.art, saldoCent: salden.get(id) ?? 0 }] : [];
            }),
          )
        : [],
    });
  };
  const offen = (mitgliedId?: string) => {
    const eintraege: AuslageBelegEintrag[] = belege
      .filter((b) => b.zahlweg === 'auslage' && (!mitgliedId || b.mitgliedId === mitgliedId))
      .map((b) => ({
        id: b.id,
        mitgliedId: b.mitgliedId,
        zahlweg: b.zahlweg,
        summeCent: b.summeCent,
        buchungId: b.buchungId,
        nummer: b.nummer,
        rechnungssteller: steller.get(b.rechnungsstellerId)?.name ?? '',
        belegdatum: b.belegdatum,
      }));
    return offeneAuslagen(eintraege, erstattungen, storniert());
  };

  const store: BelegeStore = {
    async rechnungssteller(mitArchiv) {
      return [...steller.values()]
        .filter((r) => mitArchiv || !r.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => ({
          ...r,
          zuletztAm:
            belege
              .filter((b) => b.rechnungsstellerId === r.id)
              .map((b) => b.erstelltAm)
              .sort()
              .at(-1) ?? null,
        }));
    },
    async rechnungsstellerAnlegen(name) {
      if ([...steller.values()].some((r) => gleich(r.name, name)))
        throw new BuchungUngueltig(['Diesen Rechnungssteller gibt es schon.']);
      const id = randomUUID();
      steller.set(id, { id, name: name.trim(), archiviert: false });
      return id;
    },
    async rechnungsstellerAendern(id, daten) {
      const r = steller.get(id);
      if (!r) return false;
      if (
        daten.name !== undefined &&
        [...steller.values()].some((x) => x.id !== id && gleich(x.name, daten.name!))
      )
        throw new BuchungUngueltig(['Diesen Rechnungssteller gibt es schon.']);
      if (daten.name !== undefined) r.name = daten.name.trim();
      if (daten.archiviert !== undefined) r.archiviert = daten.archiviert;
      return true;
    },
    async belege(abfrage) {
      const passt = (
        s: Pick<BelegListeEintrag, 'rechnungsstellerId' | 'belegdatum' | 'zahlweg' | 'mitgliedId'>,
      ) =>
        (!abfrage.rechnungsstellerId || s.rechnungsstellerId === abfrage.rechnungsstellerId) &&
        (!abfrage.zahlweg || s.zahlweg === abfrage.zahlweg) &&
        (!abfrage.mitgliedId || s.mitgliedId === abfrage.mitgliedId) &&
        (!abfrage.von || (s.belegdatum !== null && s.belegdatum >= abfrage.von)) &&
        (!abfrage.bis || (s.belegdatum !== null && s.belegdatum <= abfrage.bis));
      const liste: BelegListeEintrag[] = [];
      if (!abfrage.status || abfrage.status === 'entwurf') {
        for (const e of [...entwuerfe.values()].sort((a, b) =>
          b.geaendertAm.localeCompare(a.geaendertAm),
        )) {
          if (e.status === 'verworfen') continue;
          const d = e.daten;
          const eintrag: BelegListeEintrag = {
            id: e.id,
            status: 'entwurf',
            nummer: null,
            rechnungsstellerId: d.rechnungsstellerId,
            rechnungssteller: d.rechnungsstellerId
              ? (steller.get(d.rechnungsstellerId)?.name ?? null)
              : null,
            rechnungsstellerName: d.rechnungsstellerName ?? null,
            belegdatum: d.belegdatum,
            summeCent: d.posten.length > 0 ? belegBerechnen(d).summe : null,
            zahlweg: d.zahlweg,
            mitgliedId: d.mitgliedId,
            hatDatei: d.datei !== null,
            erstelltAm: e.erstelltAm,
            entwurfStatus: e.status === 'eingereicht' ? 'eingereicht' : 'entwurf',
            eingereichtVon: e.eingereichtVon,
            eingereichtAm: e.eingereichtAm,
            eingereichtBetragCent: d.eingereichtBetragCent,
          };
          if (passt(eintrag)) liste.push(eintrag);
        }
      }
      if (abfrage.status !== 'entwurf') {
        const storno = storniert();
        const gebucht = [...belege]
          .sort(
            (a, b) => b.belegdatum.localeCompare(a.belegdatum) || b.nummer.localeCompare(a.nummer),
          )
          .flatMap((b): BelegListeEintrag[] => {
            const status: BelegStatus = storno.has(b.buchungId) ? 'storniert' : 'gebucht';
            const eintrag: BelegListeEintrag = {
              id: b.id,
              status,
              nummer: b.nummer,
              rechnungsstellerId: b.rechnungsstellerId,
              rechnungssteller: steller.get(b.rechnungsstellerId)?.name ?? null,
              rechnungsstellerName: null,
              belegdatum: b.belegdatum,
              summeCent: b.summeCent,
              zahlweg: b.zahlweg,
              mitgliedId: b.mitgliedId,
              hatDatei: b.datei !== null,
              erstelltAm: b.erstelltAm,
              entwurfStatus: null,
              eingereichtVon: b.eingereichtVon,
              eingereichtAm: b.eingereichtAm,
              eingereichtBetragCent: b.eingereichtBetragCent,
            };
            return passt(eintrag) && (!abfrage.status || abfrage.status === status)
              ? [eintrag]
              : [];
          });
        liste.push(...gebucht.slice(0, abfrage.limit));
      }
      return liste;
    },
    async beleg(id) {
      const b = belege.find((x) => x.id === id);
      if (!b) return undefined;
      const storno = storniert();
      const e = erstattungen.find((x) => x.belegIds.includes(id) && !storno.has(x.buchungId));
      const rechnung = belegBerechnen({
        modus: b.modus,
        posten: b.posten,
        korrekturen: b.korrekturen,
      });
      return {
        id: b.id,
        nummer: b.nummer,
        rechnungsstellerId: b.rechnungsstellerId,
        rechnungssteller: steller.get(b.rechnungsstellerId)?.name ?? '',
        belegdatum: b.belegdatum,
        modus: b.modus,
        zahlweg: b.zahlweg,
        bezahldatum: b.zahlweg === 'auslage' ? (e?.datum ?? null) : b.bezahldatum,
        mitgliedId: b.mitgliedId,
        eigenbelegBegruendung: b.eigenbelegBegruendung,
        datei: b.datei,
        posten: b.posten,
        korrekturen: b.korrekturen,
        jeSteuersatz: rechnung.jeSteuersatz,
        summeCent: b.summeCent,
        buchung: { id: b.buchungId, seq: b.buchungSeq },
        storniert: storno.has(b.buchungId),
        erstattung: e
          ? { id: e.id, datum: e.datum, buchung: { id: e.buchungId, seq: e.buchungSeq } }
          : null,
        eingereichtVon: b.eingereichtVon,
        eingereichtAm: b.eingereichtAm,
        eingereichtBetragCent: b.eingereichtBetragCent,
        erstelltVon: b.erstelltVon,
        erstelltAm: b.erstelltAm,
      } satisfies BelegDetailEintrag;
    },
    async entwurfAnlegen(daten, sub) {
      const id = randomUUID();
      const jetzt = new Date().toISOString();
      entwuerfe.set(id, {
        id,
        daten,
        status: 'entwurf',
        eingereichtVon: null,
        eingereichtAm: null,
        verworfenGrund: null,
        erstelltVon: sub,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      });
      return id;
    },
    async entwurf(id) {
      const e = entwuerfe.get(id);
      return e && structuredClone(e);
    },
    async entwurfSpeichern(id, daten) {
      const e = entwuerfe.get(id);
      if (!e) return false;
      entwuerfe.set(id, { ...e, daten, geaendertAm: new Date().toISOString() });
      return true;
    },
    async entwurfLoeschen(id) {
      return entwuerfe.delete(id);
    },
    async einreichungAnlegen(eingabe, sub) {
      const l = k.lager;
      const { daten, fehler } = einreichungWarePosten(eingabe, (wid) => {
        const w = l.waren.get(wid);
        return w
          ? {
              archiviert: w.archiviert,
              gebindeIds: w.gebindeIds.filter((g) => !l.gebinde.get(g)?.archiviert),
              kategorieId: warengruppeKategorie([...l.warengruppen.values()], w.warengruppeId),
            }
          : undefined;
      });
      if (fehler.length > 0) throw new BuchungUngueltig(fehler);
      const id = await store.entwurfAnlegen(daten, sub);
      const e = entwuerfe.get(id)!;
      entwuerfe.set(id, {
        ...e,
        status: 'eingereicht',
        eingereichtVon: sub,
        eingereichtAm: e.erstelltAm,
      });
      return id;
    },
    async entwurfVerwerfen(id, grund) {
      const e = entwuerfe.get(id);
      if (!e) return 'fehlt';
      if (e.status !== 'eingereicht') return 'nicht_eingereicht';
      entwuerfe.set(id, { ...e, status: 'verworfen', verworfenGrund: grund });
      return 'ok';
    },
    async einreichungZurueckziehen(id, sub) {
      const e = entwuerfe.get(id);
      if (!e || e.eingereichtVon !== sub) return 'fehlt';
      if (e.status !== 'eingereicht') return 'nicht_eingereicht';
      entwuerfe.delete(id);
      return 'ok';
    },
    async einreichungen(sub) {
      const storno = storniert();
      const eigene: EinreichungEintrag[] = [...entwuerfe.values()]
        .filter((e) => e.eingereichtVon === sub)
        .map((e) => ({
          id: e.id,
          status: einreichungStatus({ entwurfStatus: e.status, beleg: null }),
          belegdatum: e.daten.belegdatum,
          betragCent: e.daten.eingereichtBetragCent,
          rechnungssteller: e.daten.rechnungsstellerId
            ? (steller.get(e.daten.rechnungsstellerId)?.name ?? null)
            : (e.daten.rechnungsstellerName ?? null),
          notiz: e.daten.notiz,
          verworfenGrund: e.verworfenGrund,
          belegNummer: null,
          eingereichtAm: e.eingereichtAm,
          datei: e.daten.datei ?? null,
          posten: e.daten.posten.map((p) => ({
            kategorieId: 'kategorieId' in p ? (p.kategorieId ?? null) : null,
            text: 'text' in p ? p.text : '',
            betragCent: postenBetrag(p),
            steuersatz: p.steuersatz,
            wareId: p.art === 'ware' ? (p.wareId ?? null) : null,
            gebindeId: p.art === 'ware' ? (p.gebindeId ?? null) : null,
            anzahlMilli: p.art === 'ware' ? p.anzahlMilli : null,
          })),
        }));
      for (const b of belege.filter((x) => x.eingereichtVon === sub))
        eigene.push({
          id: b.id,
          status: einreichungStatus({
            entwurfStatus: null,
            beleg: {
              storniert: storno.has(b.buchungId),
              erstattet: erstattungen.some(
                (x) => x.belegIds.includes(b.id) && !storno.has(x.buchungId),
              ),
            },
          }),
          belegdatum: b.belegdatum,
          betragCent: b.eingereichtBetragCent ?? b.summeCent,
          rechnungssteller: steller.get(b.rechnungsstellerId)?.name ?? null,
          notiz: null,
          verworfenGrund: null,
          belegNummer: b.nummer,
          eingereichtAm: b.eingereichtAm,
          datei: (b.datei as BelegDatei | null) ?? null,
          posten: b.posten.map((p) => ({
            kategorieId: p.kategorieId,
            text: p.text,
            betragCent: p.betragCent,
            steuersatz: p.steuersatz,
            wareId: p.wareId ?? null,
            gebindeId: p.gebindeId ?? null,
            anzahlMilli: p.art === 'ware' ? p.anzahlMilli : null,
          })),
        });
      return eigene.sort((a, b) => (b.eingereichtAm ?? '').localeCompare(a.eingereichtAm ?? ''));
    },
    async einreichung(id, sub) {
      return (await store.einreichungen(sub)).find((e) => e.id === id);
    },
    async eingereichteBelege(belegIds) {
      return belege
        .filter((b) => belegIds.includes(b.id) && b.eingereichtVon)
        .map((b) => ({
          eingereichtVon: b.eingereichtVon!,
          summeCent: b.eingereichtBetragCent ?? b.summeCent,
        }));
    },
    async belegWarnungen(id) {
      const e = entwuerfe.get(id);
      return e && warnungen(e.daten);
    },
    async entwurfBuchen(id, eingabe, sub) {
      const schon = belege.find((b) => b.schluessel === eingabe.idempotenzSchluessel);
      if (schon)
        return {
          id: schon.id,
          nummer: schon.nummer,
          buchungId: schon.buchungId,
          buchungSeq: schon.buchungSeq,
          wiederholt: true,
        };
      const e = entwuerfe.get(id);
      if (!e) return undefined;
      if (e.status === 'verworfen')
        throw new BuchungUngueltig(['Die Einreichung wurde verworfen.']);
      const daten = belegEntwurfDatenSchema.parse(e.daten);
      const plan = planeBeleg(daten, kontext(daten));
      if (!plan.buchung) throw new BuchungUngueltig(plan.fehler);
      const offeneWarnungen = warnungen(daten).filter((w) => !eingabe.bestaetigt.includes(w.code));
      if (offeneWarnungen.length > 0) throw new BelegWarnungenOffen(offeneWarnungen);
      const jetzt = new Date();
      const jahr = Number(datumBerlin(jetzt).slice(0, 4));
      const n = (zaehler.get(jahr) ?? 0) + 1;
      const nummer = belegNummer(jahr, n);
      zaehler.set(jahr, n);
      const belegId = randomUUID();
      const gebucht = await k.anhaengen({
        datum: plan.buchung.datum,
        text: belegBuchungstext(nummer, plan.buchung.rechnungssteller),
        quelleTyp: 'beleg',
        quelleId: belegId,
        eventId: null,
        stornoVon: null,
        erstelltVon: sub,
        zeilen: plan.buchung.zeilen,
        belege: daten.datei ? [{ sha256: daten.datei.sha256 }] : [],
      });
      const rechnung = belegBerechnen(daten);
      belege.push({
        id: belegId,
        nummer,
        rechnungsstellerId: daten.rechnungsstellerId!,
        belegdatum: daten.belegdatum!,
        modus: daten.modus,
        zahlweg: daten.zahlweg!,
        bezahldatum: daten.zahlweg === 'auslage' ? null : daten.bezahldatum,
        mitgliedId: daten.zahlweg === 'auslage' ? daten.mitgliedId : null,
        eigenbelegBegruendung: daten.datei ? null : daten.eigenbelegBegruendung,
        datei: daten.datei,
        posten: daten.posten.map((p, i) => {
          const kategorieId = p.art === 'leergut' ? PFAND_KONTO_ID : p.kategorieId!;
          return {
            pos: i + 1,
            art: p.art,
            kategorieId,
            kategorieName: k.konten.get(kategorieId)?.name ?? '',
            wareId: p.art === 'ware' ? p.wareId : null,
            wareName:
              p.art === 'ware' && p.wareId ? (k.lager.waren.get(p.wareId)?.name ?? null) : null,
            gebindeId: p.art === 'ware' ? p.gebindeId : null,
            pfandCent: p.art === 'ware' ? p.pfandCent : null,
            pfandBetragCent:
              p.art === 'ware' && p.pfandCent !== null ? rechnung.pfandBetraege[i]! : null,
            text: plan.buchung!.postenTexte[i]!,
            anzahlMilli: p.anzahlMilli,
            einzelpreisCent: p.einzelpreisCent,
            steuersatz: p.steuersatz,
            betragCent: rechnung.postenBetraege[i]!,
          };
        }),
        korrekturen: daten.korrekturen.filter((c) => c.nettoCent !== 0 || c.steuerCent !== 0),
        summeCent: plan.buchung.summeCent,
        buchungId: gebucht.id,
        buchungSeq: gebucht.seq,
        schluessel: eingabe.idempotenzSchluessel,
        eingereichtVon: e.eingereichtVon,
        eingereichtAm: e.eingereichtAm,
        eingereichtBetragCent: daten.eingereichtBetragCent,
        erstelltVon: sub,
        erstelltAm: new Date().toISOString(),
      });
      entwuerfe.delete(id);
      return { id: belegId, nummer, buchungId: gebucht.id, buchungSeq: gebucht.seq };
    },
    async entwurfKopieren(belegId, sub) {
      const d = await store.beleg(belegId);
      if (!d) return undefined;
      return store.entwurfAnlegen(
        belegEntwurfDatenSchema.parse({
          rechnungsstellerId: d.rechnungsstellerId,
          belegdatum: d.belegdatum,
          modus: d.modus,
          posten: d.posten,
          korrekturen: d.korrekturen,
          zahlweg: d.zahlweg,
          bezahldatum: d.zahlweg === 'auslage' ? null : d.bezahldatum,
          mitgliedId: d.mitgliedId,
          eigenbelegBegruendung: d.eigenbelegBegruendung,
          datei: d.datei,
        }),
        sub,
      );
    },
    async warengruppenKategorien() {
      const gruppen = [...k.lager.warengruppen.values()];
      return gruppen
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => ({ ...g, wirksamKategorieId: warengruppeKategorie(gruppen, g.id) }));
    },
    async warengruppeKategorieSetzen(id, kategorieId) {
      const g = k.lager.warengruppen.get(id);
      if (!g) return false;
      if (kategorieId) {
        const konto = k.konten.get(kategorieId);
        if (!konto) throw new BuchungUngueltig(['Die Kategorie gibt es nicht.']);
        if (konto.art !== 'aufwand')
          throw new BuchungUngueltig([`„${konto.name}“ ist keine Aufwandskategorie.`]);
        if (konto.archiviert)
          throw new BuchungUngueltig([`Die Kategorie „${konto.name}“ ist archiviert.`]);
      }
      g.kategorieId = kategorieId;
      return true;
    },
    async artikelVorschlaege() {
      const storno = storniert();
      const zaehler = new Map<string, { artikel: string; kategorieId: string; anzahl: number }>();
      for (const b of belege) {
        if (storno.has(b.buchungId)) continue;
        for (const p of b.posten) {
          if (p.art !== 'kategorie' || !p.text.trim()) continue;
          const schluessel = `${p.text.trim().toLowerCase()}\u0000${p.kategorieId}`;
          const z = zaehler.get(schluessel) ?? {
            artikel: p.text.trim(),
            kategorieId: p.kategorieId,
            anzahl: 0,
          };
          z.anzahl += 1;
          zaehler.set(schluessel, z);
        }
      }
      return artikelVorschlaegeBilden([...zaehler.values()]);
    },
    async belegWaren() {
      const gruppen = [...k.lager.warengruppen.values()];
      const alle = [...k.lager.gebinde.values()];
      return [...k.lager.waren.values()]
        .filter((w) => !w.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((w) => ({
          id: w.id,
          name: w.name,
          warengruppeId: w.warengruppeId,
          kategorieId: warengruppeKategorie(gruppen, w.warengruppeId),
          aliase: [...(w.aliase ?? [])],
          standardGebindeId: w.standardGebindeId ?? null,
          gebinde: w.gebindeIds.flatMap((gid) => {
            const g = k.lager.gebinde.get(gid);
            return g && !g.archiviert
              ? [
                  {
                    id: g.id,
                    bezeichnung: gebindeBezeichnung(g, alle),
                    pfandGesamtCent: pfandGesamtCent(g, alle),
                  },
                ]
              : [];
          }),
        }));
    },
    async dateiGebucht(sha256) {
      const storno = storniert();
      const b = belege.find((x) => x.datei?.sha256 === sha256 && !storno.has(x.buchungId));
      return b ? { id: b.id, nummer: b.nummer } : null;
    },
    async auslagen() {
      return offen();
    },
    async erstatten(eingabe, sub, mitgliedName) {
      const schon = erstattungen.find((e) => e.schluessel === eingabe.idempotenzSchluessel);
      if (schon)
        return {
          id: schon.id,
          buchungId: schon.buchungId,
          buchungSeq: schon.buchungSeq,
          summeCent: schon.summeCent,
          wiederholt: true,
        };
      const plan = planeErstattung(eingabe, {
        konten: k.pruefKonten(),
        bestand: k.alleBestand(),
        offen: offen(eingabe.mitgliedId).flatMap((m) => m.belege),
        mitgliedName,
      });
      if (plan.fehler.length > 0) throw new BuchungUngueltig(plan.fehler);
      const id = randomUUID();
      const gebucht = await k.anhaengen({
        datum: eingabe.datum,
        text: plan.text,
        quelleTyp: 'erstattung',
        quelleId: id,
        eventId: null,
        stornoVon: null,
        erstelltVon: sub,
        zeilen: plan.zeilen,
      });
      erstattungen.push({
        id,
        mitgliedId: eingabe.mitgliedId,
        datum: eingabe.datum,
        buchungId: gebucht.id,
        buchungSeq: gebucht.seq,
        summeCent: plan.summeCent,
        schluessel: eingabe.idempotenzSchluessel,
        belegIds: [...new Set(eingabe.belegIds)],
      });
      return { id, buchungId: gebucht.id, buchungSeq: gebucht.seq, summeCent: plan.summeCent };
    },
  };
  return store;
}
