import {
  centAnzeigen,
  euroZuCent,
  pruefeBuchung,
  type BuchungEingabe,
  type BuchungZeileEingabe,
  type PruefKonto,
} from '@c4/shared';

// Pure logic of the booking form (`/finanzen/buchen`): rows -> entry, live sum, German error texts.

export type Seite = 'soll' | 'haben';

/** One row of the free booking: account, side (Soll = +, Haben = -) and the amount in euro. */
export interface FreieZeile {
  key: number;
  kontoId: string | null;
  seite: Seite;
  /** Euro as typed (number, or text while typing). */
  betrag: number | string;
}

export type FormularModus = 'umbuchung' | 'frei';

let keyZaehler = 0;
export const leereZeile = (seite: Seite = 'soll'): FreieZeile => ({
  key: keyZaehler++,
  kontoId: null,
  seite,
  betrag: '',
});

/** Euro value of a field as whole cent; an empty or invalid field counts as 0. */
export const betragCent = (betrag: number | string): number => {
  if (typeof betrag === 'string' && betrag.trim() === '') return 0;
  return euroZuCent(betrag) ?? 0;
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

/** Signed lines of the free booking (Haben = negative). Rows without an account keep an empty id. */
export function freieZeilen(zeilen: readonly FreieZeile[]): BuchungZeileEingabe[] {
  return zeilen.map((z) => {
    const cent = Math.abs(betragCent(z.betrag));
    return einfacheZeile(z.kontoId ?? '', z.seite === 'haben' ? -cent : cent);
  });
}

/** Two lines moving `betrag` from one account to another. */
export function umbuchungZeilen(
  von: string | null,
  an: string | null,
  betrag: number | string,
): BuchungZeileEingabe[] {
  const cent = Math.abs(betragCent(betrag));
  return [einfacheZeile(von ?? '', -cent), einfacheZeile(an ?? '', cent)];
}

export const summeCent = (zeilen: readonly { betragCent: number }[]): number =>
  zeilen.reduce((s, z) => s + z.betragCent, 0);

/** "Summe: 0,00 € – die Buchung geht auf" / "noch 5,00 € im Haben offen". */
export function summeText(summe: number): string {
  if (summe === 0) return 'Summe: 0,00 € – die Buchung geht auf.';
  const offen = centAnzeigen(Math.abs(summe));
  return `Summe: ${centAnzeigen(summe)} – noch ${offen} im ${summe > 0 ? 'Haben' : 'Soll'} offen.`;
}

export interface FormularStand {
  modus: FormularModus;
  von: string | null;
  an: string | null;
  betrag: number | string;
  zeilen: readonly FreieZeile[];
}

/** The lines the current form state stands for. */
export const zeilenFuer = (s: FormularStand): BuchungZeileEingabe[] =>
  s.modus === 'umbuchung' ? umbuchungZeilen(s.von, s.an, s.betrag) : freieZeilen(s.zeilen);

/** German error messages of the current state, empty = the entry can be sent. */
export function formularFehler(s: FormularStand, konten: readonly PruefKonto[]): string[] {
  const zeilen = zeilenFuer(s);
  if (s.modus === 'umbuchung') {
    const fehler: string[] = [];
    if (!s.von) fehler.push('Bitte wähle das Konto, von dem umgebucht wird.');
    if (!s.an) fehler.push('Bitte wähle das Konto, auf das umgebucht wird.');
    if (s.von && s.an && s.von === s.an) fehler.push('Die beiden Konten müssen verschieden sein.');
    if (betragCent(s.betrag) <= 0) fehler.push('Bitte gib einen Betrag über 0 an.');
    if (fehler.length > 0) return fehler;
  }
  return pruefeBuchung({ zeilen }, konten);
}

export type BuchungKopf = Pick<BuchungEingabe, 'datum' | 'text'>;

/** Body for `POST /api/finanzen/buchungen`. */
export function buchungBody(kopf: BuchungKopf, s: FormularStand) {
  return {
    datum: kopf.datum,
    text: kopf.text.trim(),
    quelleTyp: s.modus === 'umbuchung' ? ('umbuchung' as const) : ('manuell' as const),
    zeilen: zeilenFuer(s),
  };
}
