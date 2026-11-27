import type { SumupApi, SumupAuszahlungRoh, SumupTransaktionRoh } from './sumup';

/** Test double of the SumUp client; tests fill the arrays. */
export function createFakeSumup(
  daten: {
    transaktionen?: SumupTransaktionRoh[];
    auszahlungen?: SumupAuszahlungRoh[];
    vollstaendig?: boolean;
  } = {},
) {
  const state = {
    transaktionen: daten.transaktionen ?? [],
    auszahlungen: daten.auszahlungen ?? [],
    vollstaendig: daten.vollstaendig ?? true,
    /** Arguments of the calls, for assertions. */
    aufrufe: [] as { art: 'transaktionen' | 'auszahlungen'; von: string; bis?: string }[],
  };
  const api: SumupApi = {
    async transaktionen(seit) {
      state.aufrufe.push({ art: 'transaktionen', von: seit.toISOString() });
      return {
        transaktionen: state.transaktionen.filter((t) => t.zeitpunkt >= seit.toISOString()),
        vollstaendig: state.vollstaendig,
      };
    },
    async auszahlungen(von, bis) {
      state.aufrufe.push({ art: 'auszahlungen', von, bis });
      return state.auszahlungen.filter((a) => a.datum >= von && a.datum <= bis);
    },
  };
  return Object.assign(api, { state });
}
