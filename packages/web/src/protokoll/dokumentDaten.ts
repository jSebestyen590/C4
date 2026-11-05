import {
  anwesenheitsVerlauf,
  bausteinAnwesenheitDatenSchema,
  bausteinBeschlussDatenSchema,
  bausteinEmDatenSchema,
  erscheintUhrzeiten,
  heuteBerlin,
  type Beschlussfaehigkeit,
  type MitgliedStatus,
  type ProtokollArt,
  type ProtokollDokument,
  type ProtokollDto,
  type ProtokollKnoten,
  type ProtokollKopf,
  type ProtokollTeilnahmeWert,
} from '@c4/shared';

// Pure derivation of the finished document ("Dokument" view) of the minutes: header lines, opening
// sentence, quorum texts. Rendering lives in ProtokollDokumentAnsicht.tsx.

export interface DokumentEingabe {
  inhalt: ProtokollDokument;
  kopf: ProtokollKopf;
  teilnahme: ProtokollDto['teilnahme'];
  ems: ProtokollDto['ems'];
  sitzung: { titel: string; beginn: string; art: ProtokollArt };
}

/** A member as shown in the document (`StatusName`), with an optional note like "(21:00 Uhr)". */
export interface Person {
  sub: string;
  name: string;
  status: MitgliedStatus;
  zusatz: string;
}

interface Namen {
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
    teilnahme: dto.teilnahme.map((t) => ({ ...t, wert: kopf.teilnahme[t.sub] ?? t.abgeleitet })),
    ems: dto.ems.map((e) => ({
      ...e,
      ausgewaehlt: kopf.ems === null ? e.abgeleitet : kopf.ems.includes(e.sub),
    })),
  };
}

/** Members with an `erscheint` Baustein (also without a time). */
export function erscheintSubs(dokument: ProtokollKnoten): Set<string> {
  const subs = new Set<string>();
  const gehe = (k: ProtokollKnoten) => {
    if (k.type === 'bausteinAnwesenheit') {
      const d = bausteinAnwesenheitDatenSchema.safeParse(k.attrs?.daten);
      if (d.success && d.data.art === 'erscheint' && d.data.sub !== null) subs.add(d.data.sub);
    }
    k.content?.forEach(gehe);
  };
  gehe(dokument);
  return subs;
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

const WERT_DA: ProtokollTeilnahmeWert[] = ['anwesend', 'verspaetet'];

export function dokumentKopf(e: DokumentEingabe): DokumentKopfDaten {
  const erscheint = erscheintSubs(e.inhalt);
  const zeiten = erscheintUhrzeiten(e.inhalt);
  const kamSpaeter = (t: DokumentEingabe['teilnahme'][number]) =>
    t.wert === 'verspaetet' || (!WERT_DA.includes(t.wert) && erscheint.has(t.sub));
  const zusatz = (t: DokumentEingabe['teilnahme'][number]): string => {
    if (!kamSpaeter(t)) return '';
    const zeit = e.kopf.verspaetung[t.sub] || zeiten[t.sub];
    return zeit ? `(${zeit} Uhr)` : '(verspätet)';
  };
  const da = e.teilnahme.filter((t) => WERT_DA.includes(t.wert) || erscheint.has(t.sub));
  const mitglieder = (liste: typeof e.teilnahme) =>
    liste.filter((t) => t.status === 'mitglied').map((t) => person(t, zusatz(t)));
  const fehlend = (wert: ProtokollTeilnahmeWert) =>
    e.teilnahme.filter((t) => t.wert === wert && !erscheint.has(t.sub));

  const alle: Namen[] = [...e.teilnahme, ...e.ems];
  const finde = (sub: string | null): Person | null => {
    const m = sub === null ? undefined : alle.find((x) => x.sub === sub);
    return m ? person(m) : null;
  };
  const verlauf = anwesenheitsVerlauf(e.inhalt, { art: e.sitzung.art, teilnahme: e.teilnahme });

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

export interface BeschlussZeilen {
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
  const ergebnis = b?.ergebnis
    ? ` – ${b.ergebnis === 'angenommen' ? 'angenommen' : 'abgelehnt'}`
    : '';
  return {
    antrag: b?.antrag.trim() ?? '',
    stimmen: b ? `Ja ${b.ja} · Nein ${b.nein} · Enthaltung ${b.enthaltung}${ergebnis}` : '',
    anwesend: stand ? `(${anwesendText(stand)})` : '',
    nichtBeschlussfaehig: stand !== undefined && !stand.beschlussfaehig,
  };
}

export interface EmZeilen {
  /** Free-text name (used when the Baustein has no `sub`), trimmed. */
  name: string;
  sub: string | null;
  /** "Abstimmung: Ja 8 · Nein 3 · Enthaltung 2 – angenommen (13 von 25 Mitgliedern anwesend)" or '' without a vote. */
  abstimmung: string;
  nichtBeschlussfaehig: boolean;
}

/** Lines of a `bausteinEm`; the vote line only exists when there is a vote. */
export function emZeilen(daten: unknown, stand: Beschlussfaehigkeit | undefined): EmZeilen {
  const d = bausteinEmDatenSchema.safeParse(daten);
  if (!d.success) return { name: '', sub: null, abstimmung: '', nichtBeschlussfaehig: false };
  const { sub, name, abstimmung: a } = d.data;
  const ergebnis = a?.ergebnis
    ? ` – ${a.ergebnis === 'angenommen' ? 'angenommen' : 'abgelehnt'}`
    : '';
  const anwesend = stand ? ` (${anwesendText(stand)})` : '';
  return {
    name: name.trim(),
    sub,
    abstimmung: a
      ? `Abstimmung: Ja ${a.ja} · Nein ${a.nein} · Enthaltung ${a.enthaltung}${ergebnis}${anwesend}`
      : '',
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

/** The nodes without trailing empty paragraphs. */
export function ohneLeereEnden(knoten: readonly ProtokollKnoten[] | undefined): ProtokollKnoten[] {
  const liste = [...(knoten ?? [])];
  while (liste.length > 0 && istLeererAbsatz(liste[liste.length - 1]!)) liste.pop();
  return liste;
}

/** Text of a node tree. */
export function knotenText(k: ProtokollKnoten): string {
  return k.text ?? (k.content ?? []).map(knotenText).join('');
}

/** An attribution line in a quote ("— Strobi"): starts with a dash. */
export const istQuellenzeile = (k: ProtokollKnoten): boolean =>
  k.type === 'paragraph' && /^\s*[–—-]/.test(knotenText(k));
