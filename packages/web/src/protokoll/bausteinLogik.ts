import {
  BAUSTEIN_TODO_MAX_ZUSTAENDIG,
  ERWAEHNUNG_GRUPPEN,
  bausteinErzeugen,
  beschlussErgebnisVorschlag,
  AUSWAHL_MAX_OPTIONEN,
  auswahlErgebnis,
  auswahlRunden,
  MEINUNGSBILD_MAX_OPTIONEN,
  protokollDokumentNormalisieren,
  WAHL_MAX_ANZAHL,
  WAHL_MAX_KANDIDATEN,
  WAHL_MAX_STICHWAHLEN,
  wahlErgebnis,
  wahlRunden,
  type BausteinAuswahlDaten,
  type BausteinBeschlussDaten,
  type BausteinMeinungsbildDaten,
  type BausteinWahlDaten,
  type BausteinEventDaten,
  type BausteinTodoDaten,
  type BausteinTyp,
  type EventArt,
  type EventDauer,
  eventUeberschrift,
  eventZeitenAus,
  type EventDto,
  type EventKategorieDto,
  type ProtokollKalenderEvent,
  type ProtokollDokument,
  type ProtokollKnoten,
  type TodoZustaendig,
  type VorlageDto,
  type BausteinSchicht,
  type BausteinVergangenesEventDaten,
  type VorlageSchicht,
} from '@c4/shared';
import { tageDazu } from '../kalenderZeit';

// Pure helpers behind the Baustein forms and the slash menu (no TipTap, no React), so they can be
// unit-tested without a DOM.

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

export const istZeit = (wert: string): boolean => ZEIT.test(wert);

/** Vorlage Schichten as Baustein Schichten: nobody entered yet. */
export const schichtenMitPersonen = (schichten: readonly VorlageSchicht[]): BausteinSchicht[] =>
  schichten.map((s) =>
    s.art === 'betrieb'
      ? { ...s, bedarfe: s.bedarfe.map((b) => ({ ...b, personen: [] })) }
      : { ...s, personen: [] },
  );

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
    schichten: kategorie?.art === 'teilnahme' ? [] : schichtenMitPersonen(kopie(vorlage.schichten)),
    verantwortlichSub: null,
    eventId: null,
    kategorieId: vorlage.kategorieId ?? null,
    teilnahmeStatus: null,
    eingeladen: [],
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

/** The "Bis" date is offered for multi-day Kategorien and while no Kategorie is chosen. */
export const eventZeigtBis = (dauer: EventDauer | undefined): boolean => dauer !== 'eintaegig';

/**
 * Sets the Kategorie; a single-day Kategorie has no last day, so `bisDatum` is dropped. A `teilnahme`
 * Kategorie has no Dienste (`schichten` cleared), one with Dienste no participation circle and invitations.
 */
export function eventKategorieSetzen(
  daten: BausteinEventDaten,
  kategorieId: string | null,
  dauer: EventDauer | undefined,
  art?: EventArt,
): BausteinEventDaten {
  const neu = { ...daten, kategorieId, ...(eventZeigtBis(dauer) ? {} : { bisDatum: null }) };
  if (art === 'teilnahme') return { ...neu, schichten: [] };
  if (art === 'dienste') return { ...neu, teilnahmeStatus: null, eingeladen: [] };
  return neu;
}

/** Option label of a calendar event: the same "25. – 30.11. PP Name" as the headings. */
export function kalenderEventLabel(
  e: Pick<EventDto, 'anzeigeTitel' | 'beginn' | 'ende' | 'dauer' | 'kategorie'>,
): string {
  const zeiten = eventZeitenAus(e.dauer, e.beginn, e.ende);
  return eventUeberschrift({
    name: e.anzeigeTitel,
    datum: zeiten.datum,
    bisDatum: zeiten.bis,
    kategorie: e.kategorie?.name,
  });
}

