import {
  RECHNUNG_POSTEN_ARTEN,
  STEUERSATZ_NOTFALL,
  rechnungBerechnen,
  rechnungPostenLabel,
  rechnungPruefen,
  heuteBerlin,
  type BelegFehler,
  type BelegModus,
  type BelegWareDto,
  type KontoDto,
  type RechnungEmpfaenger,
  type RechnungEntwurfDaten,
  type RechnungPosten,
  type RechnungPostenArt,
  type SteuersatzZeitraum,
} from '@c4/shared';
import { standardGebindeWaehlen, type SaetzeAm } from './belegAuswahl';
import { anzahlLesen, anzahlText, steuersatzVorschlag } from './belegFormular';

// Pure logic of the Rechnung form: the typed state of the page <-> the draft data of the API. Items
// are Waren (a Gebinde with deposit) and free text lines; every table ends with one empty row.

/** One typed item row. `anzahl` is the text as typed ("1,5"); amounts are whole cent. */
export interface RechnungsZeile {
  /** Stable key for React; not stored. */
  key: string;
  art: RechnungPostenArt;
  wareId: string | null;
  gebindeId: string | null;
  text: string;
  anzahl: string;
  /** Price per Gebinde (Ware) or per piece (free text), net or gross as the form's mode says. */
  einzelpreisCent: number | null;
  /** The typed calculation of the price; null = plain amount. */
  preisFormel: string | null;
  /** Deposit per Gebinde (Ware items); null = none. */
  pfandCent: number | null;
  steuersatz: number;
  erloesKontoId: string | null;
}

export interface RechnungFormular {
  empfaenger: RechnungEmpfaenger | null;
  /** `YYYY-MM-DD` or empty. */
  leistungVon: string;
  /** End of a service period, empty = a single day. */
  leistungBis: string;
  /** Days until due; null = the default of the Einstellungen. */
  zahlungszielTage: number | null;
  betreff: string;
  einleitung: string;
  hinweis: string;
  modus: BelegModus;
  posten: RechnungsZeile[];
}

let zaehler = 0;
const neuerKey = () => `r${++zaehler}`;

export const neueZeile = (
  art: RechnungPostenArt = 'ware',
  steuersatz: number = STEUERSATZ_NOTFALL.regel,
  erloesKontoId: string | null = null,
): RechnungsZeile => ({
  key: neuerKey(),
  art,
  wareId: null,
  gebindeId: null,
  text: '',
  anzahl: '',
  einzelpreisCent: null,
  preisFormel: null,
  pfandCent: null,
  steuersatz,
  erloesKontoId,
});

export const leeresFormular = (): RechnungFormular => ({
  empfaenger: null,
  leistungVon: '',
  leistungBis: '',
  zahlungszielTage: null,
  betreff: '',
  einleitung: '',
  hinweis: '',
  modus: 'brutto',
  posten: [],
});

/** Wares first, then free text. */
const rang = (art: RechnungPostenArt) => RECHNUNG_POSTEN_ARTEN.indexOf(art);

export const zeilenSortieren = <T extends { art: RechnungPostenArt }>(posten: readonly T[]): T[] =>
  posten
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rang(a.p.art) - rang(b.p.art) || a.i - b.i)
    .map((x) => x.p);

/** Appends an item at the end of its art's group (the list stays grouped). */
export function zeileHinzufuegen<T extends { art: RechnungPostenArt }>(
  posten: readonly T[],
  neu: T,
): T[] {
  const sortiert = zeilenSortieren(posten);
  let ende = -1;
  sortiert.forEach((p, i) => {
    if (rang(p.art) <= rang(neu.art)) ende = i;
  });
  return [...sortiert.slice(0, ende + 1), neu, ...sortiert.slice(ende + 1)];
}

/** Whether a row is still empty (not saved, not checked): no Ware, or no text and no price. */
export function zeileLeer(
  p: Pick<RechnungsZeile, 'art' | 'wareId' | 'text' | 'einzelpreisCent' | 'erloesKontoId'>,
): boolean {
  if (p.art === 'ware') return !p.wareId;
  return p.text.trim() === '' && p.einzelpreisCent === null;
}

export const gefuellteZeilen = (posten: readonly RechnungsZeile[]): RechnungsZeile[] =>
  zeilenSortieren(posten).filter((p) => !zeileLeer(p));

