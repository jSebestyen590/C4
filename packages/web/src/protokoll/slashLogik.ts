import {
  bausteinLeer,
  istBausteinInNotizen,
  type BausteinDatenVon,
  type BausteinEventDaten,
  type AnwesenheitArt,
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
  | { art: 'weiter'; text: string }
  | { art: 'einfuegen'; wahl: BausteinWahl }
  /** Turn the current paragraph into a quote (works at the cursor, also inside a Baustein's text). */
  | { art: 'zitat' };

export type SlashSymbol =
  | 'event'
  | 'vergangenes'
  | 'anwaerter'
  | 'beschluss'
  | 'meinungsbild'
  | 'aufnahme'
  | 'wahl'
  | 'em'
  | 'erscheint'
  | 'geht'
  | 'vorlage'
  | 'ohne'
  | 'zitat';

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

/** A person of the attendance list, selectable for /erscheint and /geht. */
export interface SlashPerson {
  sub: string;
  /** Username, else the full name. */
  titel: string;
  /** Full name and status. */
  beschreibung: string;
  mitglied: boolean;
  /** Counts as present at the opening (`anwesend` / `verspaetet`). */
  da: boolean;
}

export interface SlashDaten {
  vorlagen: readonly SlashVorlage[];
  vergangene: readonly SlashVergangenes[];
  /** The attendance list. */
  personen?: readonly SlashPerson[];
  /** Time to prefill a new Anwesenheit block (`HH:MM`, '' = none); called on every list build. */
  uhrzeit?: () => string;
  /** Called after an Erscheint block with a person was inserted (updates the Kopf). */
  erscheint?: (sub: string) => void;
}

/** The person of a chosen Erscheint block, else null (Geht, other Bausteine, no person). */
export function erscheintPerson(wahl: BausteinWahl): string | null {
  if (wahl.typ !== 'bausteinAnwesenheit') return null;
  const d = wahl.daten;
  return d.art === 'erscheint' && d.sub ? d.sub : null;
}

export type SlashStufe = 'bausteine' | 'vorlagen' | 'events' | AnwesenheitArt;

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
  if (wort === 'erscheint' || wort === 'erscheinen' || wort === 'kommt') {
    return { stufe: 'erscheint', filter: rest.trim() };
  }
  if (wort === 'geht' || wort === 'gehen' || wort === 'verlaesst') {
    return { stufe: 'geht', filter: rest.trim() };
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
    schluessel: 'aufnahme',
    titel: 'Aufnahme',
    beschreibung: 'Aufnahme einer Anwärter:in als Mitglied, mit Abstimmung',
    symbol: 'aufnahme',
    woerter: ['aufnahme', 'aufnehmen', 'mitglied'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinAufnahme', daten: bausteinLeer('bausteinAufnahme') },
    },
  },
  {
    schluessel: 'beschluss',
    titel: 'Abstimmung',
    beschreibung: 'Antrag mit Abstimmung der Mitglieder und Ergebnis',
    symbol: 'beschluss',
    woerter: ['abstimmung', 'beschluss', 'antrag'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinBeschluss', daten: bausteinLeer('bausteinBeschluss') },
    },
  },
  {
    schluessel: 'meinungsbild',
    titel: 'Meinungsbild',
    beschreibung: 'Unverbindliche Umfrage unter allen Anwesenden',
    symbol: 'meinungsbild',
    woerter: ['meinungsbild', 'stimmungsbild', 'umfrage'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinMeinungsbild', daten: bausteinLeer('bausteinMeinungsbild') },
    },
  },
  {
    schluessel: 'wahl',
    titel: 'Wahl',
    beschreibung: 'Posten wählen: Kandidat:innen, Stimmen, Stichwahl',
    symbol: 'wahl',
    woerter: ['wahl', 'waehlen', 'wahlen', 'postenwahl'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinWahl', daten: bausteinLeer('bausteinWahl') },
    },
  },
  {
    schluessel: 'em',
    titel: 'Neues EM',
    beschreibung: 'Neues Ehrenmitglied, optional mit Abstimmung',
    symbol: 'em',
    woerter: ['em', 'ehrenmitglied', 'neues em'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinEm', daten: bausteinLeer('bausteinEm') },
    },
  },
  {
    schluessel: 'erscheint',
    titel: 'Erscheint',
    beschreibung: 'Ein Mitglied kommt während der Sitzung dazu',
    symbol: 'erscheint',
    woerter: ['erscheint', 'erscheinen', 'kommt', 'ankunft', 'verspaetet'],
    aktion: { art: 'weiter', text: 'erscheint ' },
  },
  {
    schluessel: 'geht',
    titel: 'Geht',
    beschreibung: 'Ein Mitglied verlässt die Sitzung',
    symbol: 'geht',
    woerter: ['geht', 'gehen', 'verlaesst', 'verlassen'],
    aktion: { art: 'weiter', text: 'geht ' },
  },
  {
    schluessel: 'zitat',
    titel: 'Zitat',
    beschreibung: 'Zitat einfügen',
    symbol: 'zitat',
    woerter: ['zitat', 'quote', 'blockquote'],
    aktion: { art: 'zitat' },
  },
];

