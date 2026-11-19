import { z } from 'zod';
import {
  finanzDatumSchema,
  formatEuro,
  idempotenzSchluessel,
  stueckelungZeileSchema,
  type FinanzMitgliedDto,
  type HashZeile,
  type StueckelungDto,
} from './finanzen';

// Finanzen Belege (see docs/finanzen.md): a Beleg is an expense with an optional file. Pure logic
// only: the totals per tax rate, the journal lines of a Beleg and of an Erstattung, validation, and
// the open Auslagen. Money is whole cents, tax rates are basis points (1900 = 19 %), quantities are
// thousandths (1500 = 1,5).

/** Tax rates offered on a Beleg (basis points). */
export const STEUERSAETZE = [1900, 700, 0] as const;

export const BELEG_MODI = ['brutto', 'netto'] as const;
export type BelegModus = (typeof BELEG_MODI)[number];
export const BELEG_MODUS_LABELS: Record<BelegModus, string> = { brutto: 'Brutto', netto: 'Netto' };

export const ZAHLWEGE = ['bar', 'bank', 'auslage'] as const;
export type Zahlweg = (typeof ZAHLWEGE)[number];
export const ZAHLWEG_LABELS: Record<Zahlweg, string> = {
  bar: 'Bar (aus dem Safe)',
  bank: 'Bank',
  auslage: 'Auslage eines Mitglieds',
};

/** Konto the Auslagen of members are booked to until they are reimbursed. */
export const AUSLAGEN_KONTO_ID = 'auslagen';

/** Allowed file types of a Beleg and the file extension of the archive key. */
export const BELEG_DATEI_TYPEN = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
] as const;
export type BelegDateiTyp = (typeof BELEG_DATEI_TYPEN)[number];
export const BELEG_DATEI_ENDUNGEN: Record<BelegDateiTyp, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
};
export const BELEG_DATEI_MAX_BYTES = 20 * 1024 * 1024;
/** Key of a Beleg file in the archive bucket: the same file always has the same key. */
export const belegDateiSchluessel = (sha256: string, typ: BelegDateiTyp) =>
  `belege/${sha256}.${BELEG_DATEI_ENDUNGEN[typ]}`;

/** Largest correction per tax rate (netto and steuer each), in cent. */
export const BELEG_KORREKTUR_MAX_CENT = 10;
/** Amounts above this get a warning when booking (cent). */
export const BELEG_BETRAG_WARNUNG_CENT = 50_000;
/** Largest amount of one item (keeps the arithmetic exact). */
export const BELEG_POSTEN_MAX_CENT = 10_000_000;
export const BELEG_POSTEN_ANZAHL_MAX = 100;
/** The list of Belege returns at most this many entries (the newest ones). */
export const BELEGE_MAX = 500;

// ----- Schemas

const nullish = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v): z.output<T> | null => v ?? null);

const sha256Feld = z
  .string('Der Datei-Hash fehlt.')
  .regex(/^[0-9a-f]{64}$/, 'Ungültiger Datei-Hash.');
const dateiTypFeld = z.enum(BELEG_DATEI_TYPEN, 'Erlaubt sind PDF, JPEG, PNG und HEIC.');
const dateiNameFeld = z
  .string('Der Dateiname fehlt.')
  .trim()
  .min(1, 'Der Dateiname fehlt.')
  .max(200, 'Der Dateiname ist zu lang.');

/** The file of a Beleg as stored in the draft and the Beleg. */
export const belegDateiSchema = z
  .object({
    sha256: sha256Feld,
    schluessel: z.string().min(1),
    typ: dateiTypFeld,
    name: dateiNameFeld,
  })
  .refine(
    (d) => d.schluessel === belegDateiSchluessel(d.sha256, d.typ),
    'Ungültiger Dateischlüssel.',
  );
export type BelegDatei = z.output<typeof belegDateiSchema>;

