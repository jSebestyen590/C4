import {
  PFAND_KONTO_ID,
  STEUERSATZ_ZEITRAEUME_SEED,
  SUMUP_ERLOES_KONTO_ID,
  heuteBerlin,
  type AuswertungKonto,
  type AuswertungZeile,
  type KettenBuchung,
  type KontoDto,
} from '@c4/shared';
import type { AuswertungenStore } from './finanzenAuswertungen';

export interface AuswertungenFakeKern {
  buchungen: KettenBuchung[];
  konten: Map<string, Omit<KontoDto, 'saldoCent' | 'saldoGesamtCent'>>;
  events: Map<
    string,
    { titel: string | null; kategorie: string; kategorieId?: string; beginn: string }
  >;
}

/** Map-backed Auswertungen store for tests: the raw rows come from the journal fake. */
export function createFakeAuswertungenStore(k: AuswertungenFakeKern): AuswertungenStore {
  const zeilen = (von: string, bis: string): AuswertungZeile[] =>
    k.buchungen
      .filter((b) => b.datum >= von && b.datum <= bis)
      .flatMap((b) =>
        b.zeilen.map((z) => ({
          buchungId: b.id,
          datum: b.datum,
          quelleTyp: b.quelleTyp,
          eventId: b.eventId,
          stornoVon: b.stornoVon,
          kontoId: z.kontoId,
          betragCent: z.betragCent,
          nettoCent: z.nettoCent,
          steuerCent: z.steuerCent,
          steuersatz: z.steuersatz,
          steuerArt: z.steuerArt,
        })),
      );

  return {
    async auswertungZeilen(von, bis) {
      return zeilen(von, bis);
    },
    async auswertungKonten(): Promise<AuswertungKonto[]> {
      return [...k.konten.values()].map((x) => ({
        id: x.id,
        name: x.name,
        art: x.art,
        parentId: x.parentId,
        euerZeile: x.euerZeile,
      }));
    },
    async auswertungSteuersaetze() {
      return [...STEUERSATZ_ZEITRAEUME_SEED];
    },
    async auswertungEventQuellen(von, bis) {
      const storniert = new Set(k.buchungen.flatMap((b) => (b.stornoVon ? [b.stornoVon] : [])));
      return k.buchungen.flatMap((b) => {
        const e = b.eventId ? k.events.get(b.eventId) : undefined;
        if (!e || !b.eventId || b.quelleTyp !== 'sumup' || b.stornoVon || storniert.has(b.id))
          return [];
        const tag = heuteBerlin(new Date(e.beginn));
        if (tag < von || tag > bis) return [];
        return b.zeilen
          .filter((z) => z.kontoId === SUMUP_ERLOES_KONTO_ID)
          .map((z) => ({
            eventId: b.eventId!,
            titel: e.titel || e.kategorie,
            beginn: e.beginn,
            kategorieId: e.kategorieId ?? 'kat',
            kategorieName: e.kategorie,
            kategorieFarbe: 'gray',
            quelle: 'karte' as const,
            bruttoCent: -z.betragCent,
            nettoCent: -(z.nettoCent ?? z.betragCent),
          }));
      });
    },
    async auswertungEinkauf() {
      return { posten: [], gebinde: [] };
    },
    async auswertungPfandZeilen(jahr) {
      return zeilen('0000-01-01', `${jahr}-12-31`)
        .filter((z) => z.kontoId === PFAND_KONTO_ID)
        .map((z) => ({ datum: z.datum, betragCent: z.betragCent }));
    },
  };
}
