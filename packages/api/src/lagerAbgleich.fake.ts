import type { AbgleichIst, AbgleichKorrektur, AbgleichSoll, Gebinde } from '@c4/shared';
import type { AbgleichWareInfo, LagerAbgleichStore } from './lagerAbgleich';

/** In-memory Lager-Abgleich store; tests fill `zustand` with base-unit rows and Waren. */
export function createFakeLagerAbgleichStore() {
  const zustand = {
    stichtag: null as string | null,
    ist: [] as AbgleichIst[],
    soll: [] as AbgleichSoll[],
    korrekturen: [] as AbgleichKorrektur[],
    waren: [] as AbgleichWareInfo[],
    alleGebinde: [] as Gebinde[],
  };
  let naechste = 1;
  const store: LagerAbgleichStore = {
    async stichtag() {
      return zustand.stichtag;
    },
    async stichtagSetzen(datum) {
      zustand.stichtag = datum;
    },
    async daten(_stichtag, wareId) {
      const passt = <T extends { wareId: string }>(z: T) => !wareId || z.wareId === wareId;
      return {
        ist: zustand.ist.filter(passt),
        soll: zustand.soll.filter(passt),
        korrekturen: zustand.korrekturen.filter(passt),
        waren: zustand.waren.filter((w) => !wareId || w.id === wareId),
        alleGebinde: zustand.alleGebinde,
      };
    },
    async korrekturAnlegen(daten, sub) {
      if (!zustand.waren.some((w) => w.id === daten.wareId)) return null;
      const id = `ak${naechste++}`;
      zustand.korrekturen.push({ id, ...daten, erstelltVon: sub });
      return id;
    },
  };
  return { store, zustand };
}
