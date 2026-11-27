import {
  bausteinLeer,
  heuteBerlin,
  wahlGueltigAbVorschlag,
  istBausteinInNotizen,
  istNurInNotizen,
  type BausteinDatenVon,
  type BausteinEventDaten,
  type AnwesenheitArt,
  type BausteinTyp,
  type BausteinVergangenesEventDaten,
  type MitgliedStatus,
} from '@c4/shared';
import { dienstPersonen, eventZeiten, zeitspanneParsen, type DienstEingabe } from './bausteinLogik';

// Items of the slash menu ("/") and of the toolbar's Baustein menu: pure, no TipTap/React.

/** A Baustein with its type and matching fields. */
export type BausteinWahl = {
  [T in BausteinTyp]: { typ: T; daten: BausteinDatenVon[T] };
}[BausteinTyp];

export type SlashAktion =
  /** Replace the typed text by `/text` (switches to the second stage). */
  | { art: 'weiter'; text: string }
  | {
      art: 'einfuegen';
      wahl: BausteinWahl;
      /** An Erscheint / Geht block for a name that is no chip yet: the chip is created in the Kopf too. */
      neuerExterner?: { art: ExternArt; name: string };
    }
  /**
   * Turn the current paragraph into a quote (works at the cursor, also inside a Baustein's text);
   * `imText`: instead mark the selection (or the next typed text) as an inline quote.
   */
  | { art: 'zitat'; imText?: boolean }
  /** Set the end of the Sitzung (Kopf) to the current time; no Baustein. */
  | { art: 'ende' }
  /** Enter a Dienst (with an optional person) into the surrounding Event block; no Baustein. */
  | {
      art: 'dienst';
      /** `null` = "Fertig": only remove the typed text. */
      eingabe: DienstEingabe | null;
      /** Replace the typed text by `/text` instead of removing it (the menu stays open for the next person). */
      weiter?: string;
    }
  /** Pick an image file and upload it (the file dialog opens, so this runs in the user's click or key press). */
  | { art: 'bild' };

/** An external person of the Kopf: EM without the app (`em`) or guest (`gast`). */
export type ExternArt = 'em' | 'gast';

export type SlashSymbol =
  | 'event'
  | 'thema'
  | 'vergangenes'
  | 'anwaerter'
  | 'beschluss'
  | 'meinungsbild'
  | 'aufnahme'
  | 'wahl'
  | 'auswahl'
  | 'em'
  | 'erscheint'
  | 'geht'
  | 'vorlage'
  | 'ohne'
  | 'zitat'
  | 'bild'
  | 'person'
  | 'gruppe'
  | 'todo'
  | 'merker'
  | 'ende';

export interface SlashEintrag {
  schluessel: string;
  titel: string;
  beschreibung: string;
  symbol: SlashSymbol;
  aktion: SlashAktion;
}

/** What the list of a suggestion popup needs of an entry (slash menu and @mentions). */
export type ListenEintrag = Pick<
  SlashEintrag,
  'schluessel' | 'titel' | 'beschreibung' | 'symbol'
> & {
  /** A member entry: the list shows `name` as `StatusName` (bold, status color) instead of `titel`. */
  person?: { name: string; zusatz?: string; status: MitgliedStatus };
};

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
  /** `sub` of an app member; '' for an external person (chip of the Kopf, see `extern`). */
  sub: string;
  /** Set for an external person: EM chip or guest; `name` is the chip text. */
  extern?: ExternArt;
  name?: string;
  /** Username, else the full name. */
  titel: string;
  /** Full name and status. */
  beschreibung: string;
  mitglied: boolean;
  /** Counts as present at the opening (`anwesend`). */
  da: boolean;
}

export interface SlashDaten {
  vorlagen: readonly SlashVorlage[];
  vergangene: readonly SlashVergangenes[];
  /** The attendance list. */
  personen?: readonly SlashPerson[];
  /** Time to prefill a new Anwesenheit block (`HH:MM`, '' = none); called on every list build. */
  uhrzeit?: () => string;
  /** Called after an Erscheint / Geht block with a person was inserted (locks the person to "da" in the Kopf). */
  anwesenheit?: (sub: string) => void;
  /** A chip was created by /erscheint or /geht with an unknown name (EM or guest in the Kopf). */
  externHinzufuegen?: (art: ExternArt, name: string) => void;
  /** Called by /ende with the current time `HH:MM`. */
  ende?: (uhrzeit: string) => void;
  /** Active Dienstformen (second stage of /dienst). */
  dienstformen?: readonly SlashDienstform[];
  /** Whether the event (by its data) belongs to a Kategorie with participation (no Dienste there). */
  eventTeilnahme?: (event: BausteinEventDaten) => boolean;
}