/** Fields of a Vergangenes Event Baustein from a calendar event (name, first and last day). */
export function vergangenesAusKalender(
  e: Pick<EventDto, 'id' | 'anzeigeTitel' | 'beginn' | 'ende' | 'dauer'>,
): BausteinVergangenesEventDaten {
  const zeiten = eventZeitenAus(e.dauer, e.beginn, e.ende);
  return {
    eventId: e.id,
    name: e.anzeigeTitel,
    datum: zeiten.datum,
    bisDatum: zeiten.bis > zeiten.datum ? zeiten.bis : null,
  };
}

/** First day of a Vergangenes Event; a last day before it is pulled along. */
export function vergangenesDatumSetzen(
  daten: BausteinVergangenesEventDaten,
  datum: string | null,
): BausteinVergangenesEventDaten {
  const bis = daten.bisDatum && datum && daten.bisDatum < datum ? datum : daten.bisDatum;
  return { ...daten, datum, bisDatum: bis };
}

/** Last day of a Vergangenes Event (only without a calendar link); never before the first day. */
export function vergangenesBisSetzen(
  daten: BausteinVergangenesEventDaten,
  bis: string | null,
): BausteinVergangenesEventDaten {
  if (!bis || (daten.datum && bis <= daten.datum)) return { ...daten, bisDatum: null };
  return { ...daten, bisDatum: bis };
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
  s: BausteinSchicht,
  feld: 'beginnZeit' | 'endeZeit',
  eingabe: string,
): BausteinSchicht {
  return istZeit(eingabe) ? { ...s, [feld]: eingabe } : s;
}

/**
 * New head count of a Betrieb Bedarf: minimum at least 1, wunsch at least the minimum (the other one
 * is pulled along).
 */
export function bedarfSetzen(
  s: BausteinSchicht,
  index: number,
  neu: { minimum?: number; wunsch?: number },
): BausteinSchicht {
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
  s: BausteinSchicht,
  neu: { minimum?: number; wunsch?: number },
): BausteinSchicht {
  if (s.art === 'betrieb') return s;
  let { minimum, wunsch } = s;
  if (neu.minimum !== undefined && ganz(neu.minimum)) minimum = Math.max(0, neu.minimum);
  if (neu.wunsch !== undefined && ganz(neu.wunsch)) wunsch = Math.max(1, neu.wunsch);
  if (neu.minimum !== undefined && minimum > wunsch) wunsch = minimum;
  if (neu.wunsch !== undefined) minimum = Math.min(minimum, wunsch);
  return { ...s, minimum, wunsch };
}

/** Most Schichten an Event Baustein holds (`bausteinEventDatenSchema`). */
export const MAX_SCHICHTEN = 20;

/** Most persons of one Dienst (`schichtPersonenSchema`). */
const MAX_PERSONEN_DIENST = 50;

/** Times of a new Schicht when the event has none (all-day Kategorie, nothing entered yet). */
const STANDARD_BEGINN = '18:00';
const STANDARD_ENDE = '22:00';

/**
 * A new Schicht of the given art with the event's times (else 18:00-22:00). A Betrieb starts with
 * one Bedarf for `dienstformId` (1/1); Aufbau/Putzen with 1/2 on the event day.
 */
export function schichtNeu(
  art: BausteinSchicht['art'],
  zeiten: { beginnZeit: string | null; endeZeit: string | null },
  dienstformId: string,
): BausteinSchicht {
  const beginnZeit =
    zeiten.beginnZeit && istZeit(zeiten.beginnZeit) ? zeiten.beginnZeit : STANDARD_BEGINN;
  const endeZeit = zeiten.endeZeit && istZeit(zeiten.endeZeit) ? zeiten.endeZeit : STANDARD_ENDE;
  if (art === 'betrieb') {
    return {
      art,
      beginnZeit,
      endeZeit,
      bedarfe: [{ dienstformId, minimum: 1, wunsch: 1, personen: [] }],
    };
  }
  return { art, beginnZeit, endeZeit, tagVersatz: 0, minimum: 1, wunsch: 2, personen: [] };
}

/** A Betrieb Schicht with one more Bedarf (1/1) for a Dienstform it does not have yet. */
export function bedarfHinzufuegen(s: BausteinSchicht, dienstformId: string): BausteinSchicht {
  if (s.art !== 'betrieb' || s.bedarfe.some((b) => b.dienstformId === dienstformId)) return s;
  return { ...s, bedarfe: [...s.bedarfe, { dienstformId, minimum: 1, wunsch: 1, personen: [] }] };
}