/** Body of `POST /api/finanzen/beleg-dateien/upload`. */
export const belegDateiUploadSchema = z.object({
  sha256: sha256Feld,
  groesse: z
    .number('Bitte gib die Dateigröße an.')
    .int()
    .min(1, 'Die Datei ist leer.')
    .max(BELEG_DATEI_MAX_BYTES, 'Die Datei ist größer als 20 MB.'),
  typ: dateiTypFeld,
  name: dateiNameFeld,
});
export type BelegDateiUpload = z.output<typeof belegDateiUploadSchema>;

const centFeld = z
  .number('Bitte gib einen Betrag an.')
  .int('Beträge müssen ganze Cent sein.')
  .min(-BELEG_POSTEN_MAX_CENT, 'Der Betrag ist zu groß.')
  .max(BELEG_POSTEN_MAX_CENT, 'Der Betrag ist zu groß.');
const steuersatzFeld = z
  .number('Bitte gib einen Steuersatz an.')
  .int('Der Steuersatz muss in ganzen Basispunkten angegeben werden.')
  .min(0, 'Der Steuersatz darf nicht negativ sein.')
  .max(10000, 'Der Steuersatz darf höchstens 100 % betragen.');

export const belegPostenSchema = z.object({
  /** Konto of the kind `aufwand`; null while the draft is incomplete. */
  kategorieId: nullish(z.string().min(1)),
  text: z.string().trim().max(200, 'Höchstens 200 Zeichen erlaubt.').default(''),
  /** Thousandths: 1500 = 1,5. */
  anzahlMilli: z
    .number('Bitte gib eine Anzahl an.')
    .int('Die Anzahl ist ungültig.')
    .min(-1_000_000, 'Die Anzahl ist zu groß.')
    .max(1_000_000, 'Die Anzahl ist zu groß.'),
  einzelpreisCent: centFeld,
  steuersatz: steuersatzFeld,
});
export type BelegPosten = z.output<typeof belegPostenSchema>;

export const belegKorrekturSchema = z.object({
  steuersatz: steuersatzFeld,
  nettoCent: centFeld,
  steuerCent: centFeld,
});
export type BelegKorrektur = z.output<typeof belegKorrekturSchema>;

/** The form state of a Beleg; everything can still be missing in a draft. */
export const belegEntwurfDatenSchema = z.object({
  rechnungsstellerId: nullish(z.string().min(1)),
  belegdatum: nullish(finanzDatumSchema),
  modus: z.enum(BELEG_MODI, 'Bitte wähle Brutto oder Netto.').default('brutto'),
  posten: z
    .array(belegPostenSchema)
    .max(BELEG_POSTEN_ANZAHL_MAX, `Höchstens ${BELEG_POSTEN_ANZAHL_MAX} Posten erlaubt.`)
    .default([]),
  korrekturen: z.array(belegKorrekturSchema).max(STEUERSAETZE.length).default([]),
  zahlweg: nullish(z.enum(ZAHLWEGE, 'Bitte wähle einen Zahlweg.')),
  bezahldatum: nullish(finanzDatumSchema),
  /** Fach the cash comes from (Zahlweg bar). */
  fachId: nullish(z.string().min(1)),
  /** Signed counts as booked on the Fach: given notes negative, change positive; sum = - Summe. */
  stueckelung: z.array(stueckelungZeileSchema).default([]),
  /** Cognito sub of the member who paid (Zahlweg Auslage). */
  mitgliedId: nullish(z.string().min(1)),
  /** Required without a file (Eigenbeleg). */
  eigenbelegBegruendung: nullish(z.string().trim().max(500, 'Höchstens 500 Zeichen erlaubt.')),
  datei: nullish(belegDateiSchema),
});
export type BelegEntwurfDaten = z.output<typeof belegEntwurfDatenSchema>;
export type BelegEntwurfDatenInput = z.input<typeof belegEntwurfDatenSchema>;

/** Body of `POST /api/finanzen/beleg-entwuerfe` and `PUT /api/finanzen/beleg-entwuerfe/:id`. */
export const belegEntwurfSchema = z.object({ daten: belegEntwurfDatenSchema });