export interface RechnungsTabellenZeile {
  p: RechnungsZeile;
  /** The empty row at the end of the table. */
  leer: boolean;
  /** 1-based position among the filled rows of the table; null for the empty row. */
  nr: number | null;
}

/** Rows of the table of one art: the filled items, then exactly one empty row. */
export function tabellenZeilen(
  posten: readonly RechnungsZeile[],
  leere: Readonly<Record<RechnungPostenArt, RechnungsZeile>>,
  art: RechnungPostenArt,
): RechnungsTabellenZeile[] {
  const dieser = posten.filter((p) => p.art === art);
  const letzte = dieser.at(-1);
  const leer = letzte && zeileLeer(letzte) ? letzte : leere[art];
  return [
    ...dieser.filter((p) => !zeileLeer(p)).map((p, i) => ({ p, leer: false, nr: i + 1 })),
    { p: leer, leer: true, nr: null },
  ];
}

function zeileZuPosten(p: RechnungsZeile): RechnungPosten {
  const basis = {
    anzahlMilli: anzahlLesen(p.anzahl) ?? 0,
    einzelpreisCent: p.einzelpreisCent ?? 0,
    steuersatz: p.steuersatz,
    erloesKontoId: p.erloesKontoId,
    ...(p.preisFormel && { preisFormel: p.preisFormel }),
  };
  if (p.art === 'ware')
    return {
      art: 'ware',
      text: '',
      wareId: p.wareId,
      gebindeId: p.gebindeId,
      pfandCent: p.pfandCent,
      ...basis,
    };
  return { art: 'frei', text: p.text.trim(), ...basis };
}

/** The draft data as the API stores it. Unreadable inputs become 0 (the check names them). */
export function formularZuDaten(f: RechnungFormular): RechnungEntwurfDaten {
  return {
    empfaenger: f.empfaenger,
    leistungVon: f.leistungVon || null,
    leistungBis: f.leistungVon && f.leistungBis ? f.leistungBis : null,
    zahlungszielTage: f.zahlungszielTage,
    betreff: f.betreff.trim(),
    einleitung: f.einleitung.trim() || null,
    hinweis: f.hinweis.trim() || null,
    modus: f.modus,
    posten: gefuellteZeilen(f.posten).map(zeileZuPosten),
  };
}

function postenZuZeile(p: RechnungPosten): RechnungsZeile {
  return {
    key: neuerKey(),
    art: p.art,
    wareId: p.art === 'ware' ? (p.wareId ?? null) : null,
    gebindeId: p.art === 'ware' ? (p.gebindeId ?? null) : null,
    text: p.art === 'frei' ? p.text : '',
    anzahl: anzahlText(p.anzahlMilli),
    einzelpreisCent: p.einzelpreisCent,
    preisFormel: p.preisFormel ?? null,
    pfandCent: p.art === 'ware' ? (p.pfandCent ?? null) : null,
    steuersatz: p.steuersatz,
    erloesKontoId: p.erloesKontoId ?? null,
  };
}

export function datenZuFormular(d: RechnungEntwurfDaten): RechnungFormular {
  return {
    empfaenger: d.empfaenger ?? null,
    leistungVon: d.leistungVon ?? '',
    leistungBis: d.leistungBis ?? '',
    zahlungszielTage: d.zahlungszielTage ?? null,
    betreff: d.betreff,
    einleitung: d.einleitung ?? '',
    hinweis: d.hinweis ?? '',
    modus: d.modus,
    posten: zeilenSortieren(d.posten.map(postenZuZeile)),
  };
}

/** Whether the form holds anything worth saving as a draft (empty rows do not count). */
export function hatInhalt(f: RechnungFormular): boolean {
  return (
    f.empfaenger !== null ||
    f.leistungVon !== '' ||
    f.betreff.trim() !== '' ||
    f.einleitung.trim() !== '' ||
    f.hinweis.trim() !== '' ||
    f.posten.some((p) => !zeileLeer(p))
  );
}

