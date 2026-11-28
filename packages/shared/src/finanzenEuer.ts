import { z } from 'zod';

// EÜR lines of a Konto (see docs/finanzen.md „Auswertungen“): an own short list, not the official
// line numbers. Kept apart from `finanzenAuswertungen.ts` so the Kontenplan schemas in
// `finanzen.ts` can use it without an import cycle.

export type EuerSeite = 'einnahme' | 'ausgabe';

export interface EuerZeileInfo {
  label: string;
  seite: EuerSeite;
  /** Computed from the tax fields, cannot be assigned to a Konto. */
  berechnet?: true;
}

export const EUER_ZEILEN = {
  umsatz: { label: 'Umsatzerlöse (steuerpflichtig)', seite: 'einnahme' },
  umsatz_steuerfrei: { label: 'Steuerfreie Umsätze', seite: 'einnahme' },
  nicht_steuerbar: {
    label: 'Nicht steuerbare Einnahmen (Beiträge, Spenden)',
    seite: 'einnahme',
  },
  sonstige_einnahmen: { label: 'Sonstige Einnahmen', seite: 'einnahme' },
  ust_vereinnahmt: { label: 'Vereinnahmte Umsatzsteuer', seite: 'einnahme', berechnet: true },
  ust_erstattung: { label: 'Umsatzsteuer-Erstattung vom Finanzamt', seite: 'einnahme' },
  wareneinkauf: { label: 'Wareneinkauf', seite: 'ausgabe' },
  fremdleistungen: { label: 'Fremdleistungen (Künstler:innen, Technik)', seite: 'ausgabe' },
  raumkosten: { label: 'Raumkosten', seite: 'ausgabe' },
  versicherungen_beitraege: { label: 'Versicherungen, Beiträge, Gebühren', seite: 'ausgabe' },
  werbung: { label: 'Werbung', seite: 'ausgabe' },
  instandhaltung: { label: 'Instandhaltung', seite: 'ausgabe' },
  gwg: { label: 'Geringwertige Wirtschaftsgüter', seite: 'ausgabe' },
  sonstige_ausgaben: { label: 'Übrige Ausgaben', seite: 'ausgabe' },
  vorsteuer_gezahlt: { label: 'Gezahlte Vorsteuer', seite: 'ausgabe', berechnet: true },
  ust_zahlung: { label: 'Umsatzsteuer-Zahlung an das Finanzamt', seite: 'ausgabe' },
} as const satisfies Record<string, EuerZeileInfo>;

export type EuerZeile = keyof typeof EUER_ZEILEN;

/** All lines in display order. */
export const EUER_ZEILEN_WERTE = Object.keys(EUER_ZEILEN) as EuerZeile[];

const infoVon = (z: EuerZeile): EuerZeileInfo => EUER_ZEILEN[z];

/** Lines a Konto can be assigned to (without the computed ones). */
export const EUER_ZEILEN_ZUORDENBAR = EUER_ZEILEN_WERTE.filter((z) => !infoVon(z).berechnet);

export const euerZeileSchema = z.enum(
  EUER_ZEILEN_ZUORDENBAR as [EuerZeile, ...EuerZeile[]],
  'Bitte wähle eine gültige EÜR-Zeile.',
);

export const euerZeileLabel = (zeile: EuerZeile): string => EUER_ZEILEN[zeile].label;
export const euerZeileSeite = (zeile: EuerZeile): EuerSeite => EUER_ZEILEN[zeile].seite;

/** Kontoarten that can carry an EÜR line. */
export const EUER_KONTO_ARTEN = ['erloes', 'aufwand', 'neutral'] as const;
export const kontoHatEuerZeile = (art: string): boolean =>
  (EUER_KONTO_ARTEN as readonly string[]).includes(art);

/** Id of the Neutral account for Umsatzsteuer payments to / refunds from the Finanzamt. */
export const UST_FINANZAMT_KONTO_ID = 'ust-finanzamt';