/** Body of `POST /api/finanzen/beleg-entwuerfe/:id/buchen`. */
export const belegBuchenSchema = z.object({
  idempotenzSchluessel,
  /** Codes of the warnings the user has seen and confirmed (`BelegWarnungDto.code`). */
  bestaetigt: z.array(z.string()).max(50).default([]),
});
export type BelegBuchen = z.output<typeof belegBuchenSchema>;

const rechnungsstellerName = z
  .string('Bitte gib einen Namen ein.')
  .trim()
  .min(1, 'Bitte gib einen Namen ein.')
  .max(120, 'Höchstens 120 Zeichen erlaubt.');
export const rechnungsstellerEingabeSchema = z.object({ name: rechnungsstellerName });
export const rechnungsstellerAendernSchema = z
  .object({ name: rechnungsstellerName.optional(), archiviert: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.archiviert !== undefined, 'Bitte gib eine Änderung an.');

export const BELEG_STATUS = ['entwurf', 'gebucht', 'storniert'] as const;
export type BelegStatus = (typeof BELEG_STATUS)[number];
export const BELEG_STATUS_LABELS: Record<BelegStatus, string> = {
  entwurf: 'Entwurf',
  gebucht: 'Gebucht',
  storniert: 'Storniert',
};

/** Query of `GET /api/finanzen/belege`; `von`/`bis` filter the Belegdatum. */
export const belegeAbfrageSchema = z.object({
  status: z.enum(BELEG_STATUS).optional(),
  rechnungsstellerId: z.string().min(1).optional(),
  von: finanzDatumSchema.optional(),
  bis: finanzDatumSchema.optional(),
  zahlweg: z.enum(ZAHLWEGE).optional(),
  mitgliedId: z.string().min(1).optional(),
});
export type BelegeAbfrage = z.output<typeof belegeAbfrageSchema>;

/** Body of `POST /api/finanzen/erstattungen`. */
export const erstattungEingabeSchema = z
  .object({
    idempotenzSchluessel,
    mitgliedId: z.string('Bitte wähle ein Mitglied.').min(1, 'Bitte wähle ein Mitglied.'),
    belegIds: z
      .array(z.string().min(1))
      .min(1, 'Bitte wähle mindestens einen Beleg.')
      .max(200, 'Höchstens 200 Belege auf einmal.'),
    datum: finanzDatumSchema,
    zahlweg: z.enum(['bar', 'bank'], 'Bitte wähle Bar oder Bank.'),
    fachId: nullish(z.string().min(1)),
    stueckelung: z.array(stueckelungZeileSchema).default([]),
  })
  .refine((v) => v.zahlweg !== 'bar' || v.fachId !== null, {
    message: 'Bitte wähle das Fach, aus dem bar gezahlt wird.',
    path: ['fachId'],
  });
export type ErstattungEingabe = z.output<typeof erstattungEingabeSchema>;

// ----- Calculation

export interface BelegRechnung {
  modus: BelegModus;
  posten: readonly Pick<BelegPosten, 'anzahlMilli' | 'einzelpreisCent' | 'steuersatz'>[];
  korrekturen: readonly BelegKorrektur[];
}

export interface SteuersatzSumme {
  satz: number;
  netto: number;
  steuer: number;
  brutto: number;
}

export interface BelegBerechnung {
  /** Amount per item as typed on the Beleg (gross for Brutto, net for Netto). */
  postenBetraege: number[];
  /** Per tax rate, highest rate first. */
  jeSteuersatz: SteuersatzSumme[];
  summe: number;
  fehler: string[];
}

/** Rounds half away from zero, so a Gutschrift mirrors the same positive amount. */
const runde = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x));

/** Amount of an item: quantity (thousandths) times unit price. */
export const postenBetrag = (p: { anzahlMilli: number; einzelpreisCent: number }): number =>
  runde((p.anzahlMilli * p.einzelpreisCent) / 1000);