/** What is missing before the Rechnung can be issued, incl. unreadable quantities and prices. */
export function formularFehler(
  f: RechnungFormular,
  zeitraeume: readonly Pick<SteuersatzZeitraum, 'ab' | 'regel' | 'ermaessigt'>[],
): BelegFehler[] {
  const fehler = rechnungPruefen(formularZuDaten(f), { heute: heuteBerlin(), zeitraeume });
  const nr: Record<RechnungPostenArt, number> = { ware: 0, frei: 0 };
  gefuellteZeilen(f.posten).forEach((p) => {
    const n = rechnungPostenLabel(p.art, ++nr[p.art]);
    if (p.anzahl.trim() !== '' && anzahlLesen(p.anzahl) === null)
      fehler.push({
        feld: 'posten',
        meldung: `${n}: Die Anzahl ist ungültig, bitte gib z. B. 2 oder 1,5 ein.`,
      });
    if (p.einzelpreisCent === null)
      fehler.push({ feld: 'posten', meldung: `${n}: Bitte gib den Preis an.` });
  });
  return fehler;
}

/** Totals of the form per tax rate (live display). */
export const formularSumme = (f: RechnungFormular) => rechnungBerechnen(formularZuDaten(f));

/** Erlös-Kategorien an item may use: Erlöskonten without sub accounts, not archived. */
export const erloesKonten = (konten: readonly KontoDto[]): KontoDto[] => {
  const eltern = new Set(konten.flatMap((k) => (k.parentId ? [k.parentId] : [])));
  return konten.filter((k) => k.art === 'erloes' && !k.archiviert && !eltern.has(k.id));
};

/** Net price from a gross one at a tax rate (hundredths of a percent). */
export const nettoVonBrutto = (bruttoCent: number, satz: number): number =>
  Math.round((bruttoCent * 10000) / (10000 + satz));

/** Patch for choosing an Erlös-Kategorie: the id plus its standard tax rate. */
export function erloesPatch(
  konten: readonly Pick<KontoDto, 'id' | 'steuersatzArt'>[],
  id: string | null,
  saetze: SaetzeAm,
): Partial<RechnungsZeile> {
  const satz = steuersatzVorschlag(
    konten.find((k) => k.id === id),
    saetze,
  );
  return { erloesKontoId: id, ...(satz !== null && { steuersatz: satz }) };
}

/** Price prefill of a Gebinde (last purchase price, gross) in the mode of the form. */
const preisVorschlag = (
  gebinde: { letzterPreisCent: number | null } | undefined,
  modus: BelegModus,
  satz: number,
): Partial<RechnungsZeile> => {
  const brutto = gebinde?.letzterPreisCent ?? null;
  if (brutto === null) return {};
  return {
    einzelpreisCent: modus === 'netto' ? nettoVonBrutto(brutto, satz) : brutto,
    preisFormel: null,
  };
};

/** Patch for choosing a Ware: standard Gebinde with deposit, last price and the default Erlös-Kategorie. */
export function warePatch(
  waren: readonly BelegWareDto[],
  erloes: readonly Pick<KontoDto, 'id' | 'steuersatzArt'>[],
  standardKonto: string | null,
  p: Pick<RechnungsZeile, 'erloesKontoId' | 'steuersatz'>,
  id: string | null,
  modus: BelegModus,
  saetze: SaetzeAm,
): Partial<RechnungsZeile> {
  const ware = waren.find((w) => w.id === id);
  const gebinde = standardGebindeWaehlen(ware);
  const konto = p.erloesKontoId ?? standardKonto;
  const kontoPatch = p.erloesKontoId ? {} : erloesPatch(erloes, konto, saetze);
  const satz = kontoPatch.steuersatz ?? p.steuersatz;
  return {
    wareId: id,
    ...gebinde,
    ...kontoPatch,
    ...preisVorschlag(
      ware?.gebinde.find((g) => g.id === gebinde.gebindeId),
      modus,
      satz,
    ),
  };
}

/** Patch for choosing a Gebinde: its deposit and last price. */
export function gebindePatch(
  ware: BelegWareDto | undefined,
  gebindeId: string | null,
  modus: BelegModus,
  satz: number,
): Partial<RechnungsZeile> {
  const g = ware?.gebinde.find((x) => x.id === gebindeId);
  return { gebindeId, pfandCent: g?.pfandGesamtCent ?? null, ...preisVorschlag(g, modus, satz) };
}

/** Patch for the price input of a row: the rounded price and the typed calculation. */
export const preisPatch = (
  cent: number | null,
  formel?: string | null,
): Partial<RechnungsZeile> => ({
  einzelpreisCent: cent,
  preisFormel: formel || null,
});
