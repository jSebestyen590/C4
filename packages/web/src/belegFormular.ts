import {
  BELEG_DATEI_TYPEN,
  belegBerechnen,
  belegPruefen,
  STEUERSAETZE,
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
  /** Submissions: what the member stated, their free Rechnungssteller name and note. */
  eingereichtBetragCent: number | null;
  rechnungsstellerName: string;
  notiz: string;
}

let zaehler = 0;
const neuerKey = () => `p${++zaehler}`;

export const neuerPosten = (steuersatz: number = STEUERSAETZE[0]): PostenZeile => ({
  key: neuerKey(),
  kategorieId: null,
  text: '',
  anzahl: '1',
  einzelpreisCent: null,
  steuersatz,
  art: 'kategorie',
  wareId: null,
  gebindeId: null,
  pfandCent: null,
});

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

/** The standard tax rate of a Kategorie when it is one the form offers. */
export function steuersatzVorschlag(konto: Pick<KontoDto, 'steuersatzStandard'> | undefined) {
  const satz = konto?.steuersatzStandard;
  return satz !== null && satz !== undefined && (STEUERSAETZE as readonly number[]).includes(satz)
    ? satz
    : null;
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
  const basis = {
    text: p.text.trim(),
    anzahlMilli: postenAnzahl(p),
    einzelpreisCent: p.einzelpreisCent ?? 0,
    steuersatz: p.steuersatz,
  };
  if (p.art === 'leergut') return { art: 'leergut', ...basis };
  if (p.art === 'ware')
    return {
      art: 'ware',
      ...basis,
      wareId: p.wareId,
      gebindeId: p.gebindeId,
      kategorieId: p.kategorieId,
      pfandCent: p.pfandCent,
    };
  return { art: 'kategorie', kategorieId: p.kategorieId, ...basis };
}

/** The draft data as the API stores it. Unreadable inputs become 0 (the check names them). */
export function formularZuDaten(f: BelegFormular): BelegEntwurfDaten {
  const korrekturen =
    f.modus === 'netto'
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
    posten: f.posten.map(postenZuDaten),
    korrekturen,
    zahlweg: f.zahlweg,
    bezahldatum: f.zahlweg && f.zahlweg !== 'auslage' && f.bezahldatum ? f.bezahldatum : null,
    fachId: f.zahlweg === 'bar' ? f.fachId : null,
    stueckelung: f.zahlweg === 'bar' ? stueckelungAus(f.gegeben, f.wechselgeld) : [],
    mitgliedId: f.zahlweg === 'auslage' ? f.mitgliedId : null,
    eigenbelegBegruendung: f.eigenbeleg && !f.datei ? f.eigenbelegBegruendung.trim() : null,
    datei: f.datei,
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
    posten: d.posten.length > 0 ? d.posten.map(postenZuZeile) : [neuerPosten()],
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
    eingereichtBetragCent: d.eingereichtBetragCent ?? null,
    rechnungsstellerName: d.rechnungsstellerName ?? '',
    notiz: d.notiz ?? '',
  };
}

function postenZuZeile(p: BelegPosten): PostenZeile {
  const ware = p.art === 'ware' ? p : null;
  return {
    key: neuerKey(),
    art: p.art,
    kategorieId: p.art === 'leergut' ? null : (p.kategorieId ?? null),
    text: p.text,
    anzahl: anzahlText(p.anzahlMilli),
    einzelpreisCent: p.einzelpreisCent,
    steuersatz: p.steuersatz,
    wareId: ware?.wareId ?? null,
    gebindeId: ware?.gebindeId ?? null,
    pfandCent: ware?.pfandCent ?? null,
  };
}

/** Whether the form holds anything worth saving as a draft (a pre-selected Rechnungssteller does not count). */
export function hatInhalt(f: BelegFormular): boolean {
  return (
    f.datei !== null ||
    f.belegdatum !== '' ||
    f.zahlweg !== null ||
    f.eigenbelegBegruendung.trim() !== '' ||
    f.notiz.trim() !== '' ||
    f.posten.some(
      (p) =>
        p.art !== 'kategorie' ||
        p.kategorieId ||
        p.text.trim() !== '' ||
        p.einzelpreisCent !== null,
    )
  );
}

/** What is missing before the Beleg can be booked, incl. unreadable quantities. */
export function formularFehler(f: BelegFormular): BelegFehler[] {
  const fehler = belegPruefen(formularZuDaten(f));
  f.posten.forEach((p, i) => {
    if (p.anzahl.trim() !== '' && anzahlLesen(p.anzahl) === null)
      fehler.push({
        feld: 'posten',
        meldung: `Posten ${i + 1}: Die Anzahl ist ungültig, bitte gib z. B. 2 oder 1,5 ein.`,
      });
    if (p.einzelpreisCent === null)
      fehler.push({ feld: 'posten', meldung: `Posten ${i + 1}: Bitte gib den Einzelpreis an.` });
  });
  return fehler;
}

export const fehlerZu = (fehler: readonly BelegFehler[], feld: string): string | undefined =>
  fehler.find((x) => x.feld === feld)?.meldung;

/** Totals of the form per tax rate (live display). */
export function formularSumme(f: BelegFormular) {
  return belegBerechnen(formularZuDaten(f));
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
  [...new Set(f.posten.map((p) => p.steuersatz))].sort((a, b) => b - a);

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
