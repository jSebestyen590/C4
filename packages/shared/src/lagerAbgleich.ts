import { z } from 'zod';
import { finanzDatumSchema, type FinanzMitgliedDto } from './finanzen';
import { bestandAnzeigen, inBasiseinheiten, type Gebinde } from './waren';

// Lager-Beleg-Abgleich (see docs/finanzen.md): per Ware compares what was stocked (Einlagerungen, Ist) with
// what the booked Belege say was bought (Ware-Posten, Soll). All amounts are in base units (smallest Gebinde).
// Diskrepanz = Σ Ist − Σ Soll − Σ Korrektur. Pure functions only.

export const ABGLEICH_GRUENDE = ['bruch', 'haendler', 'sonstiges'] as const;
export type AbgleichGrund = (typeof ABGLEICH_GRUENDE)[number];

export const ABGLEICH_GRUND_LABELS: Record<AbgleichGrund, string> = {
  bruch: 'Bruch beim Einlagern',
  haendler: 'Fehler beim Händler',
  sonstiges: 'Sonstiges',
};

/** Key of the Stichtag in the `einstellungen` table. */
export const ABGLEICH_STICHTAG_SCHLUESSEL = 'lager_abgleich_stichtag';

export const abgleichStichtagSchema = z.object({ stichtag: finanzDatumSchema });
export type AbgleichStichtagEingabe = z.infer<typeof abgleichStichtagSchema>;

export const abgleichKorrekturSchema = z
  .object({
    wareId: z.string('Bitte wähle eine Ware.').min(1, 'Bitte wähle eine Ware.'),
    menge: z
      .number('Bitte gib eine Menge an.')
      .int('Die Menge muss eine ganze Zahl sein.')
      .safe('Die Menge ist zu groß.')
      .refine((m) => m !== 0, 'Die Menge darf nicht 0 sein.'),
    grund: z.enum(ABGLEICH_GRUENDE, 'Bitte wähle einen Grund.'),
    text: z
      .string()
      .trim()
      .max(500, 'Höchstens 500 Zeichen erlaubt.')
      .nullish()
      .transform((t) => t || null),
    datum: finanzDatumSchema,
  })
  .refine((e) => e.grund !== 'sonstiges' || e.text !== null, {
    message: 'Bitte beschreibe den Grund.',
    path: ['text'],
  });
export type AbgleichKorrekturEingabe = z.infer<typeof abgleichKorrekturSchema>;

// ----- Input of the pure function (base units, dates as Berlin `YYYY-MM-DD`)

export interface AbgleichIst {
  wareId: string;
  datum: string;
  /** Base units, positive (Zugang). */
  menge: number;
  vorgangId: string;
  lagerortName: string | null;
  /** Sortable timestamp (ISO) to order Ist entries of the same day. */
  zeit?: string;
}

export interface AbgleichSoll {
  wareId: string;
  /** Belegdatum. */
  datum: string;
  /** Base units, signed as booked (a return is negative). */
  menge: number;
  belegId: string;
  belegNummer: string;
  /** Reversed Belege do not count. */
  storniert: boolean;
}

export interface AbgleichKorrektur {
  id: string;
  wareId: string;
  datum: string;
  /** Base units, signed. */
  menge: number;
  grund: AbgleichGrund;
  text: string | null;
  /** Cognito sub. */
  erstelltVon: string;
  /** Sortable timestamp (ISO of `erstellt_am`) to order Korrekturen of the same day. */
  zeit?: string;
}

export type AbgleichEreignis =
  | ({ art: 'ist' } & Omit<AbgleichIst, 'wareId'>)
  | ({ art: 'soll' } & Omit<AbgleichSoll, 'wareId' | 'storniert'>)
  | ({ art: 'korrektur' } & Omit<AbgleichKorrektur, 'wareId'>);

/** A timeline entry with the running Diskrepanz after it. */
export type AbgleichZeitleistenEintrag = AbgleichEreignis & { diskrepanz: number };

export interface AbgleichWare {
  wareId: string;
  ist: number;
  soll: number;
  korrektur: number;
  diskrepanz: number;
  zeitleiste: AbgleichZeitleistenEintrag[];
}

const REIHENFOLGE = { ist: 0, soll: 1, korrektur: 2 } as const;

/** Order within the same day and art: Ist by time, Soll by Belegnummer, Korrektur by creation time. */
const zeitschluessel = (e: AbgleichEreignis): string =>
  e.art === 'soll' ? e.belegNummer : (e.zeit ?? '');

/**
 * Per Ware the sums, the Diskrepanz and the chronological timeline (same day: Ist, Soll, Korrektur).
 * Only entries from the Stichtag on count; Ist rows of one Vorgang and Soll rows of one Beleg are merged.
 * Waren are sorted by id; Waren without any entry do not appear.
 */