/** A Betrieb Schicht without the Bedarf at `index`; the last Bedarf stays (a Betrieb needs one). */
export function bedarfEntfernen(s: BausteinSchicht, index: number): BausteinSchicht {
  if (s.art !== 'betrieb' || s.bedarfe.length <= 1) return s;
  return { ...s, bedarfe: s.bedarfe.filter((_, i) => i !== index) };
}

/** "Betrieb 20:00–04:00" for the title of a Schicht. */
export function schichtTitel(s: Pick<BausteinSchicht, 'art' | 'beginnZeit' | 'endeZeit'>): string {
  const art = s.art === 'betrieb' ? 'Betrieb' : s.art === 'aufbau' ? 'Aufbau' : 'Putzen';
  return `${art} ${s.beginnZeit}–${s.endeZeit}`;
}

/** One line for the read-only view: "Betrieb 20:00–04:00 · Bar 2/3, Kasse 1/1" or "Aufbau 16:00–18:00 · 2/4". */
export function schichtKurz(s: BausteinSchicht, dienstformName: (id: string) => string): string {
  const kopf = schichtTitel(s);
  if (s.art === 'betrieb') {
    return `${kopf} · ${s.bedarfe.map((b) => `${dienstformName(b.dienstformId)} ${b.minimum}/${b.wunsch}`).join(', ')}`;
  }
  return `${kopf} · ${s.minimum}/${s.wunsch}`;
}

/** Persons entered for a Bedarf of a Betrieb (`index`) or for an Aufbau/Putzen Schicht (`index` ignored). */
export function schichtPersonen(s: BausteinSchicht, index = 0): readonly string[] {
  return s.art === 'betrieb' ? (s.bedarfe[index]?.personen ?? []) : s.personen;
}

/** The persons of a Bedarf (Betrieb) or of the Schicht (Aufbau/Putzen) replaced. */
export function schichtPersonenSetzen(
  s: BausteinSchicht,
  index: number,
  personen: readonly string[],
): BausteinSchicht {
  const neu = [...new Set(personen)];
  if (s.art !== 'betrieb') return { ...s, personen: neu };
  return { ...s, bedarfe: s.bedarfe.map((b, i) => (i === index ? { ...b, personen: neu } : b)) };
}

/** Whole days from `von` to `bis` (both `YYYY-MM-DD`); negative when `bis` is earlier. */
export const tageZwischen = (von: string, bis: string): number =>
  Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000);

/** The new `tagVersatz` of an Aufbau/Putzen Schicht for a chosen date (kept within the schema's range). */
export function tagVersatzFuerDatum(eventDatum: string, datum: string): number {
  return Math.max(-365, Math.min(365, tageZwischen(eventDatum, datum)));
}

// ---------------------------------------------------------------------------------------------
// /dienst: enter a Dienst into the surrounding Event block
// ---------------------------------------------------------------------------------------------

/** `H`, `HH`, `H:MM`, `HH:MM`, `H.MM` or `HHMM` as `HH:MM`; null when it is no time. */
function zeitAusText(text: string): string | null {
  const t = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(text.trim()) ?? /^(\d{2})(\d{2})$/.exec(text.trim());
  if (!t) return null;
  const zeit = `${t[1]!.padStart(2, '0')}:${t[2] ?? '00'}`;
  return istZeit(zeit) ? zeit : null;
}

/** A time span typed after /dienst ("18-22", "18:00 - 22:30", "18 bis 22") as `HH:MM`; null if it is none. */
export function zeitspanneParsen(text: string): { beginnZeit: string; endeZeit: string } | null {
  const teile = /^\s*([\d:.]+)\s*(?:-|–|—|bis)\s*([\d:.]+)\s*$/.exec(text);
  if (!teile) return null;
  const beginnZeit = zeitAusText(teile[1]!);
  const endeZeit = zeitAusText(teile[2]!);
  return beginnZeit && endeZeit ? { beginnZeit, endeZeit } : null;
}

