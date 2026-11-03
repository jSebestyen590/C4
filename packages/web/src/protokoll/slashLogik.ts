import {
  bausteinLeer,
  type BausteinDatenVon,
  type BausteinEventDaten,
  type BausteinTyp,
  type BausteinVergangenesEventDaten,
} from '@c4/shared';

// Items of the slash menu ("/") and of the toolbar's Baustein menu: pure, no TipTap/React.

/** A Baustein with its type and matching fields. */
export type BausteinWahl = {
  [T in BausteinTyp]: { typ: T; daten: BausteinDatenVon[T] };
}[BausteinTyp];

export type SlashAktion =
  /** Replace the typed text by `/text` (switches to the second stage). */
  { art: 'weiter'; text: string } | { art: 'einfuegen'; wahl: BausteinWahl };

export type SlashSymbol = 'event' | 'vergangenes' | 'anwaerter' | 'beschluss' | 'vorlage' | 'ohne';

export interface SlashEintrag {
  schluessel: string;
  titel: string;
  beschreibung: string;
  symbol: SlashSymbol;
  aktion: SlashAktion;
}

/** A selectable Vorlage with the Baustein fields it creates. */
export interface SlashVorlage {
  id: string;
  titel: string;
  beschreibung: string;
  daten: BausteinEventDaten;
}

/** A selectable past event with the Baustein fields it creates. */
export interface SlashVergangenes {
  id: string;
  titel: string;
  beschreibung: string;
  daten: BausteinVergangenesEventDaten;
}

export interface SlashDaten {
  vorlagen: readonly SlashVorlage[];
  vergangene: readonly SlashVergangenes[];
}

export type SlashStufe = 'bausteine' | 'vorlagen' | 'events';

/** Lower case, umlauts spelled out (`Anwärter` = `anwaerter`), single spaces. */
export function normalisieren(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
}

/** Stage and filter text of what was typed after the "/". */
export function slashStufe(query: string): { stufe: SlashStufe; filter: string } {
  const q = normalisieren(query).replace(/^ /, '');
  const treffer = /^(\S+) (.*)$/.exec(q);
  const wort = treffer?.[1];
  const rest = treffer?.[2] ?? '';
  if (wort === 'event') return { stufe: 'vorlagen', filter: rest.trim() };
  if (wort === 'vergangenes' || wort === 'vergangen') {
    return { stufe: 'events', filter: rest.replace(/^event ?/, '').trim() };
  }
  return { stufe: 'bausteine', filter: q.trim() };
}

interface Definition {
  schluessel: string;
  titel: string;
  beschreibung: string;
  symbol: SlashSymbol;
  woerter: string[];
  aktion: SlashAktion;
}

export const SLASH_DEFINITIONEN: readonly Definition[] = [
  {
    schluessel: 'event',
    titel: 'Event',
    beschreibung: 'Geplantes Event mit Datum, Diensten und Verantwortlichen',
    symbol: 'event',
    woerter: ['event', 'veranstaltung', 'termin'],
    aktion: { art: 'weiter', text: 'event ' },
  },
  {
    schluessel: 'vergangenes',
    titel: 'Vergangenes Event',
    beschreibung: 'Rückblick auf ein Event, das schon stattgefunden hat',
    symbol: 'vergangenes',
    woerter: ['vergangenes', 'vergangen', 'rueckblick', 'event'],
    aktion: { art: 'weiter', text: 'vergangenes ' },
  },
  {
    schluessel: 'anwaerter',
    titel: 'Anwärter:in',
    beschreibung: 'Neue:r Anwärter:in mit Name und E-Mail',
    symbol: 'anwaerter',
    woerter: ['anwaerter', 'anwaerterin', 'neu', 'mitglied'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinAnwaerter', daten: bausteinLeer('bausteinAnwaerter') },
    },
  },
  {
    schluessel: 'beschluss',
    titel: 'Beschluss',
    beschreibung: 'Antrag mit Abstimmung und Ergebnis',
    symbol: 'beschluss',
    woerter: ['beschluss', 'abstimmung', 'antrag'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinBeschluss', daten: bausteinLeer('bausteinBeschluss') },
    },
  },
];

/** Items of the first stage: the Bausteine whose name or alias starts with the filter. */
export function bausteinEintraege(filter: string): SlashEintrag[] {
  const f = normalisieren(filter).trim();
  return SLASH_DEFINITIONEN.filter((d) => {
    if (f === '') return true;
    const namen = [normalisieren(d.titel), ...normalisieren(d.titel).split(' '), ...d.woerter];
    return namen.some((n) => n.startsWith(f));
  }).map(({ schluessel, titel, beschreibung, symbol, aktion }) => ({
    schluessel,
    titel,
    beschreibung,
    symbol,
    aktion,
  }));
}

const enthaelt = (text: string, filter: string): boolean =>
  filter === '' || normalisieren(text).includes(filter);

/** Second stage of "Event": "Ohne Vorlage" and the Vorlagen matching the filter. */
export function vorlageEintraege(
  vorlagen: readonly SlashVorlage[],
  filter: string,
): SlashEintrag[] {
  const eintraege: SlashEintrag[] = [];
  if ('ohne vorlage'.startsWith(filter) || enthaelt('ohne vorlage', filter)) {
    eintraege.push({
      schluessel: 'ohne-vorlage',
      titel: 'Ohne Vorlage',
      beschreibung: 'Leeres Event',
      symbol: 'ohne',
      aktion: {
        art: 'einfuegen',
        wahl: { typ: 'bausteinEvent', daten: bausteinLeer('bausteinEvent') },
      },
    });
  }
  for (const v of vorlagen) {
    if (!enthaelt(v.titel, filter)) continue;
    eintraege.push({
      schluessel: `vorlage-${v.id}`,
      titel: v.titel,
      beschreibung: v.beschreibung,
      symbol: 'vorlage',
      aktion: { art: 'einfuegen', wahl: { typ: 'bausteinEvent', daten: v.daten } },
    });
  }
  return eintraege;
}

/** Second stage of "Vergangenes Event": no calendar event ("von Hand") and past events matching the filter. */
export function vergangenesEintraege(
  events: readonly SlashVergangenes[],
  filter: string,
): SlashEintrag[] {
  const eintraege: SlashEintrag[] = [];
  if (enthaelt('ohne kalender-event von hand', filter) || 'ohne'.startsWith(filter)) {
    eintraege.push({
      schluessel: 'ohne-event',
      titel: 'Ohne Kalender-Event',
      beschreibung: 'Name und Datum von Hand eintragen',
      symbol: 'ohne',
      aktion: {
        art: 'einfuegen',
        wahl: { typ: 'bausteinVergangenesEvent', daten: bausteinLeer('bausteinVergangenesEvent') },
      },
    });
  }
  for (const e of events) {
    if (!enthaelt(`${e.titel} ${e.beschreibung}`, filter)) continue;
    eintraege.push({
      schluessel: `event-${e.id}`,
      titel: e.titel,
      beschreibung: e.beschreibung,
      symbol: 'vergangenes',
      aktion: { art: 'einfuegen', wahl: { typ: 'bausteinVergangenesEvent', daten: e.daten } },
    });
  }
  return eintraege;
}

/** All items for what was typed after the "/". */
export function slashEintraege(query: string, daten: SlashDaten): SlashEintrag[] {
  const { stufe, filter } = slashStufe(query);
  if (stufe === 'vorlagen') return vorlageEintraege(daten.vorlagen, filter);
  if (stufe === 'events') return vergangenesEintraege(daten.vergangene, filter);
  return bausteinEintraege(filter);
}