/**
 * Totals of a Beleg per tax rate. Brutto: the tax of a rate is its gross sum minus the rounded net
 * (`brutto - round(brutto / (1 + satz))`). Netto: tax = `round(netto * satz)` plus the correction,
 * which may move netto and tax of a rate by at most 10 ct each so the sums match the paper Beleg.
 * The tax is calculated on the sum of a rate, not per item.
 */
export function belegBerechnen(beleg: BelegRechnung): BelegBerechnung {
  const fehler: string[] = [];
  const postenBetraege = beleg.posten.map(postenBetrag);
  if (postenBetraege.some((b) => Math.abs(b) > BELEG_POSTEN_MAX_CENT))
    fehler.push('Ein Posten ist zu groß.');
  const summen = new Map<number, number>();
  beleg.posten.forEach((p, i) =>
    summen.set(p.steuersatz, (summen.get(p.steuersatz) ?? 0) + postenBetraege[i]!),
  );
  const korrekturen = new Map<number, BelegKorrektur>();
  for (const k of beleg.korrekturen) {
    if (korrekturen.has(k.steuersatz)) fehler.push('Ein Steuersatz hat mehrere Korrekturen.');
    korrekturen.set(k.steuersatz, k);
    if (k.nettoCent === 0 && k.steuerCent === 0) continue;
    if (beleg.modus === 'brutto') fehler.push('Korrekturen gibt es nur bei Netto-Belegen.');
    else if (!summen.has(k.steuersatz))
      fehler.push('Eine Korrektur gehört zu keinem Steuersatz des Belegs.');
    else if (
      Math.abs(k.nettoCent) > BELEG_KORREKTUR_MAX_CENT ||
      Math.abs(k.steuerCent) > BELEG_KORREKTUR_MAX_CENT
    )
      fehler.push(`Eine Korrektur darf höchstens ${BELEG_KORREKTUR_MAX_CENT} ct betragen.`);
  }
  const jeSteuersatz: SteuersatzSumme[] = [...summen]
    .sort((a, b) => b[0] - a[0])
    .map(([satz, summe]) => {
      if (beleg.modus === 'brutto') {
        const netto = runde((summe * 10000) / (10000 + satz));
        return { satz, netto, steuer: summe - netto, brutto: summe };
      }
      const k = korrekturen.get(satz);
      const netto = summe + (k?.nettoCent ?? 0);
      const steuer = runde((summe * satz) / 10000) + (k?.steuerCent ?? 0);
      return { satz, netto, steuer, brutto: netto + steuer };
    });
  const summe = jeSteuersatz.reduce((s, g) => s + g.brutto, 0);
  if (beleg.posten.length > 0 && summe <= 0)
    fehler.push('Die Summe des Belegs muss größer als 0 sein.');
  return { postenBetraege, jeSteuersatz, summe, fehler };
}

/** Splits `gesamt` by weight (rounded); the rest cent goes to the largest weight. */
function verteile(gesamt: number, gewichte: readonly number[]): number[] {
  const summe = gewichte.reduce((s, g) => s + g, 0);
  if (summe === 0) return gewichte.map((_, i) => (i === 0 ? gesamt : 0));
  const anteile = gewichte.map((g) => runde((gesamt * g) / summe));
  const rest = gesamt - anteile.reduce((s, a) => s + a, 0);
  anteile[gewichte.indexOf(Math.max(...gewichte))]! += rest;
  return anteile;
}

export type BelegZeile = Omit<HashZeile, 'pos' | 'stueckelung'> & { stueckelung: StueckelungDto[] };

/** The counter side of a Beleg: Fach (with signed denominations), Bank or Auslagen. */
export interface BelegGegenkonto {
  kontoId: string;
  stueckelung?: readonly StueckelungDto[];
}

const OHNE_STEUER = {
  nettoCent: null,
  steuerCent: null,
  steuersatz: null,
  steuerArt: 'keine',
} as const;

/**
 * The journal lines of a Beleg: one Aufwand line (gross, with the Vorsteuer fields) per category and
 * tax rate; the tax of a rate is split over its categories by amount, the rest cent goes to the
 * largest one. The counter line takes the whole amount. The lines add up to 0.
 */
