import {
  bausteinErzeugen,
  beschlussErgebnisVorschlag,
  MEINUNGSBILD_MAX_OPTIONEN,
  protokollDokumentNormalisieren,
  WAHL_MAX_ANZAHL,
  WAHL_MAX_KANDIDATEN,
  WAHL_MAX_STICHWAHLEN,
  wahlErgebnis,
  type BausteinBeschlussDaten,
  type BausteinMeinungsbildDaten,
  type BausteinWahlDaten,
  type BausteinEventDaten,
  type BausteinTyp,
  type EventDauer,
  type EventDto,
  type EventKategorieDto,
  type ProtokollKalenderEvent,
  type ProtokollDokument,
  type ProtokollKnoten,
  type VorlageDto,
  type VorlageSchicht,
} from '@c4/shared';
import { tageDazu } from '../kalenderZeit';

// Pure helpers behind the Baustein forms and the slash menu (no TipTap, no React), so they can be
// unit-tested without a DOM.

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

export const istZeit = (wert: string): boolean => ZEIT.test(wert);

const kopie = <T>(wert: T): T => JSON.parse(JSON.stringify(wert)) as T;

// ---------------------------------------------------------------------------------------------
// Event Baustein: from a Vorlage
// ---------------------------------------------------------------------------------------------

/**
 * Fields of a new Event Baustein from a Vorlage: name, times and Schichten are copied, the date stays
 * empty. Whole-day Kategorien have no times; `teilnahme` Kategorien have no Schichten (as `ausVorlage`).
 */
export function eventDatenAusVorlage(
  vorlage: Pick<VorlageDto, 'id' | 'beginnZeit' | 'endeZeit' | 'schichten'> &
    Partial<Pick<VorlageDto, 'kategorieId'>>,
  kategorie: Pick<EventKategorieDto, 'art' | 'dauer'> | undefined,
  titel: string,
): BausteinEventDaten {
  const ganztaegig = kategorie?.dauer === 'ganztaegig';
  return {
    vorlageId: vorlage.id,
    name: titel,
    datum: null,
    bisDatum: null,
    beginnZeit: ganztaegig ? null : vorlage.beginnZeit,
    endeZeit: ganztaegig ? null : vorlage.endeZeit,
    schichten: kategorie?.art === 'teilnahme' ? [] : kopie(vorlage.schichten),
    verantwortlichSub: null,
    eventId: null,
    kategorieId: vorlage.kategorieId ?? null,
  };
}

/**
 * Sets the date. For multi-day and whole-day events the last day follows (`tage` days from the Vorlage)
 * unless the chosen last day is still valid (not before the date).
 */
export function eventDatumSetzen(
  daten: BausteinEventDaten,
  datum: string | null,
  dauer: EventDauer,
  tage: number,
): BausteinEventDaten {
  if (!datum)
    return { ...daten, datum: null, bisDatum: dauer === 'eintaegig' ? null : daten.bisDatum };
  if (dauer === 'eintaegig') return { ...daten, datum };
  const bis = daten.bisDatum && daten.bisDatum >= datum ? daten.bisDatum : null;
  return { ...daten, datum, bisDatum: bis ?? tageDazu(datum, Math.max(1, tage) - 1) };
}

/** Last day; never before the date. */
export function eventBisSetzen(daten: BausteinEventDaten, bis: string | null): BausteinEventDaten {
  if (!bis) return { ...daten, bisDatum: null };
  if (daten.datum && bis < daten.datum) return { ...daten, bisDatum: daten.datum };
  return { ...daten, bisDatum: bis };
}

/** `HH:MM` or empty (= none); anything else leaves the fields unchanged. */
export function zeitWert(eingabe: string): string | null | undefined {
  if (eingabe === '') return null;
  return istZeit(eingabe) ? eingabe : undefined;
}

// ---------------------------------------------------------------------------------------------
// Event Baustein: Schichten (only ever produce values `vorlageSchichtSchema` accepts)
// ---------------------------------------------------------------------------------------------

const ganz = (n: number): boolean => Number.isInteger(n);