/** A Dienstform selectable in /dienst. */
export interface SlashDienstform {
  id: string;
  name: string;
}

/** What the slash menu knows about the place of the cursor. */
export interface SlashKontext {
  /** The cursor is inside an Event block: its data (enables /dienst); null elsewhere. */
  event?: BausteinEventDaten | null;
  /** The event at the cursor has a Kategorie with participation: no /dienst. */
  eventIstTeilnahme?: boolean;
}

/** The person of a chosen Erscheint / Geht block, else null (other Bausteine, no person). */
export function anwesenheitPerson(wahl: BausteinWahl): string | null {
  if (wahl.typ !== 'bausteinAnwesenheit') return null;
  return wahl.daten.sub || null;
}

export type SlashStufe =
  'bausteine' | 'vorlagen' | 'events' | 'abstimmung' | 'zitat' | 'dienst' | AnwesenheitArt;

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

/** What was typed after the stage word, as typed (case, umlauts): the name of a new chip. */
export function slashRohFilter(query: string): string {
  return query.replace(/^\s*\S+\s*/, '').trim();
}

/** Stage and filter text of what was typed after the "/". */
export function slashStufe(query: string): { stufe: SlashStufe; filter: string } {
  const q = normalisieren(query).replace(/^ /, '');
  const treffer = /^(\S+) (.*)$/.exec(q);
  const wort = treffer?.[1];
  const rest = treffer?.[2] ?? '';
  if (wort === 'event') return { stufe: 'vorlagen', filter: rest.trim() };
  if (wort === 'abstimmung' || wort === 'beschluss') {
    return { stufe: 'abstimmung', filter: rest.trim() };
  }
  if (wort === 'vergangenes' || wort === 'vergangen') {
    return { stufe: 'events', filter: rest.replace(/^event ?/, '').trim() };
  }
  if (wort === 'zitat') return { stufe: 'zitat', filter: rest.trim() };
  if (wort === 'dienst') return { stufe: 'dienst', filter: rest.trim() };
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
  /** Only found by its aliases (not by the title), and only once something was typed. */
  nurAlias?: boolean;
  /** Only in the slash menu, not in the toolbar's Baustein menu (no Baustein, or tied to the cursor's place). */
  nurSlash?: 'ende' | 'dienst';
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
    schluessel: 'thema',
    titel: 'Thema',
    beschreibung: 'Allgemeiner Punkt mit Titel und Notizen',
    symbol: 'thema',
    woerter: ['thema', 'punkt', 'top', 'tagesordnungspunkt'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinThema', daten: bausteinLeer('bausteinThema') },
    },
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
    aktion: { art: 'weiter', text: 'abstimmung ' },
  },
  {
    schluessel: 'auswahl',
    titel: 'Abstimmung (Mehrere Möglichkeiten)',
    beschreibung: 'Abstimmung über mehrere Möglichkeiten, mehrere können gewinnen',
    symbol: 'auswahl',
    woerter: ['auswahl', 'mehrfach', 'mehrfachauswahl'],
    nurAlias: true,
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinAuswahl', daten: bausteinLeer('bausteinAuswahl') },
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
      wahl: {
        typ: 'bausteinWahl',
        // A getter, so "Gilt ab" uses the day of inserting, not of loading the page.
        get daten() {
          return {
            ...bausteinLeer('bausteinWahl'),
            gueltigAb: wahlGueltigAbVorschlag(heuteBerlin()),
          };
        },
      },
    },
  },
  {
    schluessel: 'em',
    titel: 'Austritt',
    beschreibung: 'Austritt eines Mitglieds zum Ehrenmitglied, optional mit Abstimmung',
    symbol: 'em',
    woerter: ['austritt', 'em', 'ehrenmitglied', 'neues em'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinEm', daten: bausteinLeer('bausteinEm') },
    },
  },
  {
    schluessel: 'todo',
    titel: 'Todo',
    beschreibung: 'Aufgabe mit Zuständigen und Deadline, mit Erinnerung per Push',
    symbol: 'todo',
    woerter: ['todo', 'aufgabe', 'aufgaben'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinTodo', daten: bausteinLeer('bausteinTodo') },
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
    schluessel: 'bild',
    titel: 'Bild',
    beschreibung: 'Foto oder Bild aus der Galerie oder Kamera',
    symbol: 'bild',
    woerter: ['bild', 'foto', 'image', 'bilder', 'fotos', 'kamera'],
    aktion: { art: 'bild' },
  },
  {
    schluessel: 'zitat',
    titel: 'Zitat',
    beschreibung: 'Zitat als Absatz; mit Leerzeichen dahinter auch „im Text“',
    symbol: 'zitat',
    woerter: ['zitat', 'quote', 'blockquote'],
    aktion: { art: 'zitat' },
  },
  {
    schluessel: 'merker',
    titel: 'Überarbeiten',
    beschreibung: 'Merker für dich: später überarbeiten, kommt nicht ins Dokument',
    symbol: 'merker',
    woerter: ['ueberarbeiten', 'merker', 'markieren', 'nacharbeiten'],
    aktion: {
      art: 'einfuegen',
      wahl: { typ: 'bausteinMerker', daten: bausteinLeer('bausteinMerker') },
    },
  },
  {
    schluessel: 'dienst',
    titel: 'Dienst',
    beschreibung: 'Dienst mit Person ins Event eintragen',
    symbol: 'gruppe',
    woerter: ['dienst', 'schicht'],
    nurSlash: 'dienst',
    aktion: { art: 'weiter', text: 'dienst ' },
  },
  {
    schluessel: 'ende',
    titel: 'Ende der Sitzung',
    beschreibung: 'Trägt die aktuelle Uhrzeit als Ende ein',
    symbol: 'ende',
    woerter: ['ende', 'schluss', 'beenden'],
    nurSlash: 'ende',
    aktion: { art: 'ende' },
  },
];

