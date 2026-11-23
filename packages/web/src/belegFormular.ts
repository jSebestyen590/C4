import {
  BELEG_DATEI_TYPEN,
  belegBerechnen,
  belegPruefen,
  einzelpreisAusGesamt,
  postenZeilenLabel,
  STEUERSATZ_NOTFALL,
  heuteBerlin,
  steuersatzFuerArt,
  steuersatzUmstellen,
  type SteuersatzZeitraum,
  type BelegDatei,
  type BelegDateiTyp,
  type BelegEntwurfDaten,
  type BelegFehler,
  type BelegPosten,
  type BelegPostenArt,
  type BelegModus,
  type KontoDto,
  type StueckelungDto,
  type Zahlweg,
} from '@c4/shared';
import { mengenLeer, mengenStueckelung, stueckelungMengen, type Mengen } from './bargeldFormular';

// Pure logic of the Beleg form: the typed state of the page <-> the draft data of the API, field
// parsing (quantity with comma, file type, hash) and the small helpers around it.

/** One typed item row. `anzahl` is the text as typed ("1,5"); the amount is whole cent. */
export interface PostenZeile {
  /** Stable key for React; not stored. */
  key: string;
  kategorieId: string | null;
  text: string;
  anzahl: string;
  einzelpreisCent: number | null;
  steuersatz: number;
  /**
   * Unrounded price (cent, may have fractions) when the typed price is a calculation like
   * `(7,99 + 4,50)/12` that is no whole cent; null = `einzelpreisCent` is exact. Saved as the exact
   * line total `gesamtCent = round(preisExaktCent * Anzahl)`.
   */
  preisExaktCent: number | null;
  /** The typed calculation of the price (shown again after leaving the field and after a reload); null = plain amount. */
  preisFormel: string | null;
  /** Item kind: Kategorie (Aufwand), Ware (stock) or Leergut (returned empties). */
  art: BelegPostenArt;
  /** Ware items: the Ware, the Gebinde the quantity counts and the deposit per Gebinde (null = none). */
  wareId: string | null;
  gebindeId: string | null;
  pfandCent: number | null;
}

/** Typed correction of one tax rate (cent, both may be empty = 0). */
export interface KorrekturEingabe {
  nettoCent: number | null;
  steuerCent: number | null;
}

export interface BelegFormular {
  rechnungsstellerId: string | null;
  /** `YYYY-MM-DD` or empty. */
  belegdatum: string;
  modus: BelegModus;
  posten: PostenZeile[];
  korrekturen: Record<number, KorrekturEingabe>;
  zahlweg: Zahlweg | null;
  bezahldatum: string;
  fachId: string | null;
  /** Notes handed over (positive counts as typed). */
  gegeben: Mengen;
  /** Change received. */
  wechselgeld: Mengen;
  mitgliedId: string | null;
  eigenbeleg: boolean;
  eigenbelegBegruendung: string;
  datei: BelegDatei | null;
  /** The total printed on the paper Beleg (cent), null while not entered. */
  belegsummeCent: number | null;
  /** Submissions: what the member stated, their free Rechnungssteller name and note. */
  eingereichtBetragCent: number | null;
  rechnungsstellerName: string;
  notiz: string;
}

let zaehler = 0;
const neuerKey = () => `p${++zaehler}`;

export const neuerPosten = (
  steuersatz: number = STEUERSATZ_NOTFALL.regel,
  art: BelegPostenArt = 'ware',
): PostenZeile => ({
  key: neuerKey(),
  kategorieId: null,
  text: '',
  anzahl: '',
  einzelpreisCent: null,
  preisExaktCent: null,
  preisFormel: null,
  steuersatz,
  art,
  wareId: null,
  gebindeId: null,
  pfandCent: null,
});

/** Order of the item kinds in a Beleg (and the three tables of the Finanzer:in form). */
export const POSTEN_REIHENFOLGE: readonly BelegPostenArt[] = ['ware', 'kategorie', 'leergut'];
const rang = (art: BelegPostenArt) => POSTEN_REIHENFOLGE.indexOf(art);

