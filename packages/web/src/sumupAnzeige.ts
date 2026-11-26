import {
  datumAnzeigen,
  datumBerlin,
  zeitBerlin,
  type SumupAbrufErgebnis,
  type SumupEventDto,
  type SumupGruppeDto,
  type SumupHinweis,
  type SumupTransaktion,
} from '@c4/shared';

/** Select value for "no event" (Mantine selects need a string). */
export const OHNE_EVENT = '__ohne__';

/** German label of a SumUp transaction type; unknown types are shown as they are. */
export function sumupTypText(typ: string): string {
  switch (typ) {
    case 'PAYMENT':
      return 'Zahlung';
    case 'REFUND':
      return 'Erstattung';
    case 'CHARGE_BACK':
      return 'Rückbuchung';
    default:
      return typ;
  }
}

export function sumupHinweisText(h: SumupHinweis): string {
  return h === 'trinkgeld' ? 'Trinkgeld erfasst' : 'Ohne Event';
}

/** "Titel – 31.10. 20:00" */
export function sumupEventText(e: { titel: string | null; beginn: string }): string {
  const datum = datumAnzeigen(datumBerlin(e.beginn)).slice(0, 6);
  return `${e.titel ?? 'Event'} – ${datum} ${zeitBerlin(e.beginn)}`;
}

/** Select options of a group: the not cancelled events, plus the group's own suggestion. */
export function sumupEventOptionen(
  events: readonly SumupEventDto[],
  gruppe: Pick<SumupGruppeDto, 'eventId' | 'eventTitel' | 'eventBeginn'>,
): { value: string; label: string }[] {
  const optionen = events
    .filter((e) => !e.abgesagt)
    .map((e) => ({ value: e.id, label: sumupEventText(e) }));
  if (gruppe.eventId && gruppe.eventBeginn && !optionen.some((o) => o.value === gruppe.eventId)) {
    optionen.push({
      value: gruppe.eventId,
      label: sumupEventText({ titel: gruppe.eventTitel, beginn: gruppe.eventBeginn }),
    });
  }
  return [{ value: OHNE_EVENT, label: 'Ohne Event' }, ...optionen];
}

/** Count and sum of the transactions that are not unchecked. */
export function sumupAuswahl(
  transaktionen: readonly SumupTransaktion[],
  abgewaehlt: ReadonlySet<string>,
): { ids: string[]; anzahl: number; summeCent: number } {
  const gewaehlt = transaktionen.filter((t) => !abgewaehlt.has(t.id));
  return {
    ids: gewaehlt.map((t) => t.id),
    anzahl: gewaehlt.length,
    summeCent: gewaehlt.reduce((s, t) => s + t.betragCent, 0),
  };
}

/** Notification text after a fetch run. */
export function sumupAbrufText(e: SumupAbrufErgebnis): string {
  if (e.uebersprungen) return 'SumUp ist noch nicht eingerichtet.';
  const zahlungen =
    e.transaktionenNeu === 1 ? '1 neue Zahlung' : `${e.transaktionenNeu} neue Zahlungen`;
  const auszahlungen =
    e.auszahlungenNeu === 1 ? '1 neue Auszahlung' : `${e.auszahlungenNeu} neue Auszahlungen`;
  const text = `${zahlungen}, ${auszahlungen}`;
  return e.vollstaendig ? text : `${text}. Es gibt noch mehr, ruf noch einmal ab.`;
}