export function belegBuchungszeilen(
  beleg: Omit<BelegRechnung, 'posten'> & {
    posten: readonly (BelegRechnung['posten'][number] & { kategorieId: string })[];
  },
  gegenkonto: BelegGegenkonto,
): BelegZeile[] {
  const b = belegBerechnen(beleg);
  const zeilen: BelegZeile[] = [];
  for (const g of b.jeSteuersatz) {
    const jeKategorie = new Map<string, number>();
    beleg.posten.forEach((p, i) => {
      if (p.steuersatz === g.satz)
        jeKategorie.set(
          p.kategorieId,
          (jeKategorie.get(p.kategorieId) ?? 0) + b.postenBetraege[i]!,
        );
    });
    const ids = [...jeKategorie.keys()];
    const gewichte = ids.map((id) => Math.abs(jeKategorie.get(id)!));
    const netto = verteile(g.netto, gewichte);
    const steuer = verteile(g.steuer, gewichte);
    ids.forEach((kontoId, i) => {
      const betragCent = netto[i]! + steuer[i]!;
      if (betragCent === 0 && netto[i] === 0) return;
      zeilen.push({
        kontoId,
        betragCent,
        stueckelung: [],
        ...(g.satz > 0
          ? {
              nettoCent: netto[i]!,
              steuerCent: steuer[i]!,
              steuersatz: g.satz,
              steuerArt: 'vorsteuer' as const,
            }
          : OHNE_STEUER),
      });
    });
  }
  zeilen.push({
    kontoId: gegenkonto.kontoId,
    betragCent: -b.summe,
    stueckelung: (gegenkonto.stueckelung ?? []).map((s) => ({ ...s })),
    ...OHNE_STEUER,
  });
  return zeilen;
}

/** The lines of an Erstattung: Auslagen (Soll) against Fach or Bank. */
export function erstattungBuchungszeilen(summeCent: number, ziel: BelegGegenkonto): BelegZeile[] {
  return [
    { kontoId: AUSLAGEN_KONTO_ID, betragCent: summeCent, stueckelung: [], ...OHNE_STEUER },
    {
      kontoId: ziel.kontoId,
      betragCent: -summeCent,
      stueckelung: (ziel.stueckelung ?? []).map((s) => ({ ...s })),
      ...OHNE_STEUER,
    },
  ];
}

/** `B-2027-0001` */
export const belegNummer = (jahr: number, n: number): string =>
  `B-${jahr}-${String(n).padStart(4, '0')}`;

export const belegBuchungstext = (nummer: string, rechnungssteller: string): string =>
  `Beleg ${nummer}: ${rechnungssteller}`;

export const erstattungBuchungstext = (mitglied: string, anzahl: number): string =>
  `Erstattung Auslagen an ${mitglied} (${anzahl} ${anzahl === 1 ? 'Beleg' : 'Belege'})`;

// ----- Validation

export interface BelegFehler {
  /** `rechnungssteller`, `belegdatum`, `posten`, `korrekturen`, `datei`, `zahlweg`, `bezahldatum`, `fach`, `stueckelung`, `mitglied`. */
  feld: string;
  meldung: string;
}