/** A Schicht with a new begin or end time; invalid times are ignored. */
export function schichtZeitSetzen(
  s: VorlageSchicht,
  feld: 'beginnZeit' | 'endeZeit',
  eingabe: string,
): VorlageSchicht {
  return istZeit(eingabe) ? { ...s, [feld]: eingabe } : s;
}

/**
 * New head count of a Betrieb Bedarf: minimum at least 1, wunsch at least the minimum (the other one
 * is pulled along).
 */
export function bedarfSetzen(
  s: VorlageSchicht,
  index: number,
  neu: { minimum?: number; wunsch?: number },
): VorlageSchicht {
  if (s.art !== 'betrieb') return s;
  const alt = s.bedarfe[index];
  if (!alt) return s;
  let { minimum, wunsch } = alt;
  if (neu.minimum !== undefined && ganz(neu.minimum)) minimum = Math.max(1, neu.minimum);
  if (neu.wunsch !== undefined && ganz(neu.wunsch)) wunsch = Math.max(1, neu.wunsch);
  if (neu.minimum !== undefined && minimum > wunsch) wunsch = minimum;
  if (neu.wunsch !== undefined) minimum = Math.min(minimum, wunsch);
  return { ...s, bedarfe: s.bedarfe.map((b, i) => (i === index ? { ...b, minimum, wunsch } : b)) };
}

/** New head count of an Aufbau/Putzen Schicht: minimum at least 0, wunsch at least 1 and the minimum. */
export function anzahlSetzen(
  s: VorlageSchicht,
  neu: { minimum?: number; wunsch?: number },
): VorlageSchicht {
  if (s.art === 'betrieb') return s;
  let { minimum, wunsch } = s;
  if (neu.minimum !== undefined && ganz(neu.minimum)) minimum = Math.max(0, neu.minimum);
  if (neu.wunsch !== undefined && ganz(neu.wunsch)) wunsch = Math.max(1, neu.wunsch);
  if (neu.minimum !== undefined && minimum > wunsch) wunsch = minimum;
  if (neu.wunsch !== undefined) minimum = Math.min(minimum, wunsch);
  return { ...s, minimum, wunsch };
}

/** "Betrieb 20:00–04:00" for the title of a Schicht. */
export function schichtTitel(s: Pick<VorlageSchicht, 'art' | 'beginnZeit' | 'endeZeit'>): string {
  const art = s.art === 'betrieb' ? 'Betrieb' : s.art === 'aufbau' ? 'Aufbau' : 'Putzen';
  return `${art} ${s.beginnZeit}–${s.endeZeit}`;
}

/** One line for the read-only view: "Betrieb 20:00–04:00 · Bar 2/3, Kasse 1/1" or "Aufbau 16:00–18:00 · 2/4". */
export function schichtKurz(s: VorlageSchicht, dienstformName: (id: string) => string): string {
  const kopf = schichtTitel(s);
  if (s.art === 'betrieb') {
    return `${kopf} · ${s.bedarfe.map((b) => `${dienstformName(b.dienstformId)} ${b.minimum}/${b.wunsch}`).join(', ')}`;
  }
  return `${kopf} · ${s.minimum}/${s.wunsch}`;
}

// ---------------------------------------------------------------------------------------------
// Beschluss
// ---------------------------------------------------------------------------------------------

/** The vote fields of a Beschluss and of the optional vote of a Neues EM. */
type Stimmen = Pick<BausteinBeschlussDaten, 'ja' | 'nein' | 'enthaltung' | 'ergebnis'>;

/**
 * Sets one vote count. The Ergebnis follows the suggestion (`beschlussErgebnisVorschlag`) as long as the
 * user has not chosen on their own: that is the case when it is empty or equal to what the old votes
 * suggested. A manual choice that differs from the suggestion is kept.
 */
export function stimmeSetzen<T extends Stimmen>(
  daten: T,
  feld: 'ja' | 'nein' | 'enthaltung',
  wert: number,
): T {
  if (!ganz(wert) || wert < 0) return daten;
  const folgt =
    daten.ergebnis === null || daten.ergebnis === beschlussErgebnisVorschlag(daten.ja, daten.nein);
  const neu = { ...daten, [feld]: wert };
  if (!folgt) return neu;
  return { ...neu, ergebnis: beschlussErgebnisVorschlag(neu.ja, neu.nein) ?? daten.ergebnis };
}