/**
 * Items of the first stage: the Bausteine (and the quote) whose name or alias starts with the filter.
 * `ohneVerschachtelt` leaves out Abstimmung, Meinungsbild and Wahl (the cursor is inside one of them: they
 * cannot be nested in each other); `ohneZitat` leaves out the quote (the cursor is in a list item).
 */
export function bausteinEintraege(
  filter: string,
  ohneVerschachtelt = false,
  ohneZitat = false,
): SlashEintrag[] {
  const f = normalisieren(filter).trim();
  return SLASH_DEFINITIONEN.filter((d) => {
    if (
      ohneVerschachtelt &&
      d.aktion.art === 'einfuegen' &&
      istBausteinInNotizen(d.aktion.wahl.typ)
    )
      return false;
    if (ohneZitat && d.aktion.art === 'zitat') return false;
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

/**
 * Second stage of "Erscheint" / "Geht": the people of the attendance list matching the filter. Those
 * who can still arrive (not present at the opening) come first for Erscheint, the present ones first for
 * Geht; then members before the rest, then by name.
 */
export function personEintraege(
  art: AnwesenheitArt,
  personen: readonly SlashPerson[],
  filter: string,
  uhrzeit: string,
): SlashEintrag[] {
  const rang = (p: SlashPerson) => (p.da === (art === 'geht') ? 0 : 1);
  return personen
    .filter((p) => enthaelt(`${p.titel} ${p.beschreibung}`, filter))
    .sort(
      (a, b) =>
        rang(a) - rang(b) ||
        Number(b.mitglied) - Number(a.mitglied) ||
        a.titel.localeCompare(b.titel, 'de'),
    )
    .map((p) => ({
      schluessel: `person-${art}-${p.sub}`,
      titel: p.titel,
      beschreibung: p.beschreibung,
      symbol: art,
      aktion: {
        art: 'einfuegen' as const,
        wahl: {
          typ: 'bausteinAnwesenheit' as const,
          daten: { art, sub: p.sub, uhrzeit },
        },
      },
    }));
}

/** All items for what was typed after the "/". */
export function slashEintraege(
  query: string,
  daten: SlashDaten,
  ohneVerschachtelt = false,
  ohneZitat = false,
): SlashEintrag[] {
  const { stufe, filter } = slashStufe(query);
  if (stufe === 'vorlagen') return vorlageEintraege(daten.vorlagen, filter);
  if (stufe === 'events') return vergangenesEintraege(daten.vergangene, filter);
  if (stufe === 'erscheint' || stufe === 'geht') {
    return personEintraege(stufe, daten.personen ?? [], filter, daten.uhrzeit?.() ?? '');
  }
  return bausteinEintraege(filter, ohneVerschachtelt, ohneZitat);
}
