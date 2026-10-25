import { z } from 'zod';

// Shared building blocks of the Waren and Inventar schemas (not part of the public API).

export const name = (feld = 'einen Namen') =>
  z.string().trim().min(1, `Bitte gib ${feld} ein.`).max(100, 'Höchstens 100 Zeichen erlaubt.');

export const beschreibung = z
  .string()
  .trim()
  .max(2000, 'Höchstens 2000 Zeichen erlaubt.')
  .transform((v) => (v === '' ? null : v))
  .nullish()
  .transform((v) => v ?? null);

export const idSchema = (meldung: string) => z.string().min(1, meldung);
export const parentIdSchema = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

export const anzahlSchema = z
  .number('Bitte gib eine Anzahl an.')
  .int('Die Anzahl muss eine ganze Zahl sein.')
  .min(1, 'Die Anzahl muss mindestens 1 sein.');

export const zeitpunktSchema = z.iso.datetime({ offset: true, error: 'Ungültiger Zeitpunkt.' });

export const kommentarSchema = z
  .string()
  .trim()
  .max(500, 'Höchstens 500 Zeichen erlaubt.')
  .transform((v) => (v === '' ? null : v))
  .nullish()
  .transform((v) => v ?? null);

export const eindeutig = (ids: string[]) => new Set(ids).size === ids.length;