// ---------------------------------------------------------------------------------------------
// Meinungsbild
// ---------------------------------------------------------------------------------------------

/** A new empty option at the end (at most `MEINUNGSBILD_MAX_OPTIONEN`). */
export function optionHinzufuegen(daten: BausteinMeinungsbildDaten): BausteinMeinungsbildDaten {
  if (daten.optionen.length >= MEINUNGSBILD_MAX_OPTIONEN) return daten;
  return { ...daten, optionen: [...daten.optionen, { text: '', stimmen: 0 }] };
}

export function optionEntfernen(
  daten: BausteinMeinungsbildDaten,
  index: number,
): BausteinMeinungsbildDaten {
  return { ...daten, optionen: daten.optionen.filter((_, i) => i !== index) };
}

/** Changes the text or the vote count of one option; a negative or fractional count is ignored. */
export function optionSetzen(
  daten: BausteinMeinungsbildDaten,
  index: number,
  neu: { text?: string; stimmen?: number },
): BausteinMeinungsbildDaten {
  if (neu.stimmen !== undefined && (!ganz(neu.stimmen) || neu.stimmen < 0)) return daten;
  return {
    ...daten,
    optionen: daten.optionen.map((o, i) => (i === index ? { ...o, ...neu } : o)),
  };
}

/** "Anwesend: 1 Person" / "Anwesend: 12 Personen (ohne Gäste)" under a Meinungsbild. */
export const personenAnwesendText = (n: number): string =>
  `Anwesend: ${n} ${n === 1 ? 'Person' : 'Personen'} (ohne Gäste)`;

// ---------------------------------------------------------------------------------------------
// Wahl
// ---------------------------------------------------------------------------------------------

/** A new empty candidate at the end (at most `WAHL_MAX_KANDIDATEN`). */
export function kandidatHinzufuegen(
  daten: BausteinWahlDaten,
  id: string = globalThis.crypto.randomUUID(),
): BausteinWahlDaten {
  if (daten.kandidaten.length >= WAHL_MAX_KANDIDATEN) return daten;
  return {
    ...daten,
    kandidaten: [...daten.kandidaten, { id, sub: null, name: '', stimmen: 0 }],
  };
}

/** Removes a candidate, also from the runoff rounds. */
export function kandidatEntfernen(daten: BausteinWahlDaten, id: string): BausteinWahlDaten {
  return {
    ...daten,
    kandidaten: daten.kandidaten.filter((k) => k.id !== id),
    stichwahlen: daten.stichwahlen.map((r) => ({
      ...r,
      stimmen: Object.fromEntries(Object.entries(r.stimmen).filter(([k]) => k !== id)),
    })),
  };
}

/** Changes person, name or votes of one candidate; a negative or fractional count is ignored. */
export function kandidatSetzen(
  daten: BausteinWahlDaten,
  id: string,
  neu: { sub?: string | null; name?: string; stimmen?: number },
): BausteinWahlDaten {
  if (neu.stimmen !== undefined && (!ganz(neu.stimmen) || neu.stimmen < 0)) return daten;
  return {
    ...daten,
    kandidaten: daten.kandidaten.map((k) => (k.id === id ? { ...k, ...neu } : k)),
  };
}

/** Number of seats, at least 1 (and at most the schema's maximum). */
export function wahlAnzahlSetzen(daten: BausteinWahlDaten, anzahl: number): BausteinWahlDaten {
  if (!ganz(anzahl) || anzahl < 1 || anzahl > WAHL_MAX_ANZAHL) return daten;
  return { ...daten, anzahl };
}

/** Sets the votes each present member has; out-of-range values leave the Wahl as it is. */
export function wahlStimmenProPersonSetzen(
  daten: BausteinWahlDaten,
  stimmenProPerson: number,
): BausteinWahlDaten {
  if (!ganz(stimmenProPerson) || stimmenProPerson < 1 || stimmenProPerson > WAHL_MAX_ANZAHL) {
    return daten;
  }
  return { ...daten, stimmenProPerson };
}

