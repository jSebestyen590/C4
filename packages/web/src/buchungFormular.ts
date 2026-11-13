import {
  centAnzeigen,
  pruefeBuchung,
  type BuchungEingabeInput,
  type BuchungZeileEingabe,
  type KontoDto,
  type PruefKonto,
} from '@c4/shared';

// Pure logic of the booking form (`/finanzen/buchen`) and of `BuchungszeilenTabelle`: rows -> entry,
// live sum, field errors, plausibility warnings. Amounts are whole cent, positive; the direction is
// a separate choice (Zugang = +, Abgang = -).

export type Richtung = 'zugang' | 'abgang';

export const RICHTUNG_LABELS: Record<Richtung, string> = { zugang: 'Zugang', abgang: 'Abgang' };

/** Word for a signed line amount: positive = Zugang, negative = Abgang. */
export const richtungVon = (cent: number): Richtung => (cent < 0 ? 'abgang' : 'zugang');

/** Amounts from this value on need an explicit confirmation ("ungewöhnlich hoch"): 1.000,00 €. */
export const HOHER_BETRAG_CENT = 100_000;

/** One row of the free booking. */
export interface FreieZeile {
  key: number;
  kontoId: string | null;
  richtung: Richtung;
  /** Amount in cent, null while empty or invalid. */
  betrag: number | null;
}

export type FormularModus = 'umbuchung' | 'frei';

let keyZaehler = 0;
export const leereZeile = (richtung: Richtung = 'zugang'): FreieZeile => ({
  key: keyZaehler++,
  kontoId: null,
  richtung,
  betrag: null,
});

/**
 * Accounts that take bookings on this page: not archived, without Stückelung (Fächer are booked on
 * the Bargeld pages) and not a group (an account with sub accounts takes no lines).
 */
export const buchbareKonten = (konten: readonly KontoDto[]): KontoDto[] => {
  const eltern = new Set(konten.map((k) => k.parentId));
  return konten.filter((k) => !k.archiviert && !k.stueckelung && !eltern.has(k.id));
};

export const einfacheZeile = (kontoId: string, cent: number): BuchungZeileEingabe => ({
  kontoId,
  betragCent: cent,
  stueckelung: null,
  nettoCent: null,
  steuerCent: null,
  steuersatz: null,
  steuerArt: 'keine',
});

/** Signed lines of the free booking (Abgang = negative). Rows without an account keep an empty id. */
export function freieZeilen(zeilen: readonly FreieZeile[]): BuchungZeileEingabe[] {
  return zeilen.map((z) => {
    const cent = z.betrag ?? 0;
    return einfacheZeile(z.kontoId ?? '', z.richtung === 'abgang' ? -cent : cent);
  });
}

/** Two lines moving `cent` from one account (Abgang) to another (Zugang). */
export function umbuchungZeilen(
  von: string | null,
  nach: string | null,
  cent: number | null,
): BuchungZeileEingabe[] {
  const c = cent ?? 0;
  return [einfacheZeile(von ?? '', -c), einfacheZeile(nach ?? '', c)];
}

export const summeCent = (zeilen: readonly { betragCent: number }[]): number =>
  zeilen.reduce((s, z) => s + z.betragCent, 0);

export interface Summen {
  zugang: number;
  abgang: number;
  /** Zugang minus Abgang; 0 = balanced. */
  differenz: number;
}

export function summen(zeilen: readonly FreieZeile[]): Summen {
  let zugang = 0;
  let abgang = 0;
  for (const z of zeilen) {
    if (z.richtung === 'zugang') zugang += z.betrag ?? 0;
    else abgang += z.betrag ?? 0;
  }
  return { zugang, abgang, differenz: zugang - abgang };
}

/** "Noch 5,00 € Abgang offen" / "Ausgeglichen"; `hatBetraege` false: nothing typed yet. */
export function differenzText(differenz: number, hatBetraege = true): string {
  if (differenz === 0) return hatBetraege ? 'Ausgeglichen' : 'Noch keine Beträge erfasst';
  return `Noch ${centAnzeigen(Math.abs(differenz))} ${differenz > 0 ? 'Abgang' : 'Zugang'} offen`;
}

/** The direction a new row needs to move the sum toward 0. */
export const fehlendeRichtung = (differenz: number): Richtung =>
  differenz > 0 ? 'abgang' : 'zugang';