/** Whether the draft is complete enough to book: required fields, items, file or reason, Zahlweg fields. */
export function belegPruefen(daten: BelegEntwurfDaten): BelegFehler[] {
  const fehler: BelegFehler[] = [];
  const f = (feld: string, meldung: string) => fehler.push({ feld, meldung });
  if (!daten.rechnungsstellerId) f('rechnungssteller', 'Bitte wähle einen Rechnungssteller.');
  if (!daten.belegdatum) f('belegdatum', 'Bitte gib das Belegdatum an.');
  if (daten.posten.length === 0) f('posten', 'Bitte gib mindestens einen Posten an.');
  daten.posten.forEach((p, i) => {
    if (!p.kategorieId) f('posten', `Posten ${i + 1}: Bitte wähle eine Kategorie.`);
    if (p.anzahlMilli === 0) f('posten', `Posten ${i + 1}: Die Anzahl darf nicht 0 sein.`);
  });
  const rechnung = belegBerechnen(daten);
  for (const m of rechnung.fehler) f(m.includes('Korrektur') ? 'korrekturen' : 'posten', m);
  if (!daten.datei && !daten.eigenbelegBegruendung)
    f('datei', 'Bitte lade den Beleg hoch oder begründe, warum es keinen gibt (Eigenbeleg).');
  if (!daten.zahlweg) {
    f('zahlweg', 'Bitte wähle einen Zahlweg.');
    return fehler;
  }
  if (daten.zahlweg !== 'auslage' && !daten.bezahldatum)
    f('bezahldatum', 'Bitte gib das Bezahldatum an.');
  if (daten.zahlweg === 'auslage' && !daten.mitgliedId)
    f('mitglied', 'Bitte wähle das Mitglied, das bezahlt hat.');
  if (daten.zahlweg === 'bar') {
    if (!daten.fachId) f('fach', 'Bitte wähle das Fach, aus dem bar gezahlt wurde.');
    const wert = daten.stueckelung.reduce((s, x) => s + x.nennwertCent * x.anzahl, 0);
    if (daten.stueckelung.length === 0) f('stueckelung', 'Bitte gib die Stückelung an.');
    else if (rechnung.fehler.length === 0 && wert !== -rechnung.summe)
      f(
        'stueckelung',
        `Die Stückelung (${formatEuro(-wert)} Abgang) passt nicht zur Summe (${formatEuro(rechnung.summe)}).`,
      );
  }
  return fehler;
}

// ----- Open Auslagen

export interface AuslageBeleg {
  id: string;
  mitgliedId: string | null;
  zahlweg: Zahlweg;
  summeCent: number;
  buchungId: string;
}

export interface OffeneAuslagen<B> {
  mitgliedId: string;
  summeCent: number;
  belege: B[];
}

/**
 * The Auslagen not yet reimbursed, per member: Belege with Zahlweg Auslage whose booking is not
 * reversed and that no Erstattung with a booking that is not reversed covers. `stornierte` holds the
 * ids of reversed bookings, so a reversed Erstattung frees its Belege again.
 */
export function offeneAuslagen<B extends AuslageBeleg>(
  belege: readonly B[],
  erstattungen: readonly { buchungId: string; belegIds: readonly string[] }[],
  stornierte: ReadonlySet<string>,
): OffeneAuslagen<B>[] {
  const erstattet = new Set(
    erstattungen.filter((e) => !stornierte.has(e.buchungId)).flatMap((e) => e.belegIds),
  );
  const jeMitglied = new Map<string, B[]>();
  for (const b of belege) {
    if (b.zahlweg !== 'auslage' || !b.mitgliedId) continue;
    if (stornierte.has(b.buchungId) || erstattet.has(b.id)) continue;
    jeMitglied.set(b.mitgliedId, [...(jeMitglied.get(b.mitgliedId) ?? []), b]);
  }
  return [...jeMitglied]
    .map(([mitgliedId, liste]) => ({
      mitgliedId,
      summeCent: liste.reduce((s, b) => s + b.summeCent, 0),
      belege: liste,
    }))
    .sort((a, b) => a.mitgliedId.localeCompare(b.mitgliedId));
}

// ----- DTOs

export interface RechnungsstellerDto {
  id: string;
  name: string;
  archiviert: boolean;
  /** When a Beleg of it was booked last (ISO), for pre-selecting the last used. */
  zuletztAm: string | null;
}

export interface BelegWarnungDto {
  /** Stable code the client sends back in `bestaetigt`. */
  code: string;
  text: string;
}

export interface BelegEntwurfEintrag {
  id: string;
  daten: BelegEntwurfDaten;
  erstelltVon: string;
  erstelltAm: string;
  geaendertAm: string;
}

/** `GET /api/finanzen/beleg-entwuerfe/:id`. */
export interface BelegEntwurfDto {
  id: string;
  daten: BelegEntwurfDaten;
  /** Presigned URL of the file (valid for an hour). */
  dateiUrl: string | null;
  warnungen: BelegWarnungDto[];
  erstelltVon: FinanzMitgliedDto | null;
  erstelltAm: string;
  geaendertAm: string;
}