/** Appends the runoff round the tie needs (nothing when no round is needed or one is there already). */
export function stichwahlHinzufuegen(daten: BausteinWahlDaten): BausteinWahlDaten {
  const offen = wahlErgebnis(daten).offen;
  if (!offen || offen.rundeVorhanden || daten.stichwahlen.length >= WAHL_MAX_STICHWAHLEN) {
    return daten;
  }
  return { ...daten, stichwahlen: [...daten.stichwahlen, { stimmen: {}, enthaltung: 0 }] };
}

/** Removes the runoff round `index` and all after it (they depend on it). */
export function stichwahlEntfernen(daten: BausteinWahlDaten, index: number): BausteinWahlDaten {
  return { ...daten, stichwahlen: daten.stichwahlen.slice(0, index) };
}

/** Votes (`id`) or Enthaltung (`'enthaltung'`) in runoff round `index`; invalid counts are ignored. */
export function stichwahlSetzen(
  daten: BausteinWahlDaten,
  index: number,
  feld: string,
  wert: number,
): BausteinWahlDaten {
  if (!ganz(wert) || wert < 0 || !daten.stichwahlen[index]) return daten;
  return {
    ...daten,
    stichwahlen: daten.stichwahlen.map((r, i) => {
      if (i !== index) return r;
      return feld === 'enthaltung'
        ? { ...r, enthaltung: wert }
        : { ...r, stimmen: { ...r.stimmen, [feld]: wert } };
    }),
  };
}

/** Drops the stored runoff rounds the result no longer uses (the votes changed so there is no tie). */
export function ueberzaehligeStichwahlenEntfernen(daten: BausteinWahlDaten): BausteinWahlDaten {
  return stichwahlEntfernen(daten, wahlErgebnis(daten).runden.length);
}

// ---------------------------------------------------------------------------------------------
// Focus after inserting
// ---------------------------------------------------------------------------------------------

export type FokusZiel =
  | 'name'
  | 'datum'
  | 'vorname'
  | 'nachname'
  | 'antrag'
  | 'frage'
  | 'posten'
  | 'person'
  /** Into the free text of the Baustein. */
  | 'text'
  /** Behind the Baustein (it is a one-liner, the user continues below it). */
  | 'nach';

/** The first empty field of a new Baustein (`text` = the free text when all fields are filled). */
export function ersterLeererFeld(typ: BausteinTyp, daten: unknown): FokusZiel {
  const d = daten as Record<string, unknown>;
  const leer = (k: string) => d[k] === null || d[k] === undefined || d[k] === '';
  switch (typ) {
    case 'bausteinEvent':
      return leer('name') ? 'name' : leer('datum') ? 'datum' : 'text';
    case 'bausteinVergangenesEvent':
      if (!leer('eventId')) return 'text';
      return leer('name') ? 'name' : leer('datum') ? 'datum' : 'text';
    case 'bausteinAnwaerter':
      return leer('vorname') ? 'vorname' : leer('nachname') ? 'nachname' : 'text';
    case 'bausteinBeschluss':
      return leer('antrag') ? 'antrag' : 'text';
    case 'bausteinEm':
    case 'bausteinAufnahme':
      return leer('sub') && leer('name') ? 'person' : 'text';
    case 'bausteinMeinungsbild':
      return leer('frage') ? 'frage' : 'text';
    case 'bausteinWahl':
      return leer('posten') ? 'posten' : 'text';
    case 'bausteinAnwesenheit':
      return leer('sub') ? 'person' : 'nach';
  }
}

/** Free text of a new Baustein: Event and Vergangenes Event start with an empty bullet list. */
export function notizenVorlage(typ: BausteinTyp): ProtokollKnoten[] {
  if (typ === 'bausteinEvent' || typ === 'bausteinVergangenesEvent') {
    return [
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
    ];
  }
  return [{ type: 'paragraph' }];
}

/** The document node of a new Baustein with its starting free text (none for Anwesenheit). */
export function bausteinNeu(typ: BausteinTyp, daten: unknown): ProtokollKnoten {
  return bausteinErzeugen(typ, daten as never, notizenVorlage(typ));
}