export interface FormularStand {
  modus: FormularModus;
  von: string | null;
  nach: string | null;
  betrag: number | null;
  zeilen: readonly FreieZeile[];
}

/** The lines the current form state stands for. */
export const zeilenFuer = (s: FormularStand): BuchungZeileEingabe[] =>
  s.modus === 'umbuchung' ? umbuchungZeilen(s.von, s.nach, s.betrag) : freieZeilen(s.zeilen);

export interface ZeilenFehler {
  konto?: string;
  betrag?: string;
}

/** Field errors of one free row (German), independent of the other rows. */
export function zeilenFehler(
  z: Pick<FreieZeile, 'kontoId' | 'betrag'>,
  konten: readonly PruefKonto[],
): ZeilenFehler {
  const f: ZeilenFehler = {};
  if (!z.kontoId) f.konto = 'Bitte wähle ein Konto.';
  else if (!konten.some((k) => k.id === z.kontoId && !k.archiviert))
    f.konto = 'Dieses Konto steht nicht zur Auswahl.';
  if (!z.betrag) f.betrag = 'Bitte gib einen Betrag über 0 ein.';
  return f;
}

/** Field errors of the Umbuchung (German). */
export function umbuchungFehler(s: Pick<FormularStand, 'von' | 'nach' | 'betrag'>) {
  const f: { von?: string; nach?: string; betrag?: string } = {};
  if (!s.von) f.von = 'Bitte wähle das Konto, von dem umgebucht wird.';
  if (!s.nach) f.nach = 'Bitte wähle das Konto, auf das umgebucht wird.';
  else if (s.von && s.von === s.nach) f.nach = 'Die beiden Konten müssen verschieden sein.';
  if (!s.betrag) f.betrag = 'Bitte gib einen Betrag über 0 ein.';
  return f;
}

/** German error messages of the current state, empty = the entry can be sent. */
export function formularFehler(s: FormularStand, konten: readonly PruefKonto[]): string[] {
  if (s.modus === 'umbuchung') {
    const fehler = Object.values(umbuchungFehler(s));
    if (fehler.length > 0) return fehler;
  } else if (s.zeilen.some((z) => !z.betrag)) {
    return ['Bitte gib bei jeder Zeile einen Betrag über 0 ein.'];
  }
  return pruefeBuchung({ zeilen: zeilenFuer(s) }, konten);
}

export interface BuchungKopf {
  datum: string;
  text: string;
}

/** True while nothing worth keeping has been typed (no warning on leaving). */
export function formularLeer(kopf: BuchungKopf, s: FormularStand): boolean {
  if (kopf.text.trim() !== '') return false;
  if (s.von || s.nach || s.betrag) return false;
  return s.zeilen.every((z) => !z.kontoId && !z.betrag);
}

/** Body for `POST /api/finanzen/buchungen`. */
export function buchungBody(
  kopf: BuchungKopf,
  s: FormularStand,
  idempotenzSchluessel: string,
): BuchungEingabeInput {
  return {
    idempotenzSchluessel,
    datum: kopf.datum,
    text: kopf.text.trim(),
    quelleTyp: s.modus === 'umbuchung' ? 'umbuchung' : 'manuell',
    zeilen: zeilenFuer(s),
  };
}

/** Plausibility warnings: they do not block, but must be confirmed. `heute` is `JJJJ-MM-TT`. */
export function warnungen(kopf: BuchungKopf, s: FormularStand, heute: string): string[] {
  const w: string[] = [];
  if (kopf.datum > heute) w.push('Das Datum liegt in der Zukunft.');
  const hoechster = Math.max(0, ...zeilenFuer(s).map((z) => Math.abs(z.betragCent)));
  if (hoechster >= HOHER_BETRAG_CENT)
    w.push(`Der Betrag ${centAnzeigen(hoechster)} ist ungewöhnlich hoch.`);
  return w;
}

/** An idempotency key that stays the same as long as the content is the same (retries, double clicks). */
export function schluesselFuer(
  alt: { schluessel: string; inhalt: string } | null,
  inhalt: string,
  neu: () => string,
): { schluessel: string; inhalt: string } {
  return alt && alt.inhalt === inhalt ? alt : { schluessel: neu(), inhalt };
}