/** Entry of the Beleg list: a draft (no number yet) or a booked Beleg. */
export interface BelegListeEintrag {
  id: string;
  status: BelegStatus;
  nummer: string | null;
  rechnungsstellerId: string | null;
  rechnungssteller: string | null;
  belegdatum: string | null;
  summeCent: number | null;
  zahlweg: Zahlweg | null;
  mitgliedId: string | null;
  hatDatei: boolean;
  erstelltAm: string;
}

export interface BelegListeDto extends Omit<BelegListeEintrag, 'mitgliedId'> {
  mitglied: FinanzMitgliedDto | null;
}

export interface BelegeSeiteDto {
  belege: BelegListeDto[];
  /** More Belege matched than returned. */
  gekappt: boolean;
}

export interface BelegPostenDto {
  pos: number;
  kategorieId: string;
  kategorieName: string;
  text: string;
  anzahlMilli: number;
  einzelpreisCent: number;
  steuersatz: number;
  betragCent: number;
}

export interface BelegDateiInfo {
  sha256: string;
  schluessel: string;
  typ: BelegDateiTyp;
  name: string;
}

export interface BelegErstattungVerweis {
  id: string;
  datum: string;
  buchung: { id: string; seq: number };
}

export interface BelegDetailEintrag {
  id: string;
  nummer: string;
  rechnungsstellerId: string;
  rechnungssteller: string;
  belegdatum: string;
  modus: BelegModus;
  zahlweg: Zahlweg;
  /** Bar/Bank: as booked; Auslage: the date of the Erstattung, null while open. */
  bezahldatum: string | null;
  mitgliedId: string | null;
  eigenbelegBegruendung: string | null;
  datei: BelegDateiInfo | null;
  posten: BelegPostenDto[];
  korrekturen: BelegKorrektur[];
  jeSteuersatz: SteuersatzSumme[];
  summeCent: number;
  buchung: { id: string; seq: number };
  /** The booking of the Beleg is reversed. */
  storniert: boolean;
  erstattung: BelegErstattungVerweis | null;
  erstelltVon: string;
  erstelltAm: string;
}

/** `GET /api/finanzen/belege/:id`. */
export interface BelegDetailDto extends Omit<
  BelegDetailEintrag,
  'mitgliedId' | 'erstelltVon' | 'datei'
> {
  mitglied: FinanzMitgliedDto | null;
  erstelltVon: FinanzMitgliedDto | null;
  datei: (BelegDateiInfo & { url: string }) | null;
}

/** Result of booking a draft. */
export interface BelegGebuchtDto {
  id: string;
  nummer: string;
  buchungId: string;
  buchungSeq: number;
  wiederholt?: boolean;
}

/** `POST /api/finanzen/beleg-dateien/upload`. */
export interface BelegUploadDto {
  uploadUrl: string;
  schluessel: string;
  /** Base64 SHA-256: the browser sends it as `x-amz-checksum-sha256` together with `Content-Type`. */
  checksumSha256: string;
  /** The same file is already part of a booked Beleg. */
  schonGebucht: { id: string; nummer: string } | null;
}

export interface AuslageBelegEintrag extends AuslageBeleg {
  nummer: string;
  rechnungssteller: string;
  belegdatum: string;
}

export type AuslageMitgliedEintrag = OffeneAuslagen<AuslageBelegEintrag>;

export interface AuslageMitgliedDto extends Omit<AuslageMitgliedEintrag, 'mitgliedId'> {
  mitglied: FinanzMitgliedDto | null;
  mitgliedId: string;
}

/** `GET /api/finanzen/auslagen`. */
export interface AuslagenDto {
  mitglieder: AuslageMitgliedDto[];
}

export interface ErstattungErgebnisDto {
  id: string;
  buchungId: string;
  buchungSeq: number;
  summeCent: number;
  wiederholt?: boolean;
}
