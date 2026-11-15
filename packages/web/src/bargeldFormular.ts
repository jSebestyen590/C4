import {
  ANZAHL_MAX,
  anzahlenAus,
  centAnzeigen,
  NENNWERTE_CENT,
  type BuchungZeileEingabe,
  type KontoDto,
  type StueckelungDto,
} from '@c4/shared';
import { einfacheZeile } from './buchungFormular';

// Pure logic of the Bargeld pages (Umbuchen, Wechseln, Zählen): counts per denomination as typed,
// the booking lines they produce and the German messages for what is missing.

/** Typed count per denomination (`nennwertCent`); missing or null = empty field = 0. */
export type Mengen = Record<number, number | null | undefined>;

export const mengeVon = (m: Mengen, nennwertCent: number): number => m[nennwertCent] ?? 0;

/** Value of the typed counts in cent. */
export const mengenSumme = (m: Mengen): number =>
  NENNWERTE_CENT.reduce((s, n) => s + n * mengeVon(m, n), 0);

export const mengenLeer = (m: Mengen): boolean => NENNWERTE_CENT.every((n) => mengeVon(m, n) === 0);

/** The non-empty counts as a Stückelung (ascending), optionally negated. */
export function mengenStueckelung(m: Mengen, vorzeichen: 1 | -1 = 1): StueckelungDto[] {
  return NENNWERTE_CENT.filter((n) => mengeVon(m, n) > 0).map((n) => ({
    nennwertCent: n,
    anzahl: vorzeichen * mengeVon(m, n),
  }));
}

/** Counts of a Stückelung as typed counts (e.g. the stock as a start value). */
export function stueckelungMengen(s: readonly StueckelungDto[]): Mengen {
  return Object.fromEntries([...anzahlenAus(s)].map(([n, a]) => [n, a]));
}

/** Per denomination: the message when more is typed than `bestand` holds. */
export function bestandFehler(m: Mengen, bestand: readonly StueckelungDto[]): Map<number, string> {
  const vorhanden = anzahlenAus(bestand);
  const fehler = new Map<number, string>();
  for (const n of NENNWERTE_CENT) {
    const da = vorhanden.get(n) ?? 0;
    if (mengeVon(m, n) > da)
      fehler.set(n, da === 0 ? 'Nicht vorhanden.' : `Nur ${da.toLocaleString('de-DE')} vorhanden.`);
  }
  return fehler;
}

/** Counts above the allowed maximum of one field. */
export const mengeZuGross = (m: Mengen): boolean =>
  NENNWERTE_CENT.some((n) => mengeVon(m, n) > ANZAHL_MAX);

const zeile = (kontoId: string, betragCent: number, stueckelung: StueckelungDto[] | null) => ({
  ...einfacheZeile(kontoId, betragCent),
  stueckelung,
});

// ----- Umbuchen

export interface UmbuchenStand {
  von: string | null;
  nach: string | null;
  mengen: Mengen;
}

/** Whether an account is a Fach (takes denominations): Stückelung account, not archived. */
export const istFach = (k: KontoDto | undefined): boolean => !!k && k.stueckelung && !k.archiviert;

/** Accounts of a Fach: Stückelung accounts without sub accounts. */
export function faecherAus(konten: readonly KontoDto[]): KontoDto[] {
  const eltern = new Set(konten.map((k) => k.parentId));
  return konten.filter((k) => istFach(k) && !eltern.has(k.id));
}

/** Accounts of the other side of an Umbuchung: no Stückelung, not a group, not archived. */
export function andereKonten(konten: readonly KontoDto[]): KontoDto[] {
  const eltern = new Set(konten.map((k) => k.parentId));
  return konten.filter((k) => !k.archiviert && !k.stueckelung && !eltern.has(k.id));
}

export interface UmbuchenFehler {
  von?: string;
  nach?: string;
  mengen?: string;
  /** Messages in order of appearance, empty = bookable. */
  alle: string[];
}

export function umbuchenFehler(
  s: UmbuchenStand,
  konten: readonly KontoDto[],
  bestandVon: readonly StueckelungDto[] | null,
): UmbuchenFehler {
  const f: UmbuchenFehler = { alle: [] };
  const von = konten.find((k) => k.id === s.von);
  const nach = konten.find((k) => k.id === s.nach);
  if (!s.von) f.von = 'Bitte wähle das Konto, von dem das Geld kommt.';
  if (!s.nach) f.nach = 'Bitte wähle das Konto, auf das das Geld geht.';
  if (s.von && s.nach && s.von === s.nach) f.nach = 'Von und Nach müssen verschieden sein.';
  if (von && nach && !istFach(von) && !istFach(nach))
    f.nach = 'Dies ist keine Bargeld-Umbuchung: Ohne Fach buchst du sie unter „Buchen“.';
  if (mengenLeer(s.mengen)) f.mengen = 'Bitte gib mindestens eine Münze oder einen Schein an.';
  else if (mengeZuGross(s.mengen)) f.mengen = 'Eine Anzahl ist zu groß.';
  else if (bestandVon && bestandFehler(s.mengen, bestandVon).size > 0)
    f.mengen = 'Im Fach ist nicht genug vorhanden.';
  f.alle = [f.von, f.nach, f.mengen].filter((x): x is string => !!x);
  return f;
}

