import {
  anwesenheitsVerlauf,
  bausteinAnwesenheitDatenSchema,
  bausteinAufnahmeDatenSchema,
  bausteinBeschlussDatenSchema,
  bausteinMeinungsbildDatenSchema,
  bausteinTodoDatenSchema,
  bausteinEmDatenSchema,
  bausteinAuswahlDatenSchema,
  bausteinWahlDatenSchema,
  type BausteinWahlDaten,
  auswahlErgebnis,
  wahlErgebnis,
  wahlRunden,
  anwesenheitsZeitText,
  anwesenheitsZeiten,
  teilnahmeMitBloecken,
  teilnahmeNormalisiert,
  heuteBerlin,
  datumAnzeigen,
  datumBerlin,
  zeitBerlin,
  type BausteinEmAbstimmung,
  type Beschlussfaehigkeit,
  type MitgliedStatus,
  type ProtokollArt,
  type ProtokollDokument,
  type ProtokollDto,
  type ProtokollKnoten,
  type ProtokollKopf,
  type ProtokollNaechsteSitzungVorschlag,
  type ProtokollTeilnahmeWert,
  type TodoZustaendig,
  type Wiederholung,
} from '@c4/shared';
import type { KategorieNamen } from './kategorieNamen';
import { wiederholungText, type WiederholungArt } from './wiederholungText';

// Pure derivation of the finished document ("Dokument" view) of the minutes: header lines, opening
// sentence, quorum texts. Rendering lives in ProtokollDokumentAnsicht.tsx.

export interface DokumentEingabe {
  inhalt: ProtokollDokument;
  kopf: ProtokollKopf;
  teilnahme: ProtokollDto['teilnahme'];
  ems: ProtokollDto['ems'];
  sitzung: { titel: string; beginn: string; art: ProtokollArt };
  /** The calendar's suggestion for the next Sitzung (counts while `kopf.naechsteSitzung` is null). */
  naechsteSitzungVorschlag?: ProtokollNaechsteSitzungVorschlag | null;
  /** All members, to resolve @mentions of people who are not in the lists above (e.g. Externe). */
  mitglieder?: readonly Namen[];
  /** Image URLs by key (the PDF gets data URLs of the images that could be loaded; missing = not available). */
  bilder?: Readonly<Record<string, string>>;
  /** An image of the view failed to load (expired URL?): the page fetches fresh URLs. */
  bilderErneuern?: () => void;
  /** Kategorie names for the headings of Event / Vergangenes Event (without: no Kategorie in the heading). */
  kategorien?: KategorieNamen;
  /** The viewer (current status): @mentions that concern them are highlighted. Not set for the PDF. */
  ich?: { sub: string; status: MitgliedStatus } | null;
}

/** The next Sitzung that counts: Berlin date, time ('' = unknown) and the calendar event, if any. */
export interface NaechsteSitzungWert {
  eventId: string | null;
  datum: string;
  uhrzeit: string;
}

/**
 * The next Sitzung: the Kopf's override if there is one (null without a date), else the calendar's
 * suggestion. Null = nothing known.
 */
export function naechsteSitzungWert(
  kopf: Pick<ProtokollKopf, 'naechsteSitzung'>,
  vorschlag: ProtokollNaechsteSitzungVorschlag | null | undefined,
): NaechsteSitzungWert | null {
  const von = kopf.naechsteSitzung;
  if (von) return von.datum ? { ...von } : null;
  if (!vorschlag) return null;
  return {
    eventId: vorschlag.eventId,
    datum: datumBerlin(vorschlag.beginn),
    uhrzeit: zeitBerlin(vorschlag.beginn),
  };
}