/** The times of the whole event for a Schicht (the event's own, else 18:00-22:00). */
export function eventZeiten(daten: Pick<BausteinEventDaten, 'beginnZeit' | 'endeZeit'>): {
  beginnZeit: string;
  endeZeit: string;
} {
  return {
    beginnZeit: daten.beginnZeit && istZeit(daten.beginnZeit) ? daten.beginnZeit : STANDARD_BEGINN,
    endeZeit: daten.endeZeit && istZeit(daten.endeZeit) ? daten.endeZeit : STANDARD_ENDE,
  };
}

/** What /dienst enters: the whole event time (`null`) or a span, into a Dienstform or Aufbau/Putzen. */
export interface DienstEingabe {
  /** `null` = the times of the event. */
  zeiten: { beginnZeit: string; endeZeit: string } | null;
  /** A `dienstformId`, or `aufbau` / `putzen`. */
  dienst: string;
  /** The person to enter, `null` = only the Dienst without a person. */
  sub: string | null;
}

/** The Dienst as the Event block holds it afterwards; `null` when it does not fit (too many Schichten, persons). */
export function dienstEintragen(
  daten: BausteinEventDaten,
  eingabe: DienstEingabe,
): BausteinEventDaten | null {
  const art: BausteinSchicht['art'] =
    eingabe.dienst === 'aufbau' || eingabe.dienst === 'putzen' ? eingabe.dienst : 'betrieb';
  const zeiten = eingabe.zeiten ?? eventZeiten(daten);
  const index = daten.schichten.findIndex(
    (s) => s.art === art && s.beginnZeit === zeiten.beginnZeit && s.endeZeit === zeiten.endeZeit,
  );
  let schicht: BausteinSchicht;
  if (index >= 0) {
    schicht = daten.schichten[index]!;
  } else {
    if (daten.schichten.length >= MAX_SCHICHTEN) return null;
    schicht = schichtNeu(art, zeiten, art === 'betrieb' ? eingabe.dienst : '');
  }
  const mit = (personen: readonly string[]): readonly string[] =>
    eingabe.sub && !personen.includes(eingabe.sub) ? [...personen, eingabe.sub] : personen;

  let neu: BausteinSchicht;
  if (schicht.art === 'betrieb') {
    const vorhanden = schicht.bedarfe.some((b) => b.dienstformId === eingabe.dienst);
    const mitBedarf = vorhanden ? schicht : bedarfHinzufuegen(schicht, eingabe.dienst);
    if (mitBedarf.art !== 'betrieb') return null;
    neu = {
      ...mitBedarf,
      bedarfe: mitBedarf.bedarfe.map((b) => {
        if (b.dienstformId !== eingabe.dienst) return b;
        const personen = mit(b.personen);
        const n = Math.max(1, personen.length);
        return {
          ...b,
          personen: [...personen],
          // A new Bedarf starts at the head count; an existing one only grows when it must.
          minimum: vorhanden ? Math.max(b.minimum, n) : n,
          wunsch: vorhanden ? Math.max(b.wunsch, n) : n,
        };
      }),
    };
  } else {
    const personen = mit(schicht.personen);
    const n = Math.max(1, personen.length);
    const neuAngelegt = index < 0;
    neu = {
      ...schicht,
      personen: [...personen],
      minimum: neuAngelegt ? n : Math.max(schicht.minimum, n),
      wunsch: neuAngelegt ? n : Math.max(schicht.wunsch, n),
    };
  }
  const bedarf =
    neu.art === 'betrieb' ? neu.bedarfe.findIndex((b) => b.dienstformId === eingabe.dienst) : 0;
  if (schichtPersonen(neu, bedarf).length > MAX_PERSONEN_DIENST) return null;
  const schichten =
    index >= 0 ? daten.schichten.map((s, i) => (i === index ? neu : s)) : [...daten.schichten, neu];
  return { ...daten, schichten };
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
    annahme: Object.fromEntries(Object.entries(daten.annahme).filter(([k]) => k !== id)),
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

/** The persons proposed who do not run (duplicates dropped, at most `WAHL_MAX_KANDIDATEN`). */
export function nichtAngetretenSetzen(
  daten: BausteinWahlDaten,
  subs: readonly string[],
): BausteinWahlDaten {
  return { ...daten, nichtAngetreten: [...new Set(subs)].slice(0, WAHL_MAX_KANDIDATEN) };
}

/** Whether the elected candidate accepts; a decline is stored as `false`, accepting removes the entry. */
export function annahmeSetzen(
  daten: BausteinWahlDaten,
  id: string,
  nimmtAn: boolean,
): BausteinWahlDaten {
  const rest = Object.fromEntries(Object.entries(daten.annahme).filter(([k]) => k !== id));
  return { ...daten, annahme: nimmtAn ? rest : { ...rest, [id]: false } };
}

/** A vote with runoffs: the Wahl or the Auswahl (they share seats, votes per person and runoff rounds). */
type MehrfachDaten = BausteinWahlDaten | BausteinAuswahlDaten;

const ergebnisVon = (daten: MehrfachDaten) =>
  'optionen' in daten ? auswahlErgebnis(daten) : wahlErgebnis(daten);

/**
 * Candidates to show an acceptance switch for (elected or declined), in the order of the candidates.
 * The order must not depend on the result: toggling a switch moves the candidate between elected and
 * declined, and a switch that moves in the DOM loses its focus.
 */
export function annahmeSchalterIds(daten: BausteinWahlDaten): string[] {
  const { gewaehlt, abgelehnt } = wahlErgebnis(daten);
  const mit = new Set([...gewaehlt, ...abgelehnt]);
  return daten.kandidaten.filter((k) => mit.has(k.id)).map((k) => k.id);
}

/** Number of seats, at least 1 (and at most the schema's maximum). */
export function wahlAnzahlSetzen<T extends MehrfachDaten>(daten: T, anzahl: number): T {
  if (!ganz(anzahl) || anzahl < 1 || anzahl > WAHL_MAX_ANZAHL) return daten;
  return { ...daten, anzahl };
}

/** Sets the votes each present member has; out-of-range values leave the Wahl as it is. */
export function wahlStimmenProPersonSetzen<T extends MehrfachDaten>(
  daten: T,
  stimmenProPerson: number,
): T {
  if (!ganz(stimmenProPerson) || stimmenProPerson < 1 || stimmenProPerson > WAHL_MAX_ANZAHL) {
    return daten;
  }
  return { ...daten, stimmenProPerson };
}

/** Appends the runoff round the tie needs (nothing when no round is needed or one is there already). */
export function stichwahlHinzufuegen<T extends MehrfachDaten>(daten: T): T {
  const offen = ergebnisVon(daten).offen;
  if (!offen || offen.rundeVorhanden || daten.stichwahlen.length >= WAHL_MAX_STICHWAHLEN) {
    return daten;
  }
  return { ...daten, stichwahlen: [...daten.stichwahlen, { stimmen: {}, enthaltung: 0 }] };
}

/** Removes the runoff round `index` and all after it (they depend on it). */
export function stichwahlEntfernen<T extends MehrfachDaten>(daten: T, index: number): T {
  return { ...daten, stichwahlen: daten.stichwahlen.slice(0, index) };
}

/** Votes (`id`) or Enthaltung (`'enthaltung'`) in runoff round `index`; invalid counts are ignored. */
export function stichwahlSetzen<T extends MehrfachDaten>(
  daten: T,
  index: number,
  feld: string,
  wert: number,
): T {
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
export function ueberzaehligeStichwahlenEntfernen<T extends MehrfachDaten>(daten: T): T {
  const runden = 'optionen' in daten ? auswahlRunden(daten) : wahlRunden(daten);
  return stichwahlEntfernen(daten, runden.length);
}

// ---------------------------------------------------------------------------------------------
// Auswahl
// ---------------------------------------------------------------------------------------------

/** A new empty option at the end (at most `AUSWAHL_MAX_OPTIONEN`). */
export function auswahlOptionHinzufuegen(
  daten: BausteinAuswahlDaten,
  id: string = globalThis.crypto.randomUUID(),
): BausteinAuswahlDaten {
  if (daten.optionen.length >= AUSWAHL_MAX_OPTIONEN) return daten;
  return { ...daten, optionen: [...daten.optionen, { id, text: '', stimmen: 0 }] };
}

/** Removes an option, also from the runoff rounds. */
export function auswahlOptionEntfernen(
  daten: BausteinAuswahlDaten,
  id: string,
): BausteinAuswahlDaten {
  return {
    ...daten,
    optionen: daten.optionen.filter((o) => o.id !== id),
    stichwahlen: daten.stichwahlen.map((r) => ({
      ...r,
      stimmen: Object.fromEntries(Object.entries(r.stimmen).filter(([k]) => k !== id)),
    })),
  };
}

/** Changes text or votes of one option; a negative or fractional count is ignored. */
export function auswahlOptionSetzen(
  daten: BausteinAuswahlDaten,
  id: string,
  neu: { text?: string; stimmen?: number },
): BausteinAuswahlDaten {
  if (neu.stimmen !== undefined && (!ganz(neu.stimmen) || neu.stimmen < 0)) return daten;
  return {
    ...daten,
    optionen: daten.optionen.map((o) => (o.id === id ? { ...o, ...neu } : o)),
  };
}

// ---------------------------------------------------------------------------------------------
// Todo
// ---------------------------------------------------------------------------------------------

/** Select value of a Zuständige:r: `p:<sub>` for a person, `g:<gruppe>` for a group. */
export const todoZustaendigWert = (z: TodoZustaendig): string =>
  z.art === 'person' ? `p:${z.sub}` : `g:${z.gruppe}`;

/** The Zuständige:r of a select value, null if invalid. */
export function todoZustaendigAusWert(wert: string): TodoZustaendig | null {
  const gruppe = ERWAEHNUNG_GRUPPEN.find((g) => wert === `g:${g}`);
  if (gruppe) return { art: 'gruppe', gruppe };
  if (wert.startsWith('p:') && wert.length > 2) return { art: 'person', sub: wert.slice(2) };
  return null;
}

/** Sets the Zuständigen from select values (invalid and duplicate ones dropped, at most `BAUSTEIN_TODO_MAX_ZUSTAENDIG`). */
export function todoZustaendigSetzen(daten: BausteinTodoDaten, werte: string[]): BausteinTodoDaten {
  const gesehen = new Set<string>();
  const zustaendig: TodoZustaendig[] = [];
  for (const w of werte) {
    const z = todoZustaendigAusWert(w);
    if (!z || gesehen.has(w) || zustaendig.length >= BAUSTEIN_TODO_MAX_ZUSTAENDIG) continue;
    gesehen.add(w);
    zustaendig.push(z);
  }
  return { ...daten, zustaendig };
}

/** Whether exactly one person (and no group) is zuständig: "Abhaken" is moot then. */
export const todoNurEinePerson = (zustaendig: readonly TodoZustaendig[]): boolean =>
  zustaendig.length === 1 && zustaendig[0]!.art === 'person';

// ---------------------------------------------------------------------------------------------
// Focus after inserting
// ---------------------------------------------------------------------------------------------

export type FokusZiel =
  | 'name'
  | 'datum'
  | 'kalender'
  | 'titel'
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
      return leer('eventId')
        ? 'kalender'
        : leer('name')
          ? 'name'
          : leer('datum')
            ? 'datum'
            : 'text';
    case 'bausteinMerker':
      return 'text';
    case 'bausteinThema':
    case 'bausteinTodo':
      return leer('titel') ? 'titel' : 'text';
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
    case 'bausteinAuswahl':
      return leer('frage') ? 'frage' : 'text';
    case 'bausteinWahl':
      return leer('posten') ? 'posten' : 'text';
    case 'bausteinAnwesenheit':
      return leer('sub') ? 'person' : 'nach';
  }
}

/** Free text of a new Baustein: Event, Thema and Vergangenes Event start with an empty bullet list. */
export function notizenVorlage(typ: BausteinTyp): ProtokollKnoten[] {
  if (
    typ === 'bausteinEvent' ||
    typ === 'bausteinThema' ||
    typ === 'bausteinVergangenesEvent' ||
    typ === 'bausteinTodo'
  ) {
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