/** Lines of an Umbuchung: Von = -Summe, Nach = +Summe, with the Stückelung on Fach sides. */
export function umbuchenZeilen(
  s: UmbuchenStand,
  konten: readonly KontoDto[],
): BuchungZeileEingabe[] {
  const summe = mengenSumme(s.mengen);
  const von = konten.find((k) => k.id === s.von);
  const nach = konten.find((k) => k.id === s.nach);
  return [
    zeile(s.von ?? '', -summe, istFach(von) ? mengenStueckelung(s.mengen, -1) : null),
    zeile(s.nach ?? '', summe, istFach(nach) ? mengenStueckelung(s.mengen, 1) : null),
  ];
}

// ----- Wechseln

export interface WechselnStand {
  fach: string | null;
  raus: Mengen;
  rein: Mengen;
}

/** Cent difference `Rein - Raus`; 0 = the change is balanced. */
export const wechselnDifferenz = (s: WechselnStand): number =>
  mengenSumme(s.rein) - mengenSumme(s.raus);

/** `Noch 1,00 € Unterschied: Rein ist höher/niedriger` or null when balanced. */
export function wechselnHinweis(s: WechselnStand): string | null {
  const d = wechselnDifferenz(s);
  if (d === 0) return null;
  return `Noch ${centAnzeigen(Math.abs(d))} Unterschied: ${d > 0 ? 'Rein ist höher als Raus' : 'Raus ist höher als Rein'}.`;
}

export function wechselnFehler(
  s: WechselnStand,
  bestand: readonly StueckelungDto[] | null,
): string[] {
  const f: string[] = [];
  if (!s.fach) f.push('Bitte wähle ein Fach.');
  if (mengenLeer(s.raus)) f.push('Bitte gib an, was du herausnimmst.');
  if (mengenLeer(s.rein)) f.push('Bitte gib an, was du hineinlegst.');
  if (mengeZuGross(s.raus) || mengeZuGross(s.rein)) f.push('Eine Anzahl ist zu groß.');
  if (bestand && bestandFehler(s.raus, bestand).size > 0)
    f.push('Im Fach ist nicht genug vorhanden.');
  const h = wechselnHinweis(s);
  if (h && !mengenLeer(s.raus) && !mengenLeer(s.rein)) f.push(h);
  else if (h && f.length === 0) f.push(h);
  return f;
}

/** Two lines on the Fach: out (negative) and in (positive). */
export function wechselnZeilen(s: WechselnStand): BuchungZeileEingabe[] {
  return [
    zeile(s.fach ?? '', -mengenSumme(s.raus), mengenStueckelung(s.raus, -1)),
    zeile(s.fach ?? '', mengenSumme(s.rein), mengenStueckelung(s.rein, 1)),
  ];
}

// ----- Zählen

/** Ist counts as the body field of `POST /api/finanzen/zaehlungen`. */
export const zaehlungIst = (m: Mengen): StueckelungDto[] =>
  NENNWERTE_CENT.map((n) => ({ nennwertCent: n, anzahl: mengeVon(m, n) })).filter(
    (s) => s.anzahl > 0,
  );

/** Text of a Stückelung, e.g. `3 × 2,00 €, 1 × 5,00 €`. */
export const stueckelungText = (s: readonly StueckelungDto[]): string =>
  s.map((x) => `${x.anzahl} × ${centAnzeigen(x.nennwertCent)}`).join(', ');

/** `0,50 €: 1 Stück zu wenig` / `2,00 €: 3 Stück zu viel`; empty for no difference. */
export const abweichungText = (nennwertCent: number, differenzAnzahl: number): string =>
  differenzAnzahl === 0
    ? ''
    : `${centAnzeigen(nennwertCent)}: ${Math.abs(differenzAnzahl).toLocaleString('de-DE')} Stück zu ${differenzAnzahl < 0 ? 'wenig' : 'viel'}`;

// ----- Which page fits a pair of accounts

/**
 * Where a booking between two accounts belongs: `bargeld` if at least one side is a Fach (needs
 * denominations), `buchen` if both are chosen and none is, otherwise undecided (null).
 */
export function bargeldSeite(
  von: KontoDto | undefined,
  nach: KontoDto | undefined,
): 'bargeld' | 'buchen' | null {
  if (istFach(von) || istFach(nach)) return 'bargeld';
  return von && nach ? 'buchen' : null;
}

const mitParametern = (pfad: string, parameter: Record<string, string | null | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(parameter)) if (v) q.set(k, v);
  return q.size > 0 ? `${pfad}?${q}` : pfad;
};

/** Link to the Bargeld Umbuchen page, prefilled with the accounts when given. */
export const umbuchenPfad = (von?: string | null, nach?: string | null) =>
  mitParametern('/finanzen/bargeld/umbuchen', { von, nach });

/** Link to the Buchen page in Umbuchung mode, prefilled with the accounts when given. */
export const buchenPfad = (von?: string | null, nach?: string | null) =>
  mitParametern('/finanzen/buchen', { modus: 'umbuchung', von, nach });