/**
 * Items of the first stage: the Bausteine (and the quote) whose name or alias starts with the filter.
 * `ohneVerschachtelt` leaves out Abstimmung, Meinungsbild, Wahl and Auswahl (the cursor is inside one of them: they
 * cannot be nested in each other);
 * `ohneNurInNotizen` leaves out the Bausteine that only exist in the notes of another one (the Todo; the
 * cursor is at the top level of a section).
 */
export function bausteinEintraege(
  filter: string,
  ohneVerschachtelt = false,
  ohneNurInNotizen = false,
  kontext?: SlashKontext,
): SlashEintrag[] {
  const f = normalisieren(filter).trim();
  return SLASH_DEFINITIONEN.filter((d) => {
    // Without a context (the toolbar) the slash-only entries are left out; /dienst needs an Event block.
    if (d.nurSlash && !kontext) return false;
    if (d.nurSlash === 'dienst' && (!kontext?.event || kontext.eventIstTeilnahme)) return false;
    if (
      ohneVerschachtelt &&
      d.aktion.art === 'einfuegen' &&
      istBausteinInNotizen(d.aktion.wahl.typ)
    )
      return false;
    if (ohneNurInNotizen && d.aktion.art === 'einfuegen' && istNurInNotizen(d.aktion.wahl.typ))
      return false;
    if (ohneVerschachtelt && d.schluessel === 'beschluss') return false;
    if (d.nurAlias) return f !== '' && d.woerter.some((n) => n.startsWith(f));
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

/** Second stage of "Abstimmung": Ja / Nein (the Beschluss) or several options (the Auswahl). */
export function abstimmungEintraege(filter: string): SlashEintrag[] {
  const alle: SlashEintrag[] = [
    {
      schluessel: 'abstimmung-ja-nein',
      titel: 'Ja / Nein',
      beschreibung: 'Antrag mit Ja, Nein und Enthaltung',
      symbol: 'beschluss',
      aktion: {
        art: 'einfuegen',
        wahl: { typ: 'bausteinBeschluss', daten: bausteinLeer('bausteinBeschluss') },
      },
    },
    {
      schluessel: 'abstimmung-auswahl',
      titel: 'Mehrere Möglichkeiten',
      beschreibung: 'Frage mit mehreren Möglichkeiten, die eine oder mehrere gewinnen',
      symbol: 'auswahl',
      aktion: {
        art: 'einfuegen',
        wahl: { typ: 'bausteinAuswahl', daten: bausteinLeer('bausteinAuswahl') },
      },
    },
  ];
  return alle.filter((e) => enthaelt(`${e.titel} ${e.beschreibung}`, filter));
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
 * Geht; then members before the rest, then by name. External people (chips of the Kopf) are listed like
 * the others. With `roh` (the typed name) and no person of exactly that name, "als Gast / als EM hinzufügen"
 * follow the matches: they create the chip and the block.
 */
export function personEintraege(
  art: AnwesenheitArt,
  personen: readonly SlashPerson[],
  filter: string,
  uhrzeit: string,
  roh = '',
): SlashEintrag[] {
  const rang = (p: SlashPerson) => (p.da === (art === 'geht') ? 0 : 1);
  const eintraege: SlashEintrag[] = personen
    .filter((p) => enthaelt(`${p.titel} ${p.beschreibung}`, filter))
    .sort(
      (a, b) =>
        rang(a) - rang(b) ||
        Number(b.mitglied) - Number(a.mitglied) ||
        a.titel.localeCompare(b.titel, 'de'),
    )
    .map((p) => ({
      schluessel: `person-${art}-${p.extern ? `x:${p.name ?? p.titel}` : p.sub}`,
      titel: p.titel,
      beschreibung: p.beschreibung,
      symbol: art,
      aktion: {
        art: 'einfuegen' as const,
        wahl: {
          typ: 'bausteinAnwesenheit' as const,
          daten: p.extern
            ? { art, sub: null, name: p.name ?? p.titel, uhrzeit }
            : { art, sub: p.sub, name: '', uhrzeit },
        },
      },
    }));
  const name = roh.trim().slice(0, 100);
  if (name !== '' && !personen.some((p) => normalisieren(p.titel) === normalisieren(name))) {
    for (const [extern, text] of [
      ['gast', 'Gast'],
      ['em', 'EM'],
    ] as const) {
      eintraege.push({
        schluessel: `neu-${art}-${extern}`,
        titel: `„${name}“ als ${text} hinzufügen`,
        beschreibung: extern === 'gast' ? 'Gast ohne App, kommt in die Gästeliste' : 'EM ohne App',
        symbol: art,
        aktion: {
          art: 'einfuegen',
          wahl: { typ: 'bausteinAnwesenheit', daten: { art, sub: null, name, uhrzeit } },
          neuerExterner: { art: extern, name },
        },
      });
    }
  }
  return eintraege;
}

/** "18:00–22:30" for a span. */
const spanneText = (z: { beginnZeit: string; endeZeit: string }): string =>
  `${z.beginnZeit}–${z.endeZeit}`;

/** Separator between the parts typed after "/dienst" (time span › Dienst › person). */
const DIENST_TRENNER = '›';
/** Typed key of Aufbau / Putzen (a Dienstform could be called the same). */
const DIENST_ART = { '~aufbau': 'aufbau', '~putzen': 'putzen' } as const;

/**
 * Entries of "/dienst": three stages in one query, `<Zeit> › <Dienst> › <Person>`. Stage 1 the time ("Gesamt"
 * or a span typed as `18-22`), stage 2 the Dienstform (or Aufbau / Putzen), stage 3 "Ohne Personen" or a
 * person. The last one inserts nothing but the entry into the Event block.
 */
export function dienstEintraege(
  rest: string,
  event: BausteinEventDaten,
  dienstformen: readonly SlashDienstform[],
  personen: readonly SlashPerson[],
): SlashEintrag[] {
  const teile = rest.split(DIENST_TRENNER).map((t) => t.trim());
  const weiter = (schluessel: string, titel: string, beschreibung: string, text: string) =>
    ({
      schluessel,
      titel,
      beschreibung,
      symbol: 'gruppe',
      aktion: { art: 'weiter', text },
    }) satisfies SlashEintrag;

  if (teile.length === 1) {
    const filter = teile[0]!;
    const eintraege: SlashEintrag[] = [];
    const gesamt = eventZeiten(event);
    if (enthaelt('gesamt eventzeit', filter)) {
      eintraege.push(
        weiter('dienst-gesamt', 'Gesamt (Eventzeit)', spanneText(gesamt), 'dienst gesamt › '),
      );
    }
    const spanne = zeitspanneParsen(filter);
    if (spanne) {
      eintraege.push(
        weiter(
          'dienst-spanne',
          spanneText(spanne),
          'Von–bis',
          `dienst ${spanne.beginnZeit}-${spanne.endeZeit} › `,
        ),
      );
    }
    // The time spans of the Schichten the event already has.
    const gesehen = new Set<string>([spanneText(gesamt)]);
    if (spanne) gesehen.add(spanneText(spanne));
    for (const s of event.schichten) {
      const text = spanneText(s);
      if (gesehen.has(text) || !enthaelt(text, filter)) continue;
      gesehen.add(text);
      eintraege.push(
        weiter(
          `dienst-schicht-${text}`,
          text,
          'Zeit einer Schicht',
          `dienst ${s.beginnZeit}-${s.endeZeit} › `,
        ),
      );
    }
    if (filter !== '' && !spanne && (eintraege.length === 0 || /\d/.test(filter))) {
      // Harmless when chosen: the typed text stays as it is.
      eintraege.push(
        weiter(
          'dienst-zeit-hinweis',
          'Uhrzeit eingeben',
          'z. B. 18-22 oder 18:30-22',
          `dienst ${filter}`,
        ),
      );
    }
    return eintraege;
  }

  const zeitText = teile[0]!;
  const zeiten = zeitText === 'gesamt' ? null : zeitspanneParsen(zeitText);
  if (zeitText !== 'gesamt' && !zeiten) return [];

  if (teile.length === 2) {
    const { name: filter, zahlen } = dienstZahlenTrennen(teile[1]!);
    const zusatz = zahlen ? ` ${zahlen.text}` : '';
    const zusatzTitel = zahlen ? ` · ${zahlenText(zahlen)}` : '';
    const benutzt = new Set(
      event.schichten.flatMap((s) =>
        s.art === 'betrieb' ? s.bedarfe.map((b) => b.dienstformId) : [],
      ),
    );
    // Dienstformen the event already uses first, then the others.
    const geordnet = [...dienstformen].sort(
      (a, b) => Number(benutzt.has(b.id)) - Number(benutzt.has(a.id)),
    );
    const eintraege: SlashEintrag[] = [];
    for (const d of geordnet) {
      if (!enthaelt(d.name, filter)) continue;
      eintraege.push(
        weiter(
          `dienst-form-${d.id}`,
          `${d.name}${zusatzTitel}`,
          'Dienstform',
          `dienst ${zeitText} › ${normalisieren(d.name)}${zusatz} › `,
        ),
      );
    }
    for (const [schluessel, titel] of [
      ['~aufbau', 'Aufbau'],
      ['~putzen', 'Putzen'],
    ] as const) {
      if (enthaelt(titel, filter)) {
        eintraege.push(
          weiter(
            `dienst-${schluessel}`,
            `${titel}${zusatzTitel}`,
            'Schicht',
            `dienst ${zeitText} › ${schluessel}${zusatz} › `,
          ),
        );
      }
    }
    return eintraege;
  }

  const { name: dienstText, zahlen } = dienstZahlenTrennen(teile[1]!);
  const dienst =
    dienstText in DIENST_ART
      ? DIENST_ART[dienstText as keyof typeof DIENST_ART]
      : dienstformen.find((d) => normalisieren(d.name) === dienstText)?.id;
  if (!dienst) return [];
  const filter = teile.slice(2).join(' ').trim();
  const basis: DienstEingabe = {
    zeiten,
    dienst,
    sub: null,
    ...(zahlen ? { minimum: zahlen.minimum, wunsch: zahlen.wunsch } : {}),
  };
  const bisher = new Set(dienstPersonen(event, basis));
  const zahlenTitel = zahlen ? ` (${zahlenText(zahlen)})` : '';
  // The typed text after an insert: the same stage again (an extra space makes the menu refresh).
  const zurueck = `dienst ${zeitText} › ${teile[1]!} › `;
  const eintrag = (
    schluessel: string,
    titel: string,
    beschreibung: string,
    symbol: SlashSymbol,
    sub: string | null,
  ): SlashEintrag => ({
    schluessel,
    titel,
    beschreibung,
    symbol,
    aktion: { art: 'dienst', eingabe: { ...basis, sub }, weiter: sub ? zurueck : undefined },
  });
  const eintraege: SlashEintrag[] = [];
  if (bisher.size > 0 && filter === '') {
    eintraege.push({
      schluessel: 'dienst-fertig',
      titel: 'Fertig',
      beschreibung: 'Eingabe beenden',
      symbol: 'ohne',
      aktion: { art: 'dienst', eingabe: null },
    });
  }
  if (bisher.size === 0 && enthaelt('ohne personen', filter)) {
    eintraege.push(
      eintrag(
        'dienst-ohne',
        'Ohne Personen',
        `Nur den Dienst eintragen${zahlenTitel}`,
        'ohne',
        null,
      ),
    );
  }
  for (const p of personen) {
    if (p.extern || !p.sub || bisher.has(p.sub)) continue;
    if (!enthaelt(`${p.titel} ${p.beschreibung}`, filter)) continue;
    eintraege.push(eintrag(`dienst-person-${p.sub}`, p.titel, p.beschreibung, 'person', p.sub));
  }
  return eintraege;
}

/** `bar 2` / `bar 2/3` typed in the Dienst stage: the name and the counts (minimum, wunsch). */
interface DienstZahlen {
  minimum: number;
  wunsch: number | undefined;
  /** As typed in the menu text (`2` or `2/3`). */
  text: string;
}

function dienstZahlenTrennen(text: string): { name: string; zahlen: DienstZahlen | null } {
  const t = /^(.*?)\s+(\d{1,2})(?:\s*\/\s*(\d{1,2}))?$/.exec(text);
  if (!t) return { name: text, zahlen: null };
  const minimum = Number(t[2]);
  const wunsch = t[3] === undefined ? undefined : Number(t[3]);
  return {
    name: t[1]!.trim(),
    zahlen: { minimum, wunsch, text: wunsch === undefined ? `${minimum}` : `${minimum}/${wunsch}` },
  };
}

const zahlenText = (z: DienstZahlen): string =>
  z.wunsch === undefined || z.wunsch === z.minimum
    ? `${z.minimum} Personen`
    : `min. ${z.minimum}, Wunsch ${z.wunsch}`;

/** Second stage of "Zitat": as a paragraph (the default) or inside the text. */
export function zitatEintraege(filter: string): SlashEintrag[] {
  const alle: SlashEintrag[] = [
    {
      schluessel: 'zitat-absatz',
      titel: 'Als Absatz',
      beschreibung: 'Der Absatz wird ein Zitat',
      symbol: 'zitat',
      aktion: { art: 'zitat' },
    },
    {
      schluessel: 'zitat-im-text',
      titel: 'Im Text',
      beschreibung: 'Wörtliches Zitat mitten im Satz („…“)',
      symbol: 'zitat',
      aktion: { art: 'zitat', imText: true },
    },
  ];
  return alle.filter((e) => enthaelt(e.titel, filter));
}

/** All items for what was typed after the "/". */
export function slashEintraege(
  query: string,
  daten: SlashDaten,
  ohneVerschachtelt = false,
  ohneNurInNotizen = false,
  kontext: SlashKontext = {},
): SlashEintrag[] {
  const { stufe, filter } = slashStufe(query);
  if (stufe === 'vorlagen') return vorlageEintraege(daten.vorlagen, filter);
  if (stufe === 'abstimmung') return ohneVerschachtelt ? [] : abstimmungEintraege(filter);
  if (stufe === 'events') return vergangenesEintraege(daten.vergangene, filter);
  if (stufe === 'zitat') return zitatEintraege(filter);
  if (stufe === 'dienst') {
    return kontext.event && !kontext.eventIstTeilnahme
      ? dienstEintraege(filter, kontext.event, daten.dienstformen ?? [], daten.personen ?? [])
      : [];
  }
  if (stufe === 'erscheint' || stufe === 'geht') {
    return personEintraege(
      stufe,
      daten.personen ?? [],
      filter,
      daten.uhrzeit?.() ?? '',
      slashRohFilter(query),
    );
  }
  return bausteinEintraege(filter, ohneVerschachtelt, ohneNurInNotizen, kontext);
}

/**
 * Highlighted row after the suggestion list was updated: back to the first match whenever the query
 * or the list of entries changed, otherwise kept (within bounds).
 */
export function auswahlNachAenderung(
  alt: { query: string; schluessel: readonly string[] } | null,
  neu: { query: string; schluessel: readonly string[] } | null,
  auswahl: number,
): number {
  if (!neu || neu.schluessel.length === 0) return 0;
  const gleich =
    alt !== null &&
    alt.query === neu.query &&
    alt.schluessel.length === neu.schluessel.length &&
    alt.schluessel.every((s, i) => s === neu.schluessel[i]);
  if (!gleich) return 0;
  return Math.min(Math.max(0, auswahl), neu.schluessel.length - 1);
}
