import { heuteBerlin, tagNachher, type SumupAbrufErgebnis } from '@c4/shared';
import type { SumupStore } from './finanzenSumup';
import type { SumupApi, SumupSecret } from './sumup';

/** Overlap with the last run: SumUp may settle transactions late. */
const UEBERLAPP_MS = 3 * 86_400_000;
const UEBERLAPP_TAGE = 7;

export interface SumupJobDeps {
  /** Undefined = no (usable) secret: SumUp is not set up. */
  secret: () => Promise<SumupSecret | undefined>;
  api: (secret: SumupSecret) => SumupApi;
  store: Pick<SumupStore, 'sumupSpeichern' | 'sumupStand'>;
}

/**
 * Fetches new SumUp transactions and payouts and stores them (docs/finanzen.md („SumUp“)). Re-reads
 * the last 3 days / 7 days again; existing ids are ignored. Nothing is booked here.
 */
export function sumupAbrufen(deps: SumupJobDeps) {
  return async (jetzt: Date): Promise<SumupAbrufErgebnis> => {
    const secret = await deps.secret();
    if (!secret) {
      console.log('SumUp: no secret configured, skipping');
      return { uebersprungen: true, transaktionenNeu: 0, auszahlungenNeu: 0, vollstaendig: true };
    }
    const stand = await deps.store.sumupStand();
    const abDatum = new Date(`${secret.abDatum}T00:00:00Z`);
    const seit = new Date(
      Math.max(stand.zeitpunkt ? Date.parse(stand.zeitpunkt) - UEBERLAPP_MS : 0, abDatum.getTime()),
    );
    let von = secret.abDatum;
    if (stand.datum) {
      const zurueck = tagNachher(stand.datum, -UEBERLAPP_TAGE);
      if (zurueck > von) von = zurueck;
    }
    const api = deps.api(secret);
    const bis = heuteBerlin(jetzt);
    const [t, a] = await Promise.all([api.transaktionen(seit), api.auszahlungen(von, bis)]);
    const neu = await deps.store.sumupSpeichern(t.transaktionen, a);
    return { ...neu, vollstaendig: t.vollstaendig };
  };
}