/** Items grouped by kind (Waren, Kategorien, Leergut); stable within a kind. */
export const postenSortieren = <T extends { art: BelegPostenArt }>(posten: readonly T[]): T[] =>
  posten
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rang(a.p.art) - rang(b.p.art) || a.i - b.i)
    .map((x) => x.p);

/** Appends an item at the end of its kind's group (the list stays grouped). */
export function postenHinzufuegen<T extends { art: BelegPostenArt }>(
  posten: readonly T[],
  neu: T,
): T[] {
  const sortiert = postenSortieren(posten);
  let ende = -1;
  sortiert.forEach((p, i) => {
    if (rang(p.art) <= rang(neu.art)) ende = i;
  });
  return [...sortiert.slice(0, ende + 1), neu, ...sortiert.slice(ende + 1)];
}

// ----- Empty rows: every table ends with one empty row that is not part of the Beleg

/**
 * Whether an item row is still empty (not saved, not checked). Ware: no Ware chosen; Kategorie:
 * no Artikel, Kategorie or price; Leergut: no description or price. The preset quantity and tax
 * rate do not count.
 */
export function postenLeer(
  p: Pick<PostenZeile, 'art' | 'wareId' | 'text' | 'kategorieId' | 'einzelpreisCent'>,
): boolean {
  if (p.art === 'ware') return !p.wareId;
  if (p.art === 'kategorie')
    return p.text.trim() === '' && !p.kategorieId && p.einzelpreisCent === null;
  return p.text.trim() === '' && p.einzelpreisCent === null;
}

/**
 * Patch for the price input of a row: the rounded price and, when the typed calculation is no
 * whole cent, the exact one.
 */
export const preisPatch = (
  cent: number | null,
  exaktCent?: number | null,
  formel?: string | null,
): Partial<PostenZeile> => ({
  einzelpreisCent: cent,
  preisFormel: formel || null,
  preisExaktCent: cent !== null && exaktCent != null && exaktCent !== cent ? exaktCent : null,
});

/** The rounded price per piece/Gebinde ("≈ 1,00 € je Stück") when the exact price differs, else null. */
export function einzelpreisHinweis(
  p: Pick<PostenZeile, 'einzelpreisCent' | 'preisExaktCent'>,
): number | null {
  return p.preisExaktCent === null ? null : p.einzelpreisCent;
}

/** Exact line total (cent) of an item with an exact price: `round(preisExakt * Anzahl)`. */
export const gesamtAusExakt = (preisExaktCent: number, anzahlMilli: number): number =>
  Math.round((preisExaktCent * anzahlMilli) / 1000);

/** The filled items in Beleg order (grouped by kind): what is saved, checked and booked. */
export const gefuelltePosten = (posten: readonly PostenZeile[]): PostenZeile[] =>
  postenSortieren(posten).filter((p) => !postenLeer(p));

export interface TabellenZeile {
  p: PostenZeile;
  /** The empty row at the end of the table. */
  leer: boolean;
  /** 1-based position among the filled rows of the table; null for the empty row. */
  nr: number | null;
}

/**
 * Rows of the table of one kind: the filled items, then exactly one empty row. That is the form's
 * last item of the kind when it is empty (a row that was cleared again keeps its place), else the
 * view's own empty row `leere[art]`, which joins the form once something is typed into it.
 */
export function tabellenZeilen(
  posten: readonly PostenZeile[],
  leere: Readonly<Record<BelegPostenArt, PostenZeile>>,
  art: BelegPostenArt,
): TabellenZeile[] {
  const dieser = posten.filter((p) => p.art === art);
  const letzte = dieser.at(-1);
  const leer = letzte && postenLeer(letzte) ? letzte : leere[art];
  return [
    ...dieser.filter((p) => !postenLeer(p)).map((p, i) => ({ p, leer: false, nr: i + 1 })),
    { p: leer, leer: true, nr: null },
  ];
}