// ---------------------------------------------------------------------------------------------
// Document normalisation
// ---------------------------------------------------------------------------------------------

const TEXTBLOECKE = new Set(['paragraph', 'heading']);

/** Old Anwesenheit blocks stored a (note) paragraph; they have no free text any more. Returns a copy. */
function ohneAnwesenheitText(knoten: ProtokollKnoten): ProtokollKnoten {
  if (knoten.type === 'bausteinAnwesenheit') {
    const rest = { ...knoten };
    delete rest.content;
    return rest;
  }
  return knoten.content ? { ...knoten, content: knoten.content.map(ohneAnwesenheitText) } : knoten;
}

/**
 * The document as the editor needs it: all four sections (an old one gets an empty "Sonstiges"), every section has content, and (when `absatzAmEnde`) ends with a
 * text block, so there is always a place to type after a Baustein. Returns a copy.
 */
export function dokumentNormalisieren(
  dokument: ProtokollDokument,
  absatzAmEnde: boolean,
): ProtokollDokument {
  const abschnitte = protokollDokumentNormalisieren(dokument).content.map(
    (abschnitt): ProtokollKnoten => {
      const inhalt = (abschnitt.content ?? []).map(ohneAnwesenheitText);
      const letzter = inhalt[inhalt.length - 1];
      if (!letzter || (absatzAmEnde && !TEXTBLOECKE.has(letzter.type)))
        inhalt.push({ type: 'paragraph' });
      return { ...abschnitt, content: inhalt };
    },
  );
  return { ...dokument, content: abschnitte };
}

// ---------------------------------------------------------------------------------------------
// Events for the selects
// ---------------------------------------------------------------------------------------------

/** Calendar dates the editor loads events for: ~3 months before the Sitzung to ~6 months after. */
export function ereignisFenster(sitzungDatum: string): { von: string; bis: string } {
  return { von: tageDazu(sitzungDatum, -92), bis: tageDazu(sitzungDatum, 183) };
}

interface EreignisKurz {
  id: string;
  anzeigeTitel: string;
  beginn: string;
  ende: string;
  abgesagt: boolean;
}

/**
 * Past events for "Vergangenes Event": not cancelled, ended before the Sitzung began, newest first.
 * The Sitzung itself is not offered.
 */
export function vergangeneEvents<T extends EreignisKurz>(
  events: readonly T[],
  sitzungBeginn: string,
  sitzungEventId?: string,
): T[] {
  return events
    .filter((e) => !e.abgesagt && e.id !== sitzungEventId && e.ende <= sitzungBeginn)
    .sort((a, b) => (a.beginn < b.beginn ? 1 : a.beginn > b.beginn ? -1 : 0));
}

/** Events from the Sitzung on, for linking an Event Baustein to the calendar (soonest first). */
export function kommendeEvents<T extends EreignisKurz>(
  events: readonly T[],
  sitzungBeginn: string,
): T[] {
  return events
    .filter((e) => !e.abgesagt && e.ende > sitzungBeginn)
    .sort((a, b) => (a.beginn < b.beginn ? -1 : a.beginn > b.beginn ? 1 : 0));
}

/**
 * A calendar event as `eventDatenAusKalender` needs it (the API maps its events the same way for the
 * suggestion). The Sitzung flag is irrelevant there.
 */
export const kalenderEventFuerBaustein = (
  e: Pick<
    EventDto,
    | 'id'
    | 'anzeigeTitel'
    | 'beginn'
    | 'ende'
    | 'abgesagt'
    | 'kategorie'
    | 'dauer'
    | 'serie'
    | 'verantwortlich'
    | 'schichten'
  >,
): ProtokollKalenderEvent => ({
  id: e.id,
  titel: e.anzeigeTitel,
  beginn: e.beginn,
  ende: e.ende,
  abgesagt: e.abgesagt,
  kategorieId: e.kategorie?.id ?? null,
  dauer: e.dauer,
  serie: e.serie,
  sitzung: false,
  verantwortlichSub: e.verantwortlich?.sub ?? null,
  schichten: e.schichten,
});