export function lagerAbgleich(eingabe: {
  stichtag: string;
  ist: AbgleichIst[];
  soll: AbgleichSoll[];
  korrekturen: AbgleichKorrektur[];
}): AbgleichWare[] {
  const { stichtag } = eingabe;
  const ereignisse = new Map<string, AbgleichEreignis[]>();
  const hinzu = (wareId: string, e: AbgleichEreignis) => {
    const liste = ereignisse.get(wareId);
    if (liste) liste.push(e);
    else ereignisse.set(wareId, [e]);
  };

  const istJe = new Map<string, Extract<AbgleichEreignis, { art: 'ist' }> & { wareId: string }>();
  for (const z of eingabe.ist) {
    if (z.datum < stichtag) continue;
    const key = `${z.wareId}|${z.vorgangId}`;
    const vorhanden = istJe.get(key);
    if (vorhanden) {
      vorhanden.menge += z.menge;
      if (z.zeit && (!vorhanden.zeit || z.zeit < vorhanden.zeit)) vorhanden.zeit = z.zeit;
    } else istJe.set(key, { art: 'ist', ...z });
  }
  for (const { wareId, ...e } of istJe.values()) hinzu(wareId, { ...e, art: 'ist' });

  const sollJe = new Map<string, Extract<AbgleichEreignis, { art: 'soll' }> & { wareId: string }>();
  for (const z of eingabe.soll) {
    if (z.storniert || z.datum < stichtag) continue;
    const key = `${z.wareId}|${z.belegId}`;
    const vorhanden = sollJe.get(key);
    if (vorhanden) vorhanden.menge += z.menge;
    else {
      sollJe.set(key, {
        art: 'soll',
        wareId: z.wareId,
        datum: z.datum,
        menge: z.menge,
        belegId: z.belegId,
        belegNummer: z.belegNummer,
      });
    }
  }
  for (const { wareId, ...e } of sollJe.values()) hinzu(wareId, { ...e, art: 'soll' });

  for (const { wareId, ...e } of eingabe.korrekturen) {
    if (e.datum < stichtag) continue;
    hinzu(wareId, { ...e, art: 'korrektur' });
  }

  return [...ereignisse]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([wareId, liste]) => {
      const sortiert = liste
        .map((e, i) => ({ e, i }))
        .sort(
          (a, b) =>
            a.e.datum.localeCompare(b.e.datum) ||
            REIHENFOLGE[a.e.art] - REIHENFOLGE[b.e.art] ||
            zeitschluessel(a.e).localeCompare(zeitschluessel(b.e)) ||
            a.i - b.i,
        )
        .map((x) => x.e);
      let diskrepanz = 0;
      const summe = { ist: 0, soll: 0, korrektur: 0 };
      const zeitleiste = sortiert.map((e): AbgleichZeitleistenEintrag => {
        summe[e.art] += e.menge;
        diskrepanz += e.art === 'ist' ? e.menge : -e.menge;
        return { ...e, diskrepanz };
      });
      return { wareId, ...summe, diskrepanz, zeitleiste };
    });
}

// ----- Display

/**
 * Base units as mixed text, e.g. `1 Kasten, 3 Flaschen` (`-1 Kasten` for negative amounts, `0` for none):
 * the Ware's largest Obergebinde and the base units left over. Without an Obergebinde just the base units.
 */
export function basisMengeAnzeigen(
  menge: number,
  wareGebinde: readonly Gebinde[],
  alle: Gebinde[],
): string {
  if (menge === 0) return '0';
  const vorzeichen = menge < 0 ? '-' : '';
  const betrag = Math.abs(menge);
  const ober = [...wareGebinde]
    .filter((g) => g.unterGebindeId && (g.unterAnzahl ?? 0) > 0)
    .sort((a, b) => (b.unterAnzahl ?? 0) - (a.unterAnzahl ?? 0))[0];
  const basisId = ober?.unterGebindeId ?? wareGebinde.find((g) => !g.unterGebindeId)?.id;
  if (!basisId) return `${vorzeichen}${betrag}`;
  const mengen = ober
    ? [
        { gebindeId: ober.id, menge: Math.floor(betrag / ober.unterAnzahl!) },
        { gebindeId: basisId, menge: betrag % ober.unterAnzahl! },
      ]
    : [{ gebindeId: basisId, menge: betrag }];
  return vorzeichen + bestandAnzeigen(mengen, alle);
}

/** Anzahl × Gebinde in base units; `anzahlMilli` is in thousandths. */
export const sollMengeBasis = (anzahlMilli: number, gebindeId: string, alle: Gebinde[]): number =>
  Math.round(inBasiseinheiten(gebindeId, anzahlMilli, alle) / 1000);

// ----- DTOs

export interface LagerAbgleichWareKopfDto {
  wareId: string;
  name: string;
  warengruppe: string | null;
}

/** One row of the list; the numbers are base units, the `…Text` fields are mixed ready-to-show strings. */
export interface LagerAbgleichZeileDto extends LagerAbgleichWareKopfDto {
  ist: number;
  soll: number;
  korrektur: number;
  diskrepanz: number;
  istText: string;
  sollText: string;
  korrekturText: string;
  diskrepanzText: string;
}

/** `GET /api/lager-abgleich`; without a Stichtag `{ stichtag: null, waren: [] }`. */
export interface LagerAbgleichDto {
  stichtag: string | null;
  waren: LagerAbgleichZeileDto[];
}

export type LagerAbgleichEreignisDto = (
  | {
      art: 'ist';
      vorgangId: string;
      lagerortName: string | null;
    }
  | { art: 'soll'; belegId: string; belegNummer: string }
  | {
      art: 'korrektur';
      id: string;
      grund: AbgleichGrund;
      text: string | null;
      person: FinanzMitgliedDto | null;
    }
) & {
  datum: string;
  menge: number;
  mengeText: string;
  /** Running Diskrepanz after this entry. */
  diskrepanz: number;
  diskrepanzText: string;
};

/** `GET /api/lager-abgleich/waren/:id`. */
export interface LagerAbgleichWareDto {
  stichtag: string;
  ware: LagerAbgleichZeileDto;
  zeitleiste: LagerAbgleichEreignisDto[];
}
