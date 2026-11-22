import { Text } from '@mantine/core';
import { buchungsdatumFuer, datumAnzeigen, monateVerschieben, monatAnzeigen } from '@c4/shared';
import { useFestschreibungen } from './finanzenDaten';

/** Earliest day a fixed-date booking may have (null: nothing is closed) and the hint text for it. */
export function useDatumsgrenze() {
  const q = useFestschreibungen();
  const festBis = q.data?.festgeschriebenBis ?? null;
  return {
    festBis,
    min: q.data?.ersterOffenerTag ?? null,
    hinweis: festBis
      ? `Bis ${datumAnzeigen(festBis)} ist festgeschrieben. Buche mit einem Datum ab ${datumAnzeigen(q.data?.ersterOffenerTag ?? festBis)}.`
      : null,
  };
}

/** Text for a booking date inside a closed month: it is booked on the first open day; null otherwise. */
export function verschiebText(datum: string, festBis: string | null): string | null {
  if (!datum) return null;
  const e = buchungsdatumFuer(datum, festBis, true);
  if (e.fehler !== undefined || !e.verschoben) return null;
  return `Der Monat ${monatAnzeigen(datum)} ist festgeschrieben, gebucht wird mit Datum ${datumAnzeigen(e.datum)}.`;
}

/** Info line under a date field of a source that is shifted into the first open day. */
export function VerschiebHinweis({ datum }: Readonly<{ datum: string }>) {
  const { festBis } = useDatumsgrenze();
  const text = verschiebText(datum, festBis);
  if (!text) return null;
  return (
    <Text size="sm" c="orange.8" role="status">
      {text}
    </Text>
  );
}

/** Hint under a date field of a fixed-date booking (free booking, Umbuchung, Storno). */
export function DatumsgrenzeHinweis() {
  const { hinweis } = useDatumsgrenze();
  if (!hinweis) return null;
  return (
    <Text size="sm" c="dimmed">
      {hinweis}
    </Text>
  );
}

/** True from the 10th of the month after `naechsterMonat` (`YYYY-MM-01`) on: the month is due. */
export function festschreibungFaellig(naechsterMonat: string | null, heute: string): boolean {
  if (!naechsterMonat) return false;
  return heute >= `${monateVerschieben(naechsterMonat, 1).slice(0, 8)}10`;
}