/** `Dienstag, 11.11.2026` of a Berlin date `YYYY-MM-DD`. */
export function datumMitWochentag(datum: string): string {
  const [j, m, t] = datum.split('-');
  const wochentag = new Date(`${datum}T12:00:00Z`).toLocaleDateString('de-DE', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return `${wochentag}, ${t}.${m}.${j}`;
}

/** Closing sentence: "Die nächste Sitzung findet am Dienstag, 11.11.2026 um 20:00 Uhr statt."; null if unknown. */
export function naechsteSitzungSatz(wert: NaechsteSitzungWert | null): string | null {
  if (!wert?.datum) return null;
  const um = wert.uhrzeit ? ` um ${wert.uhrzeit} Uhr` : '';
  return `Die nächste Sitzung findet am ${datumMitWochentag(wert.datum)}${um} statt.`;
}

/** A member as shown in the document (`StatusName`), with an optional note like "(ab 21:00 Uhr)". */
export interface Person {
  sub: string;
  name: string;
  status: MitgliedStatus;
  zusatz: string;
}

export interface Namen {
  sub: string;
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
}

export const personName = (m: Pick<Namen, 'username' | 'vorname' | 'nachname'>): string =>
  m.username ?? (`${m.vorname} ${m.nachname}`.trim() || '–');

const person = (m: Namen, zusatz = ''): Person => ({
  sub: m.sub,
  name: personName(m),
  status: m.status,
  zusatz,
});

/** Everybody who can be looked up by `sub` in the document: attendance list, EMs, then all members. */
export const alleMitglieder = (
  e: Pick<DokumentEingabe, 'teilnahme' | 'ems' | 'mitglieder'>,
): readonly Namen[] => [...e.teilnahme, ...e.ems, ...(e.mitglieder ?? [])];

/** `30.01.2024` (Berlin) of an ISO instant. */
export function datumLang(beginn: string): string {
  const [j, m, t] = heuteBerlin(new Date(beginn)).split('-');
  return `${t}.${m}.${j}`;
}

export const dokumentTitel = (s: { titel: string; beginn: string }): string =>
  `${s.titel} ${datumLang(s.beginn)}`.trim();

/**
 * Applies the live Kopf to the lists of a draft (a draft follows the Sitzung unless overridden; a
 * closed protocol is frozen and used as delivered).
 */
export function mitLiveKopf(
  dto: Pick<ProtokollDto, 'teilnahme' | 'ems' | 'status'>,
  kopf: ProtokollKopf,
): Pick<ProtokollDto, 'teilnahme' | 'ems'> {
  if (dto.status !== 'entwurf') return { teilnahme: dto.teilnahme, ems: dto.ems };
  return {
    teilnahme: dto.teilnahme.map((t) => ({
      ...t,
      wert: teilnahmeNormalisiert(kopf.teilnahme[t.sub] ?? t.abgeleitet),
    })),
    ems: dto.ems.map((e) => ({
      ...e,
      ausgewaehlt: kopf.ems === null ? e.abgeleitet : kopf.ems.includes(e.sub),
    })),
  };
}

export interface DokumentKopfDaten {
  titel: string;
  anwesende: Person[];
  entschuldigt: Person[];
  unentschuldigt: Person[];
  ems: Person[];
  emsFreitext: string;
  anwaerter: Person[];
  gaeste: string;
  leitung: Person | null;
  protokoll: Person | null;
  eroeffnung: string | null;
  beschlussfaehigkeit: Beschlussfaehigkeit | null;
}

export function dokumentKopf(e: DokumentEingabe): DokumentKopfDaten {
  const zeiten = anwesenheitsZeiten(e.inhalt);
  // Old `verspaetet` and people with an Erscheint / Geht block count as "da".
  const teilnahme = teilnahmeMitBloecken(e.teilnahme, e.inhalt);
  const zusatz = (t: { sub: string }): string => {
    const text = anwesenheitsZeitText(zeiten[t.sub], ' Uhr');
    return text ? `(${text})` : '';
  };
  const da = teilnahme.filter((t) => t.wert === 'anwesend');
  const mitglieder = (liste: typeof teilnahme) =>
    liste.filter((t) => t.status === 'mitglied').map((t) => person(t, zusatz(t)));
  const fehlend = (wert: ProtokollTeilnahmeWert) => teilnahme.filter((t) => t.wert === wert);

  const alle: Namen[] = [...e.teilnahme, ...e.ems];
  const finde = (sub: string | null): Person | null => {
    const m = sub === null ? undefined : alle.find((x) => x.sub === sub);
    return m ? person(m) : null;
  };
  const verlauf = anwesenheitsVerlauf(e.inhalt, {
    art: e.sitzung.art,
    teilnahme,
    ems: e.ems.filter((m) => m.ausgewaehlt),
  });

  return {
    titel: dokumentTitel(e.sitzung),
    anwesende: mitglieder(da),
    entschuldigt: mitglieder(fehlend('entschuldigt')),
    unentschuldigt: mitglieder(fehlend('unentschuldigt')),
    ems: e.ems.filter((m) => m.ausgewaehlt).map((m) => person(m)),
    emsFreitext: e.kopf.emsFreitext.trim(),
    anwaerter: da.filter((t) => t.status === 'anwaerter').map((t) => person(t, zusatz(t))),
    gaeste: e.kopf.gaeste.trim(),
    leitung: finde(e.kopf.sitzungsleitung),
    protokoll: finde(e.kopf.protokollfuehrung),
    eroeffnung: e.kopf.eroeffnung || null,
    beschlussfaehigkeit: verlauf.start.gesamt > 0 ? verlauf.start : null,
  };
}

export const sitzungsWort = (art: ProtokollArt): string =>
  art === 'mitgliederversammlung' ? 'Mitgliederversammlung' : 'Sitzung';

/**
 * Opening sentence. With a chair the name comes first (rendered by the caller), so this
 * returns only the rest: " eröffnet die Sitzung um 20:04 Uhr.". Returns null if nothing is set.
 */
export function eroeffnungSatz(
  art: ProtokollArt,
  hatLeitung: boolean,
  uhrzeit: string | null,
): string | null {
  const wort = sitzungsWort(art);
  const um = uhrzeit ? ` um ${uhrzeit} Uhr` : '';
  if (hatLeitung) return ` eröffnet die ${wort}${um}.`;
  if (uhrzeit) return `Die ${wort} wird um ${uhrzeit} Uhr eröffnet.`;
  return null;
}

const mehrAls = (art: ProtokollArt) =>
  art === 'mitgliederversammlung' ? 'mehr als zwei Drittel' : 'mehr als die Hälfte';

/** "13 von 25 Mitgliedern anwesend". */
export const anwesendText = (b: Beschlussfaehigkeit): string =>
  `${b.anwesend} von ${b.gesamt} Mitgliedern anwesend`;

/** Quorum line at the opening: the facts and the verdict (shown in red if not beschlussfähig). */
export function beschlussfaehigkeitText(
  art: ProtokollArt,
  b: Beschlussfaehigkeit,
): { fakten: string; urteil: string } {
  return {
    fakten: `Beschlussfähigkeit: ${anwesendText(b)}, nötig sind mindestens ${b.mindestens} (${mehrAls(art)}).`,
    urteil: `Die ${sitzungsWort(art)} ist ${b.beschlussfaehig ? '' : 'nicht '}beschlussfähig.`,
  };
}

export interface AnwesenheitZeile {
  /** Name of the person (to render with `StatusName`); the sentence is `vor` + name + `nach`. */
  sub: string;
  nach: string;
  /** Second line if the quorum changed. */
  wechsel: string | null;
  wechselBeschlussfaehig: boolean;
}

/** Text for a `bausteinAnwesenheit`: " erscheint um 21:00 Uhr." / " geht um 22:10 Uhr."; null without a person. */
export function anwesenheitZeile(
  daten: unknown,
  art: ProtokollArt,
  stand: (Beschlussfaehigkeit & { wechsel: boolean }) | undefined,
): AnwesenheitZeile | null {
  const d = bausteinAnwesenheitDatenSchema.safeParse(daten);
  if (!d.success || d.data.sub === null) return null;
  const verb = d.data.art === 'erscheint' ? 'erscheint' : 'geht';
  const um = d.data.uhrzeit ? ` um ${d.data.uhrzeit} Uhr` : '';
  let wechsel: string | null = null;
  if (stand?.wechsel) {
    wechsel = stand.beschlussfaehig
      ? `Die ${sitzungsWort(art)} ist jetzt beschlussfähig (${anwesendText(stand)}).`
      : `Die ${sitzungsWort(art)} ist nicht mehr beschlussfähig (${anwesendText(stand)}).`;
  }
  return {
    sub: d.data.sub,
    nach: ` ${verb}${um}.`,
    wechsel,
    wechselBeschlussfaehig: stand?.beschlussfaehig ?? true,
  };
}

/** "Ja 8 · Nein 3 · Enthaltung 2 – angenommen". */
export function stimmenText(a: BausteinEmAbstimmung): string {
  const ergebnis = a.ergebnis
    ? ` – ${a.ergebnis === 'angenommen' ? 'angenommen' : 'abgelehnt'}`
    : '';
  return `Ja ${a.ja} · Nein ${a.nein} · Enthaltung ${a.enthaltung}${ergebnis}`;
}

/** "Wiederholung der Abstimmung vom 05.11.2026 (Sitzung), damals nicht beschlussfähig." or '' */
const wiederholungZeile = (art: WiederholungArt, w: Wiederholung | undefined): string =>
  w ? wiederholungText(art, w) : '';

export interface BeschlussZeilen {
  /** Hint when the vote repeats one of the previous Sitzung, else '' */
  wiederholung: string;
  antrag: string;
  stimmen: string;
  /** "(13 von 25 Mitgliedern anwesend)" or '' */
  anwesend: string;
  nichtBeschlussfaehig: boolean;
}

export function beschlussZeilen(
  daten: unknown,
  stand: Beschlussfaehigkeit | undefined,
): BeschlussZeilen {
  const d = bausteinBeschlussDatenSchema.safeParse(daten);
  const b = d.success ? d.data : null;
  return {
    wiederholung: wiederholungZeile('Abstimmung', b?.wiederholung),
    antrag: b?.antrag.trim() ?? '',
    stimmen: b ? stimmenText(b) : '',
    anwesend: stand ? `(${anwesendText(stand)})` : '',
    nichtBeschlussfaehig: stand !== undefined && !stand.beschlussfaehig,
  };
}

export interface AufnahmeZeilen {
  wiederholung: string;
  /** Free-text name (used when the Baustein has no `sub`), trimmed. */
  name: string;
  sub: string | null;
  /** Same lines as the vote of an Abstimmung. */
  stimmen: string;
  /** "(13 von 25 Mitgliedern anwesend)" or '' */
  anwesend: string;
  nichtBeschlussfaehig: boolean;
}

/** Lines of a `bausteinAufnahme` (the vote is always there). */
export function aufnahmeZeilen(
  daten: unknown,
  stand: Beschlussfaehigkeit | undefined,
): AufnahmeZeilen {
  const d = bausteinAufnahmeDatenSchema.safeParse(daten);
  return {
    wiederholung: wiederholungZeile(
      'Aufnahme-Abstimmung',
      d.success ? d.data.wiederholung : undefined,
    ),
    name: d.success ? d.data.name.trim() : '',
    sub: d.success ? d.data.sub : null,
    stimmen: d.success ? stimmenText(d.data.abstimmung) : '',
    anwesend: stand ? `(${anwesendText(stand)})` : '',
    nichtBeschlussfaehig: stand !== undefined && !stand.beschlussfaehig,
  };
}

export interface MeinungsbildZeilen {
  frage: string;
  /** "Ja 4 · Nein 3 · Enthaltung 2" (options without a text left out) or '' */
  optionen: string;
}

/** Lines of a `bausteinMeinungsbild`. */
export function meinungsbildZeilen(daten: unknown): MeinungsbildZeilen {
  const d = bausteinMeinungsbildDatenSchema.safeParse(daten);
  if (!d.success) return { frage: '', optionen: '' };
  return {
    frage: d.data.frage.trim(),
    optionen: d.data.optionen
      .filter((o) => o.text.trim() !== '')
      .map((o) => `${o.text.trim()} ${o.stimmen}`)
      .join(' · '),
  };
}

/** The line of a `bausteinTodo`: "Todo: Titel – Anna, @Alle (bis 14.11.2026)". */
export interface TodoZeile {
  titel: string;
  zustaendig: TodoZustaendig[];
  /** "14.11.2026"; '' without a deadline. */
  bis: string;
}

export function todoZeile(daten: unknown): TodoZeile {
  const d = bausteinTodoDatenSchema.safeParse(daten);
  if (!d.success) return { titel: '', zustaendig: [], bis: '' };
  return {
    titel: d.data.titel.trim(),
    zustaendig: d.data.zustaendig,
    bis: d.data.faelligAm ? datumAnzeigen(d.data.faelligAm) : '',
  };
}

export interface WahlKandidat {
  id: string;
  sub: string | null;
  /** Free-text name (used when there is no `sub`), trimmed. */
  name: string;
  stimmen: number;
}

export interface WahlZeilen {
  wiederholung: string;
  posten: string;
  /** "2 Plätze"; '' for a single seat */
  plaetze: string;
  kandidaten: WahlKandidat[];
  enthaltung: number;
  /** One entry per runoff round that applies. */
  stichwahlen: { kandidaten: WahlKandidat[]; enthaltung: number }[];
  /** "Gilt ab 01.01.2027" or '' while no date is set. */
  giltAb: string;
  /** Elected and accepted. */
  gewaehlt: WahlKandidat[];
  /** Elected but declined. */
  abgelehnt: WahlKandidat[];
  /**
   * Elected and declined candidates together in vote order (the order they would have been elected
   * in had they all accepted); `nimmtAn` is false for a decline.
   */
  reihenfolge: { kandidat: WahlKandidat; nimmtAn: boolean }[];
  /** Proposed persons (subs) who do not run. */
  nichtAngetreten: string[];
  /** A tie is still open: no result yet. */
  offen: boolean;
  /** "(13 von 25 Mitgliedern anwesend)" or '' */
  anwesend: string;
  nichtBeschlussfaehig: boolean;
}

/** Ids in vote order: main-round votes, then the runoff rounds in turn (descending); stable otherwise. */
function stimmenReihenfolge(w: BausteinWahlDaten, ids: readonly string[]): string[] {
  const nachId = new Map(w.kandidaten.map((k) => [k.id, k]));
  const stimmen = (id: string, runde: number) =>
    runde < 0 ? (nachId.get(id)?.stimmen ?? 0) : (w.stichwahlen[runde]?.stimmen[id] ?? 0);
  return [...ids].sort((a, b) => {
    for (let r = -1; r < w.stichwahlen.length; r++) {
      const d = stimmen(b, r) - stimmen(a, r);
      if (d !== 0) return d;
    }
    return 0;
  });
}

/** A sentence of the Wahl text: a run of elected persons or one person who declined. */
export type WahlAbschnitt =
  { art: 'gewaehlt'; personen: WahlKandidat[] } | { art: 'abgelehnt'; person: WahlKandidat };

/**
 * The Wahl text in vote order: consecutive elected persons form one "Gewählt: A, B, A nimmt die
 * Wahl an, B nimmt die Wahl an." sentence, each decliner "Y nimmt die Wahl nicht an." at its place.
 * While a tie is open the elected are not stated, only the declines.
 */
export function wahlAbschnitte(z: Pick<WahlZeilen, 'reihenfolge' | 'offen'>): WahlAbschnitt[] {
  const aus: WahlAbschnitt[] = [];
  for (const { kandidat, nimmtAn } of z.reihenfolge) {
    if (!nimmtAn) {
      aus.push({ art: 'abgelehnt', person: kandidat });
    } else if (!z.offen) {
      const letzter = aus.at(-1);
      if (letzter?.art === 'gewaehlt') letzter.personen.push(kandidat);
      else aus.push({ art: 'gewaehlt', personen: [kandidat] });
    }
  }
  return aus;
}

/** Lines of a `bausteinWahl`; null when the data are invalid. */
export function wahlZeilen(
  daten: unknown,
  stand: Beschlussfaehigkeit | undefined,
): WahlZeilen | null {
  const d = bausteinWahlDatenSchema.safeParse(daten);
  if (!d.success) return null;
  const w = d.data;
  const ergebnis = wahlErgebnis(w);
  const kandidat = (k: (typeof w.kandidaten)[number], stimmen: number): WahlKandidat => ({
    id: k.id,
    sub: k.sub,
    name: k.name.trim(),
    stimmen,
  });
  const nachId = new Map(w.kandidaten.map((k) => [k.id, k]));
  const von = (id: string, stimmen: number): WahlKandidat[] => {
    const k = nachId.get(id);
    return k ? [kandidat(k, stimmen)] : [];
  };
  return {
    wiederholung: wiederholungZeile('Wahl', w.wiederholung),
    posten: w.posten.trim(),
    plaetze: w.anzahl === 1 ? '' : `${w.anzahl} Plätze`,
    kandidaten: w.kandidaten.map((k) => kandidat(k, k.stimmen)),
    enthaltung: w.enthaltung,
    stichwahlen: wahlRunden(w).map((r, i) => ({
      kandidaten: r.kandidaten.flatMap((id) => von(id, w.stichwahlen[i]!.stimmen[id] ?? 0)),
      enthaltung: w.stichwahlen[i]!.enthaltung,
    })),
    giltAb: w.gueltigAb ? `Gilt ab ${datumAnzeigen(w.gueltigAb)}` : '',
    gewaehlt: ergebnis.gewaehlt.flatMap((id) => von(id, 0)),
    abgelehnt: ergebnis.abgelehnt.flatMap((id) => von(id, 0)),
    reihenfolge: stimmenReihenfolge(w, [...ergebnis.gewaehlt, ...ergebnis.abgelehnt]).flatMap(
      (id) =>
        von(id, 0).map((kandidat) => ({ kandidat, nimmtAn: !ergebnis.abgelehnt.includes(id) })),
    ),
    nichtAngetreten: w.nichtAngetreten,
    offen: ergebnis.offen !== null,
    anwesend: stand ? `(${anwesendText(stand)})` : '',
    nichtBeschlussfaehig: stand !== undefined && !stand.beschlussfaehig,
  };
}

export interface AuswahlZeilen {
  wiederholung: string;
  frage: string;
  /** "Anzahl zu wählen: 2" or '' for a single winner. */
  anzahl: string;
  /** "A 5 · B 3 · Enthaltung 1" (an option without text is "–"), '' without options. */
  moeglichkeiten: string;
  /** One line per runoff round that applies: "B 4 · C 2 · Enthaltung 0". */
  stichwahlen: string[];
  /** "A, B" (names of the winners), '' while undecided. */
  ergebnis: string;
  /** A tie is still open: no result yet. */
  offen: boolean;
  /** "(13 von 25 Mitgliedern anwesend)" or '' */
  anwesend: string;
  nichtBeschlussfaehig: boolean;
}

/** Lines of a `bausteinAuswahl`; null when the data are invalid. */
export function auswahlZeilen(
  daten: unknown,
  stand: Beschlussfaehigkeit | undefined,
): AuswahlZeilen | null {
  const d = bausteinAuswahlDatenSchema.safeParse(daten);
  if (!d.success) return null;
  const a = d.data;
  const ergebnis = auswahlErgebnis(a);
  const text = (t: string): string => t.trim() || '–';
  const nachId = new Map(a.optionen.map((o) => [o.id, o]));
  const zeile = (eintraege: { text: string; stimmen: number }[], enthaltung: number): string =>
    [...eintraege.map((e) => `${text(e.text)} ${e.stimmen}`), `Enthaltung ${enthaltung}`].join(
      ' · ',
    );
  return {
    wiederholung: wiederholungZeile('Abstimmung', a.wiederholung),
    frage: a.frage.trim(),
    anzahl: a.anzahl === 1 ? '' : `Anzahl zu wählen: ${a.anzahl}`,
    moeglichkeiten: a.optionen.length > 0 ? zeile(a.optionen, a.enthaltung) : '',
    stichwahlen: ergebnis.runden.map((r, i) =>
      zeile(
        r.kandidaten.flatMap((id) => {
          const o = nachId.get(id);
          return o ? [{ text: o.text, stimmen: a.stichwahlen[i]!.stimmen[id] ?? 0 }] : [];
        }),
        a.stichwahlen[i]!.enthaltung,
      ),
    ),
    ergebnis: ergebnis.gewaehlt
      .flatMap((id) => nachId.get(id) ?? [])
      .map((o) => text(o.text))
      .join(', '),
    offen: ergebnis.offen !== null,
    anwesend: stand ? `(${anwesendText(stand)})` : '',
    nichtBeschlussfaehig: stand !== undefined && !stand.beschlussfaehig,
  };
}

export interface EmZeilen {
  wiederholung: string;
  /** Free-text name (used when the Baustein has no `sub`), trimmed. */
  name: string;
  sub: string | null;
  /** Person (sub) who moves the vote; null without a vote or when not set. */
  antragSub: string | null;
  /** "Abstimmung: Ja 8 · Nein 3 · Enthaltung 2 – angenommen (13 von 25 Mitgliedern anwesend)" or '' without a vote. */
  abstimmung: string;
  nichtBeschlussfaehig: boolean;
}

/** Lines of a `bausteinEm`; the vote line only exists when there is a vote. */
export function emZeilen(daten: unknown, stand: Beschlussfaehigkeit | undefined): EmZeilen {
  const d = bausteinEmDatenSchema.safeParse(daten);
  if (!d.success) {
    return {
      wiederholung: '',
      name: '',
      sub: null,
      antragSub: null,
      abstimmung: '',
      nichtBeschlussfaehig: false,
    };
  }
  const { sub, name, abstimmung: a } = d.data;
  const anwesend = stand ? ` (${anwesendText(stand)})` : '';
  return {
    wiederholung: wiederholungZeile('Abstimmung', d.data.wiederholung),
    name: name.trim(),
    sub,
    antragSub: a ? (d.data.antragSub ?? null) : null,
    abstimmung: a ? `Abstimmung: ${stimmenText(a)}${anwesend}` : '',
    nichtBeschlussfaehig: a !== null && stand !== undefined && !stand.beschlussfaehig,
  };
}

/** A paragraph without text (no content, or only whitespace / hard breaks). */
export function istLeererAbsatz(k: ProtokollKnoten): boolean {
  return (
    k.type === 'paragraph' &&
    (k.content ?? []).every((c) => c.type === 'hardBreak' || (c.type === 'text' && !c.text?.trim()))
  );
}

/** A bullet / ordered list whose items hold nothing but empty paragraphs (e.g. the initial empty bullet). */
export function istLeereListe(k: ProtokollKnoten): boolean {
  return (
    (k.type === 'bulletList' || k.type === 'orderedList') &&
    (k.content ?? []).every((item) =>
      (item.content ?? []).every((c) => istLeererAbsatz(c) || istLeereListe(c)),
    )
  );
}

/** A list item of empty paragraphs only (no text, no sub list, no Baustein): never shown as a bullet. */
export function istLeererPunkt(k: ProtokollKnoten): boolean {
  const kinder = k.content ?? [];
  return k.type === 'listItem' && kinder.every(istLeererAbsatz);
}

/**
 * A list item that only carries a block: an empty first paragraph, then a Baustein or quote (a block
 * inserted into the first item of a nested list). Shown without bullet and without the empty line.
 */
export function istBlockPunkt(k: ProtokollKnoten): boolean {
  const [erstes, zweites] = k.content ?? [];
  return (
    k.type === 'listItem' &&
    !!erstes &&
    istLeererAbsatz(erstes) &&
    !!zweites &&
    zweites.type !== 'paragraph' &&
    zweites.type !== 'bulletList' &&
    zweites.type !== 'orderedList'
  );
}

const istLeer = (k: ProtokollKnoten): boolean => istLeererAbsatz(k) || istLeereListe(k);

/**
 * The nodes without trailing empty paragraphs / empty lists and without leading empty lists (the empty
 * bullet a Baustein starts with). Leading empty paragraphs stay.
 */
export function ohneLeereEnden(knoten: readonly ProtokollKnoten[] | undefined): ProtokollKnoten[] {
  const liste = [...(knoten ?? [])];
  while (liste.length > 0 && istLeer(liste[liste.length - 1]!)) liste.pop();
  while (liste.length > 0 && istLeereListe(liste[0]!)) liste.shift();
  return liste;
}

/** Text of a node tree. */
export function knotenText(k: ProtokollKnoten): string {
  return k.text ?? (k.content ?? []).map(knotenText).join('');
}

/** An attribution line in a quote ("— Strobi"): starts with a dash. */
export const istQuellenzeile = (k: ProtokollKnoten): boolean =>
  k.type === 'paragraph' && /^\s*[–—-]/.test(knotenText(k));

/**
 * File name offered when printing the minutes to PDF ("YYYY-MM-DD_Sitzungsname"): browsers take it from
 * the page title, which also becomes the PDF's title. Characters not allowed in file names are dropped.
 */
export function druckTitel(sitzung: { titel: string; beginn: string }): string {
  const name = sitzung.titel
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // No trailing dot: "Sitzung 04.11." would end up as "….pdf" with two dots.
    .replace(/[.\s]+$/, '');
  return name ? `${datumBerlin(sitzung.beginn)}_${name}` : datumBerlin(sitzung.beginn);
}