export const leeresFormular = (): BelegFormular => ({
  rechnungsstellerId: null,
  belegdatum: '',
  modus: 'brutto',
  posten: [neuerPosten()],
  korrekturen: {},
  zahlweg: null,
  bezahldatum: '',
  fachId: null,
  gegeben: {},
  wechselgeld: {},
  mitgliedId: null,
  eigenbeleg: false,
  eigenbelegBegruendung: '',
  datei: null,
  belegsummeCent: null,
  eingereichtBetragCent: null,
  rechnungsstellerName: '',
  notiz: '',
});

// ----- Quantity (thousandths)

/** "1,5" -> 1500; accepts a comma or a point, up to 3 decimals; null when invalid or empty. */
export function anzahlLesen(text: string): number | null {
  const roh = text.trim();
  const t = roh.includes(',') ? roh.replace(/\./g, '').replace(',', '.') : roh;
  if (!/^-?\d+(\.\d{1,3})?$/.test(t)) return null;
  return Math.round(Number(t) * 1000);
}

/** 1500 -> "1,5"; 1000 -> "1". */
export function anzahlText(milli: number): string {
  const text = (milli / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return text.replace('.', ',');
}

/** Tax rate as text: 1900 -> "19 %", 700 -> "7 %". */
export const satzText = (satz: number): string => `${(satz / 100).toLocaleString('de-DE')} %`;

/** The tax rate of a Kategorie's default Art in the period (`saetze`), or null without a default. */
export function steuersatzVorschlag(
  konto: Partial<Pick<KontoDto, 'steuersatzArt'>> | undefined,
  saetze: Pick<SteuersatzZeitraum, 'regel' | 'ermaessigt'>,
): number | null {
  const art = konto?.steuersatzArt;
  return art === undefined ? null : steuersatzFuerArt(art, saetze);
}

/**
 * The Belegdatum moved into another tax rate period: items with the old regular/reduced rate get the
 * same Art in the new period (also the corrections). `geaendert` counts the filled items that changed.
 */
export function saetzeUmstellen(
  f: BelegFormular,
  alt: Pick<SteuersatzZeitraum, 'regel' | 'ermaessigt'>,
  neu: Pick<SteuersatzZeitraum, 'regel' | 'ermaessigt'>,
): { form: BelegFormular; geaendert: number } {
  if (alt.regel === neu.regel && alt.ermaessigt === neu.ermaessigt)
    return { form: f, geaendert: 0 };
  let geaendert = 0;
  const posten = f.posten.map((p) => {
    const satz = steuersatzUmstellen(p.steuersatz, alt, neu);
    if (satz === p.steuersatz) return p;
    if (!postenLeer(p)) geaendert++;
    return { ...p, steuersatz: satz };
  });
  const korrekturen: Record<number, KorrekturEingabe> = {};
  for (const [satz, k] of Object.entries(f.korrekturen))
    korrekturen[steuersatzUmstellen(Number(satz), alt, neu)] = k;
  return { form: { ...f, posten, korrekturen }, geaendert };
}

// ----- Denominations: signed as booked on the Fach (given negative, change positive)

export function stueckelungAus(gegeben: Mengen, wechselgeld: Mengen): StueckelungDto[] {
  const netto = new Map<number, number>();
  for (const s of mengenStueckelung(gegeben, -1))
    netto.set(s.nennwertCent, (netto.get(s.nennwertCent) ?? 0) + s.anzahl);
  for (const s of mengenStueckelung(wechselgeld, 1))
    netto.set(s.nennwertCent, (netto.get(s.nennwertCent) ?? 0) + s.anzahl);
  return [...netto]
    .filter(([, anzahl]) => anzahl !== 0)
    .map(([nennwertCent, anzahl]) => ({ nennwertCent, anzahl }))
    .sort((a, b) => a.nennwertCent - b.nennwertCent);
}

/** Splits a signed Stückelung into the two typed columns. */
export function mengenAus(s: readonly StueckelungDto[]): { gegeben: Mengen; wechselgeld: Mengen } {
  return {
    gegeben: stueckelungMengen(
      s.filter((x) => x.anzahl < 0).map((x) => ({ ...x, anzahl: -x.anzahl })),
    ),
    wechselgeld: stueckelungMengen(s.filter((x) => x.anzahl > 0)),
  };
}

/** Cent handed over minus change received: what the typed counts pay. */
export const bezahltCent = (gegeben: Mengen, wechselgeld: Mengen): number =>
  -stueckelungAus(gegeben, wechselgeld).reduce((s, x) => s + x.nennwertCent * x.anzahl, 0);

// ----- Form <-> draft data

const postenAnzahl = (p: PostenZeile): number => anzahlLesen(p.anzahl) ?? 0;

function postenZuDaten(p: PostenZeile): BelegPosten {
  const gesamtCent =
    p.preisExaktCent !== null && p.art !== 'leergut'
      ? gesamtAusExakt(p.preisExaktCent, postenAnzahl(p))
      : null;
  const basis = {
    text: p.text.trim(),
    anzahlMilli: postenAnzahl(p),
    einzelpreisCent:
      gesamtCent === null
        ? (p.einzelpreisCent ?? 0)
        : einzelpreisAusGesamt(gesamtCent, postenAnzahl(p)),
    gesamtCent,
    steuersatz: p.steuersatz,
    ...(p.preisFormel && { preisFormel: p.preisFormel }),
  };
  if (p.art === 'leergut') {
    return {
      art: 'leergut',
      text: basis.text,
      anzahlMilli: basis.anzahlMilli,
      einzelpreisCent: basis.einzelpreisCent,
      ...(basis.preisFormel && { preisFormel: basis.preisFormel }),
      steuersatz: basis.steuersatz,
    };
  }
  if (p.art === 'ware') {
    return {
      art: 'ware',
      anzahlMilli: basis.anzahlMilli,
      einzelpreisCent: basis.einzelpreisCent,
      gesamtCent: basis.gesamtCent,
      ...(basis.preisFormel && { preisFormel: basis.preisFormel }),
      steuersatz: basis.steuersatz,
      wareId: p.wareId,
      gebindeId: p.gebindeId,
      kategorieId: p.kategorieId,
      pfandCent: p.pfandCent,
    };
  }
  return { art: 'kategorie', kategorieId: p.kategorieId, ...basis };
}

/** The draft data as the API stores it. Unreadable inputs become 0 (the check names them). */
export function formularZuDaten(f: BelegFormular): BelegEntwurfDaten {
  const korrekturen =
    f.modus === 'netto' && !formularEigenbeleg(f)
      ? Object.entries(f.korrekturen)
          .map(([satz, k]) => ({
            steuersatz: Number(satz),
            nettoCent: k.nettoCent ?? 0,
            steuerCent: k.steuerCent ?? 0,
          }))
          .filter((k) => k.nettoCent !== 0 || k.steuerCent !== 0)
      : [];
  return {
    rechnungsstellerId: f.rechnungsstellerId,
    belegdatum: f.belegdatum || null,
    modus: f.modus,
    posten: gefuelltePosten(f.posten).map(postenZuDaten),
    korrekturen,
    zahlweg: f.zahlweg,
    bezahldatum: f.zahlweg && f.zahlweg !== 'auslage' && f.bezahldatum ? f.bezahldatum : null,
    fachId: f.zahlweg === 'bar' ? f.fachId : null,
    stueckelung: f.zahlweg === 'bar' ? stueckelungAus(f.gegeben, f.wechselgeld) : [],
    mitgliedId: f.zahlweg === 'auslage' ? f.mitgliedId : null,
    eigenbelegBegruendung: f.eigenbeleg && !f.datei ? f.eigenbelegBegruendung.trim() : null,
    datei: f.datei,
    belegsummeCent: f.belegsummeCent,
    eingereichtBetragCent: f.eingereichtBetragCent,
    rechnungsstellerName: f.rechnungsstellerName.trim() || null,
    notiz: f.notiz.trim() || null,
  };
}

export function datenZuFormular(d: BelegEntwurfDaten): BelegFormular {
  const { gegeben, wechselgeld } = mengenAus(d.stueckelung);
  return {
    rechnungsstellerId: d.rechnungsstellerId,
    belegdatum: d.belegdatum ?? '',
    modus: d.modus,
    posten: d.posten.length > 0 ? postenSortieren(d.posten.map(postenZuZeile)) : [neuerPosten()],
    korrekturen: Object.fromEntries(
      d.korrekturen.map((k) => [
        k.steuersatz,
        { nettoCent: k.nettoCent, steuerCent: k.steuerCent },
      ]),
    ),
    zahlweg: d.zahlweg,
    bezahldatum: d.bezahldatum ?? '',
    fachId: d.fachId,
    gegeben,
    wechselgeld,
    mitgliedId: d.mitgliedId,
    eigenbeleg: d.eigenbelegBegruendung !== null && !d.datei,
    eigenbelegBegruendung: d.eigenbelegBegruendung ?? '',
    datei: d.datei,
    belegsummeCent: d.belegsummeCent ?? d.eingereichtBetragCent ?? null,
    eingereichtBetragCent: d.eingereichtBetragCent ?? null,
    rechnungsstellerName: d.rechnungsstellerName ?? '',
    notiz: d.notiz ?? '',
  };
}

/** The exact price of a loaded line: `gesamtCent / Anzahl` when that is no whole cent, else null. */
function preisExakt(p: BelegPosten): number | null {
  if (p.art === 'leergut' || (p.gesamtCent ?? null) === null || p.anzahlMilli === 0) return null;
  const exakt = Number(((p.gesamtCent! * 1000) / p.anzahlMilli).toFixed(6));
  return Number.isInteger(exakt) ? null : exakt;
}

function postenZuZeile(p: BelegPosten): PostenZeile {
  const ware = p.art === 'ware' ? p : null;
  return {
    key: neuerKey(),
    art: p.art,
    kategorieId: p.art === 'leergut' ? null : (p.kategorieId ?? null),
    text: p.art === 'ware' ? '' : p.text,
    anzahl: anzahlText(p.anzahlMilli),
    einzelpreisCent: p.einzelpreisCent,
    preisExaktCent: preisExakt(p),
    preisFormel: p.preisFormel ?? null,
    steuersatz: p.steuersatz,
    wareId: ware?.wareId ?? null,
    gebindeId: ware?.gebindeId ?? null,
    pfandCent: ware?.pfandCent ?? null,
  };
}

/** Whether the form is an Eigenbeleg (no file, with reason): booked without Vorsteuer. */
export const formularEigenbeleg = (f: Pick<BelegFormular, 'datei' | 'eigenbeleg'>): boolean =>
  f.eigenbeleg && !f.datei;

/** Text under the summaries of an Eigenbeleg. */
export const EIGENBELEG_HINWEIS = 'Eigenbeleg: keine Vorsteuer, der volle Betrag ist Aufwand.';

/** Whether the form holds anything worth saving as a draft (empty rows do not count). */
export function hatInhalt(f: BelegFormular): boolean {
  return (
    f.datei !== null ||
    f.belegdatum !== '' ||
    f.zahlweg !== null ||
    f.eigenbelegBegruendung.trim() !== '' ||
    f.notiz.trim() !== '' ||
    f.belegsummeCent !== null ||
    f.posten.some((p) => !postenLeer(p))
  );
}

/** What is missing before the Beleg can be booked, incl. unreadable quantities. */
export function formularFehler(
  f: BelegFormular,
  zeitraeume: readonly Pick<SteuersatzZeitraum, 'ab' | 'regel' | 'ermaessigt'>[],
): BelegFehler[] {
  const eigenbeleg = formularEigenbeleg(f);
  const fehler = belegPruefen(formularZuDaten(f), { heute: heuteBerlin(), zeitraeume })
    // An Eigenbeleg has no visible Steuersatz field: its rates are not checked.
    .filter((x) => !(eigenbeleg && x.meldung.includes('gilt am Belegdatum nicht')));
  // Same order and numbering as `formularZuDaten`: the position within the art.
  const zaehler: Record<BelegPostenArt, number> = { ware: 0, kategorie: 0, leergut: 0 };
  gefuelltePosten(f.posten).forEach((p) => {
    const n = postenZeilenLabel(p.art, ++zaehler[p.art]);
    if (p.anzahl.trim() !== '' && anzahlLesen(p.anzahl) === null)
      fehler.push({
        feld: 'posten',
        meldung: `${n}: Die Anzahl ist ungültig, bitte gib z. B. 2 oder 1,5 ein.`,
      });
    if (p.einzelpreisCent === null)
      fehler.push({ feld: 'posten', meldung: `${n}: Bitte gib den Einzelpreis an.` });
    if (p.art === 'leergut' && p.einzelpreisCent !== null && p.einzelpreisCent < 0)
      fehler.push({ feld: 'posten', meldung: `${n}: Das Pfand je Stück darf nicht negativ sein.` });
    if (p.art === 'leergut' && (anzahlLesen(p.anzahl) ?? 0) < 0)
      fehler.push({
        feld: 'posten',
        meldung: `${n}: Die zurückgegebene Anzahl muss größer als 0 sein.`,
      });
  });
  return fehler;
}

export const fehlerZu = (fehler: readonly BelegFehler[], feld: string): string | undefined =>
  fehler.find((x) => x.feld === feld)?.meldung;

/** Totals of the form per tax rate (live display). */
export function formularSumme(f: BelegFormular) {
  return belegBerechnen({ ...formularZuDaten(f), eigenbeleg: formularEigenbeleg(f) });
}

/** Deposit (cent, incl. tax) per tax rate: the part of the totals that comes from the Pfand of Ware items. */
export function pfandJeSatz(
  posten: readonly Pick<PostenZeile, 'steuersatz'>[],
  pfandBetraege: readonly number[],
): Record<number, number> {
  const summen: Record<number, number> = {};
  posten.forEach((p, i) => {
    const c = pfandBetraege[i] ?? 0;
    if (c !== 0) summen[p.steuersatz] = (summen[p.steuersatz] ?? 0) + c;
  });
  return summen;
}

/** Tax rates the items use, highest first (the rows of the correction fields). */
export const verwendeteSaetze = (f: BelegFormular): number[] =>
  [...new Set(gefuelltePosten(f.posten).map((p) => p.steuersatz))].sort((a, b) => b - a);

/** Fach counts must pay the Beleg exactly; the German hint, or null when it fits (or is empty). */
export function stueckelungHinweis(
  summeCent: number,
  gegeben: Mengen,
  wechselgeld: Mengen,
): string | null {
  if (mengenLeer(gegeben) && mengenLeer(wechselgeld)) return null;
  const bezahlt = bezahltCent(gegeben, wechselgeld);
  if (bezahlt === summeCent) return null;
  const diff = summeCent - bezahlt;
  // A negative sum is an inflow: the received money (Wechselgeld column) is counted.
  if (summeCent < 0)
    return diff < 0 ? `Es fehlen noch ${cent(-diff)} Eingang.` : `Es sind ${cent(diff)} zu viel.`;
  return diff > 0 ? `Es fehlen noch ${cent(diff)}.` : `Es sind ${cent(-diff)} zu viel.`;
}

const cent = (c: number) =>
  (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

// ----- File

const ENDUNG_TYP: Record<string, BelegDateiTyp> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
};

/** The Beleg file type of a picked file; falls back to the extension (HEIC often has no type). */
export function dateiTypVon(datei: { type: string; name: string }): BelegDateiTyp | null {
  const typ = datei.type === 'image/heif' ? 'image/heic' : datei.type;
  if ((BELEG_DATEI_TYPEN as readonly string[]).includes(typ)) return typ as BelegDateiTyp;
  const endung = datei.name.split('.').pop()?.toLowerCase() ?? '';
  return ENDUNG_TYP[endung] ?? null;
}

/** Lower-case hex of a digest. */
export const hexVon = (bytes: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Compact file size, e.g. "1,4 MB". */
export function groesseText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}
