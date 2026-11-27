import { z } from 'zod';
import { heuteBerlin, monateVerschieben } from './datum';
import {
  finanzDatumSchema,
  formatEuro,
  idempotenzSchluessel,
  stueckelungZeileSchema,
  type FinanzMitgliedDto,
  type HashZeile,
  type StueckelungDto,
} from './finanzen';
import {
  steuersaetzeAm,
  steuersatzArtSchema,
  type SteuersatzArt,
  type SteuersatzZeitraum,
} from './steuersaetze';

// Finanzen Belege (see docs/finanzen.md): a Beleg is an expense with an optional file. Pure logic
// only: the totals per tax rate, the journal lines of a Beleg and of an Erstattung, validation, and
// the open Auslagen. Money is whole cents, tax rates are basis points (1900 = 19 %), quantities are
// thousandths (1500 = 1,5).

/** At most one correction per tax rate: regular, reduced and 0 (`steuersaetzeAm`). */
export const BELEG_KORREKTUREN_MAX = 3;
/** A Belegdatum older than this many months gets a warning when booking. */
export const BELEGDATUM_ALT_MONATE = 2;

/** Whether `belegdatum` is older than `BELEGDATUM_ALT_MONATE` months before `heute` (both `YYYY-MM-DD`). */
export const belegdatumAlt = (belegdatum: string, heute: string): boolean =>
  belegdatum < monateVerschieben(heute, -BELEGDATUM_ALT_MONATE);

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
/** Durchlauf Konto for deposit (Pfand) and returned empties (Leergut); its balance is the open Leergut. */
export const PFAND_KONTO_ID = 'pfand';

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

export const nullish = <T extends z.ZodType>(schema: T) =>
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

export const centFeld = z
  .number('Bitte gib einen Betrag an.')
  .int('Beträge müssen ganze Cent sein.')
  .min(-BELEG_POSTEN_MAX_CENT, 'Der Betrag ist zu groß.')
  .max(BELEG_POSTEN_MAX_CENT, 'Der Betrag ist zu groß.');
export const steuersatzFeld = z
  .number('Bitte gib einen Steuersatz an.')
  .int('Der Steuersatz muss in ganzen Basispunkten angegeben werden.')
  .min(0, 'Der Steuersatz darf nicht negativ sein.')
  .max(10000, 'Der Steuersatz darf höchstens 100 % betragen.');

export const BELEG_POSTEN_ARTEN = ['kategorie', 'ware', 'leergut'] as const;
export type BelegPostenArt = (typeof BELEG_POSTEN_ARTEN)[number];
export const BELEG_POSTEN_ART_LABELS: Record<BelegPostenArt, string> = {
  kategorie: 'Kategorie',
  ware: 'Ware (Lager)',
  leergut: 'Leergut',
};

const textFeld = z.string().trim().max(200, 'Höchstens 200 Zeichen erlaubt.').default('');
/** Thousandths: 1500 = 1,5. */
export const anzahlMilliFeld = z
  .number('Bitte gib eine Anzahl an.')
  .int('Die Anzahl ist ungültig.')
  .min(-1_000_000, 'Die Anzahl ist zu groß.')
  .max(1_000_000, 'Die Anzahl ist zu groß.');

/** Artikel of a Kategorie item (e.g. "Deko"), stored in `text`. */
const artikelFeld = z
  .string('Bitte gib den Artikel an.')
  .trim()
  .min(1, 'Bitte gib den Artikel an.')
  .max(100, 'Höchstens 100 Zeichen erlaubt.');

/**
 * Gesamtpreis of an item (without deposit): when set, the amount of the item is exactly this value and
 * the unit price is `einzelpreisAusGesamt` (info only). Null = amount from quantity times unit price.
 */
const gesamtFeld = nullish(centFeld);

/** The typed calculation of the price (`(7,99 + 4,50)/12`), kept in drafts only so it can be corrected later. */
const preisFormelFeld = z.string().trim().max(200, 'Höchstens 200 Zeichen erlaubt.').nullish();

/** Item booked to an Aufwand Konto. Drafts without `art` are of this kind. */
export const belegPostenKategorieSchema = z.object({
  art: z.literal('kategorie').default('kategorie'),
  /** Konto of the kind `aufwand`; null while the draft is incomplete. */
  kategorieId: nullish(z.string().min(1)),
  /** The Artikel (required). */
  text: artikelFeld,
  anzahlMilli: anzahlMilliFeld,
  einzelpreisCent: centFeld,
  gesamtCent: gesamtFeld,
  preisFormel: preisFormelFeld,
  steuersatz: steuersatzFeld,
});

/** Drafts may still miss the Artikel; `belegPruefen` requires it when booking. */
const belegPostenKategorieEntwurfSchema = belegPostenKategorieSchema.extend({
  text: z.string().trim().max(100, 'Höchstens 100 Zeichen erlaubt.').default(''),
});

/** Stock item: a Ware in a Gebinde. The unit price excludes the deposit, which is `pfandCent` per Gebinde. */
export const belegPostenWareSchema = z.object({
  art: z.literal('ware'),
  wareId: nullish(z.string().min(1)),
  gebindeId: nullish(z.string().min(1)),
  /** Aufwand Konto; suggested from the Warengruppe, required when booking. */
  kategorieId: nullish(z.string().min(1)),
  /** Number of Gebinde in thousandths. */
  anzahlMilli: anzahlMilliFeld,
  /** Price per Gebinde without deposit. */
  einzelpreisCent: centFeld,
  /** Gesamtpreis of the line without deposit (see `gesamtFeld`). */
  gesamtCent: gesamtFeld,
  preisFormel: preisFormelFeld,
  steuersatz: steuersatzFeld,
  /** Deposit per Gebinde; null = no deposit. */
  pfandCent: nullish(centFeld),
});

/**
 * Returned empties, booked against the Pfand Konto. The quantity counts the returned pieces (> 0 is a
 * return, 0 is caught by `belegPruefen`), the price is the deposit per piece (>= 0); the amount of the
 * item is negative (`postenBetrag`).
 */
export const belegPostenLeergutSchema = z.object({
  art: z.literal('leergut'),
  text: textFeld,
  anzahlMilli: anzahlMilliFeld.min(0, 'Die Anzahl beim Leergut darf nicht negativ sein.'),
  einzelpreisCent: centFeld.min(0, 'Der Pfand je Stück darf nicht negativ sein.'),
  preisFormel: preisFormelFeld,
  steuersatz: steuersatzFeld,
});

export const belegPostenSchema = z.discriminatedUnion('art', [
  belegPostenKategorieEntwurfSchema,
  belegPostenWareSchema,
  belegPostenLeergutSchema,
]);
export type BelegPosten = z.output<typeof belegPostenSchema>;
export type BelegPostenKategorie = z.output<typeof belegPostenKategorieSchema>;
export type BelegPostenWare = z.output<typeof belegPostenWareSchema>;
export type BelegPostenLeergut = z.output<typeof belegPostenLeergutSchema>;

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
  korrekturen: z.array(belegKorrekturSchema).max(BELEG_KORREKTUREN_MAX).default([]),
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
  /**
   * The total (gross) printed on the paper Beleg, typed by the Finanzer:in; null while not entered.
   * Prefilled from `eingereichtBetragCent` when a submitted Beleg is opened. `belegPruefen` requires
   * it and requires it to equal the sum of the Posten.
   */
  belegsummeCent: nullish(centFeld),
  /** Submitted by a member: the amount they stated (cent). */
  eingereichtBetragCent: nullish(centFeld),
  /** Submitted by a member: free name of the Rechnungssteller, a suggestion only. */
  rechnungsstellerName: nullish(z.string().trim().max(120, 'Höchstens 120 Zeichen erlaubt.')),
  /** Submitted by a member: free note. */
  notiz: nullish(z.string().trim().max(500, 'Höchstens 500 Zeichen erlaubt.')),
});
export type BelegEntwurfDaten = z.output<typeof belegEntwurfDatenSchema>;
export type BelegEntwurfDatenInput = z.input<typeof belegEntwurfDatenSchema>;

/** Body of `POST /api/finanzen/beleg-entwuerfe` and `PUT /api/finanzen/beleg-entwuerfe/:id`. */
export const belegEntwurfSchema = z.object({ daten: belegEntwurfDatenSchema });

/** Body of `POST /api/finanzen/einreichungen` (a member submits a Beleg; always an Auslage). */
export const belegEinreichenSchema = z.object({
  datei: belegDateiSchema,
  belegdatum: finanzDatumSchema.refine(
    (d) => d <= heuteBerlin(),
    'Das Belegdatum darf nicht in der Zukunft liegen.',
  ),
  betragCent: z
    .number('Bitte gib den Betrag an.')
    .int('Beträge müssen ganze Cent sein.')
    .min(-BELEG_POSTEN_MAX_CENT, 'Der Betrag ist zu groß.')
    .max(BELEG_POSTEN_MAX_CENT, 'Der Betrag ist zu groß.'),
  rechnungsstellerId: nullish(z.string().min(1)),
  rechnungsstellerName: nullish(z.string().trim().max(120, 'Höchstens 120 Zeichen erlaubt.')),
  notiz: nullish(z.string().trim().max(500, 'Höchstens 500 Zeichen erlaubt.')),
  /** Members split by Kategorie, Ware or Leergut; a Ware item gets its Kategorie from the Warengruppe. */
  posten: z
    .array(
      z.discriminatedUnion('art', [
        belegPostenKategorieSchema,
        belegPostenWareSchema.omit({ kategorieId: true }),
        belegPostenLeergutSchema,
      ]),
    )
    .max(BELEG_POSTEN_ANZAHL_MAX, `Höchstens ${BELEG_POSTEN_ANZAHL_MAX} Posten erlaubt.`)
    .default([]),
});
export type BelegEinreichen = z.output<typeof belegEinreichenSchema>;

/** Body of `PUT /api/finanzen/warengruppen/:id/kategorie`; null removes the assignment. */
export const warengruppeKategorieSchema = z.object({ kategorieId: nullish(z.string().min(1)) });
export type WarengruppeKategorieEingabe = z.output<typeof warengruppeKategorieSchema>;

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

// ----- Tax rate periods

const basispunkte = (was: string) =>
  z
    .number(`Bitte gib den ${was} an.`)
    .int(`Der ${was} muss in ganzen Basispunkten angegeben werden.`)
    .min(1, `Der ${was} muss größer als 0 sein.`)
    .max(10000, `Der ${was} darf höchstens 100 % betragen.`);

/** Body of `POST /api/finanzen/steuersatz-zeitraeume`. */
export const steuersatzZeitraumEingabeSchema = z
  .object({
    ab: finanzDatumSchema,
    regel: basispunkte('Regelsatz'),
    ermaessigt: basispunkte('ermäßigten Satz'),
  })
  .refine((v) => v.ermaessigt < v.regel, {
    message: 'Der ermäßigte Satz muss kleiner als der Regelsatz sein.',
    path: ['ermaessigt'],
  });
export type SteuersatzZeitraumEingabe = z.output<typeof steuersatzZeitraumEingabeSchema>;

// ----- Calculation

export interface BelegRechnung {
  modus: BelegModus;
  posten: readonly (Pick<BelegPosten, 'anzahlMilli' | 'einzelpreisCent' | 'steuersatz'> & {
    /** Leergut items count negative (`postenBetrag`); null counts as Kategorie. */
    art?: BelegPostenArt | null;
    /** Gesamtpreis of the line: the amount is exactly this (`postenBetrag`). */
    gesamtCent?: number | null;
    /** Deposit per Gebinde of a Ware item (the quantity is the number of Gebinde). */
    pfandCent?: number | null;
  })[];
  korrekturen: readonly BelegKorrektur[];
  /**
   * Eigenbeleg (no file, with a reason): no Vorsteuer, the whole amount is expense. When omitted it
   * follows from `datei` and `eigenbelegBegruendung` if present (a `BelegEntwurfDaten` works as is).
   */
  eigenbeleg?: boolean;
  datei?: unknown;
  eigenbelegBegruendung?: string | null;
}

/** Whether the Beleg is an Eigenbeleg (booked without Vorsteuer). */
export const istEigenbeleg = (
  b: Pick<BelegRechnung, 'eigenbeleg' | 'datei' | 'eigenbelegBegruendung'>,
): boolean => b.eigenbeleg ?? (!b.datei && !!b.eigenbelegBegruendung);

export interface SteuersatzSumme {
  satz: number;
  netto: number;
  steuer: number;
  brutto: number;
}

export interface BelegBerechnung {
  /** Amount per item as typed on the Beleg (gross for Brutto, net for Netto). */
  postenBetraege: number[];
  /** Deposit amount per item (0 without deposit); included in the totals per tax rate, not in `postenBetraege`. */
  pfandBetraege: number[];
  /** Per tax rate, highest rate first. */
  jeSteuersatz: SteuersatzSumme[];
  summe: number;
  fehler: string[];
}

/** Rounds half away from zero, so a Gutschrift mirrors the same positive amount. */
const runde = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x));

/**
 * Amount of an item: quantity (thousandths) times unit price, or exactly the Gesamtpreis when set
 * (not for Leergut). Leergut (a return) is negative: `-round(anzahl * Pfand)`.
 */
export const postenBetrag = (p: {
  anzahlMilli: number;
  einzelpreisCent: number;
  art?: BelegPostenArt | null;
  gesamtCent?: number | null;
}): number => {
  if (p.gesamtCent != null && p.art !== 'leergut') return p.gesamtCent;
  const betrag = runde((p.anzahlMilli * p.einzelpreisCent) / 1000);
  return p.art === 'leergut' ? -betrag : betrag;
};

/** Unit price of a Gesamtpreis line: `round(gesamt / anzahl)`; 0 without a quantity. */
export const einzelpreisAusGesamt = (gesamtCent: number, anzahlMilli: number): number =>
  anzahlMilli === 0 ? 0 : runde((gesamtCent * 1000) / anzahlMilli);

/** Plural table name of a Posten art as used in messages ("Waren, Zeile 2: ..."). */
export const BELEG_POSTEN_TABELLEN_LABELS: Record<BelegPostenArt, string> = {
  ware: 'Waren',
  kategorie: 'Kategorien',
  leergut: 'Leergut',
};

/** `Waren, Zeile 2`: `position` is the 1-based position within the items of that art. */
export const postenZeilenLabel = (art: BelegPostenArt, position: number): string =>
  `${BELEG_POSTEN_TABELLEN_LABELS[art]}, Zeile ${position}`;

/**
 * Totals of a Beleg per tax rate. Brutto: the tax of a rate is its gross sum minus the rounded net
 * (`brutto - round(brutto / (1 + satz))`). Netto: tax = `round(netto * satz)` plus the correction,
 * which may move netto and tax of a rate by at most 10 ct each so the sums match the paper Beleg.
 * The tax is calculated on the sum of a rate, not per item. An Eigenbeleg has no Vorsteuer: Brutto has
 * tax 0; Netto still adds the calculated tax to the paid amount, but it is expense, not Vorsteuer
 * (`belegBuchungszeilen`).
 */
export function belegBerechnen(beleg: BelegRechnung): BelegBerechnung {
  const fehler: string[] = [];
  const eigenbeleg = istEigenbeleg(beleg);
  const postenBetraege = beleg.posten.map((p) => postenBetrag(p));
  const pfandBetraege = beleg.posten.map((p) =>
    postenBetrag({ anzahlMilli: p.anzahlMilli, einzelpreisCent: p.pfandCent ?? 0 }),
  );
  if (postenBetraege.some((b, i) => Math.abs(b + pfandBetraege[i]!) > BELEG_POSTEN_MAX_CENT))
    fehler.push('Ein Posten ist zu groß.');
  const summen = new Map<number, number>();
  beleg.posten.forEach((p, i) =>
    summen.set(
      p.steuersatz,
      (summen.get(p.steuersatz) ?? 0) + postenBetraege[i]! + pfandBetraege[i]!,
    ),
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
        // Eigenbeleg: no Vorsteuer, the gross amount is the expense.
        if (eigenbeleg) return { satz, netto: summe, steuer: 0, brutto: summe };
        const netto = runde((summe * 10000) / (10000 + satz));
        return { satz, netto, steuer: summe - netto, brutto: summe };
      }
      const k = korrekturen.get(satz);
      const netto = summe + (k?.nettoCent ?? 0);
      const steuer = runde((summe * satz) / 10000) + (k?.steuerCent ?? 0);
      return { satz, netto, steuer, brutto: netto + steuer };
    });
  const summe = jeSteuersatz.reduce((s, g) => s + g.brutto, 0);
  return { postenBetraege, pfandBetraege, jeSteuersatz, summe, fehler };
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
 * The journal lines of a Beleg: one line (gross, with the Vorsteuer fields) per Konto and tax rate;
 * net and tax of a rate are calculated per Konto from its own signed amount, the rounding cent goes to the largest one. A Ware
 * item goes to its category, its deposit and every Leergut item to the Pfand Konto. The counter line
 * takes the whole amount. The lines add up to 0. An Eigenbeleg has no Vorsteuer: the lines carry the
 * gross amount with `steuerArt` `keine`.
 */
export function belegBuchungszeilen(
  beleg: Omit<BelegRechnung, 'posten'> & {
    posten: readonly (BelegRechnung['posten'][number] & {
      art?: BelegPostenArt;
      /** Required unless the item is Leergut. */
      kategorieId?: string | null;
    })[];
  },
  gegenkonto: BelegGegenkonto,
): BelegZeile[] {
  const b = belegBerechnen(beleg);
  const modus = beleg.modus;
  const eigenbeleg = istEigenbeleg(beleg);
  const zeilen: BelegZeile[] = [];
  for (const g of b.jeSteuersatz) {
    const jeKonto = new Map<string, number>();
    const add = (kontoId: string, betrag: number) =>
      jeKonto.set(kontoId, (jeKonto.get(kontoId) ?? 0) + betrag);
    beleg.posten.forEach((p, i) => {
      if (p.steuersatz !== g.satz) return;
      if (p.art === 'leergut') {
        add(PFAND_KONTO_ID, b.postenBetraege[i]!);
        return;
      }
      if (!p.kategorieId) throw new Error('Ein Posten hat keine Kategorie.');
      add(p.kategorieId, b.postenBetraege[i]!);
      if (b.pfandBetraege[i] !== 0) add(PFAND_KONTO_ID, b.pfandBetraege[i]!);
    });
    const ids = [...jeKonto.keys()];
    const betraege = ids.map((id) => jeKonto.get(id)!);
    // Each Konto gets its own signed net/tax with the rounding rule of `belegBerechnen`; the rounding
    // difference to the rate totals goes to the Konto with the largest absolute amount.
    const ohneVorsteuer = eigenbeleg && modus === 'brutto';
    const netto = betraege.map((x) =>
      modus === 'brutto' && !ohneVorsteuer ? runde((x * 10000) / (10000 + g.satz)) : x,
    );
    const steuer = betraege.map((x, i) =>
      ohneVorsteuer ? 0 : modus === 'brutto' ? x - netto[i]! : runde((x * g.satz) / 10000),
    );
    let groesster = 0;
    betraege.forEach((x, i) => {
      if (Math.abs(x) > Math.abs(betraege[groesster]!)) groesster = i;
    });
    netto[groesster]! += g.netto - netto.reduce((t, x) => t + x, 0);
    steuer[groesster]! += g.steuer - steuer.reduce((t, x) => t + x, 0);
    ids.forEach((kontoId, i) => {
      const betragCent = netto[i]! + steuer[i]!;
      if (betragCent === 0 && netto[i] === 0) return;
      zeilen.push({
        kontoId,
        betragCent,
        stueckelung: [],
        // Eigenbeleg: the whole amount is expense, no Vorsteuer (also Pfand and Leergut).
        ...(g.satz > 0 && !eigenbeleg
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
  // A Beleg that adds up to 0 (e.g. Ware and Leergut cancelling out) has no counter line: nothing is paid.
  if (b.summe !== 0)
    zeilen.push({
      kontoId: gegenkonto.kontoId,
      betragCent: 0 - b.summe,
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

/** A negative sum is an Einlage: the member pays the club. */
export const erstattungBuchungstext = (mitglied: string, anzahl: number, summeCent = 1): string =>
  `${summeCent < 0 ? `Einlage von ${mitglied} für Auslagen` : `Erstattung Auslagen an ${mitglied}`} (${anzahl} ${anzahl === 1 ? 'Beleg' : 'Belege'})`;

// ----- Validation

export interface BelegFehler {
  /** `rechnungssteller`, `belegdatum`, `belegsumme`, `posten`, `korrekturen`, `datei`, `zahlweg`, `bezahldatum`, `fach`, `stueckelung`, `mitglied`. */
  feld: string;
  meldung: string;
}

/** What `belegPruefen` needs besides the draft: today (Berlin) and the tax rate periods. */
export interface BelegPruefKontext {
  heute: string;
  zeitraeume: readonly Pick<SteuersatzZeitraum, 'ab' | 'regel' | 'ermaessigt'>[];
}

/** `19 %`, `7 %`, `0 %`, `5,5 %`. */
const satzText = (satz: number): string => `${(satz / 100).toLocaleString('de-DE')} %`;

/**
 * Whether the draft is complete enough to book: required fields, items, file or reason, Zahlweg
 * fields. The Belegdatum must not lie in the future and every tax rate must be valid on it.
 */
export function belegPruefen(daten: BelegEntwurfDaten, kontext: BelegPruefKontext): BelegFehler[] {
  const fehler: BelegFehler[] = [];
  const f = (feld: string, meldung: string) => fehler.push({ feld, meldung });
  if (!daten.rechnungsstellerId) f('rechnungssteller', 'Bitte wähle einen Rechnungssteller.');
  if (!daten.belegdatum) f('belegdatum', 'Bitte gib das Belegdatum an.');
  else if (daten.belegdatum > kontext.heute)
    f('belegdatum', 'Das Belegdatum darf nicht in der Zukunft liegen.');
  // An Eigenbeleg has no visible Steuersatz field and books no Vorsteuer: no check there.
  const gueltig =
    daten.belegdatum && !istEigenbeleg(daten)
      ? steuersaetzeAm(kontext.zeitraeume, daten.belegdatum).saetze
      : null;
  if (daten.posten.length === 0) f('posten', 'Bitte gib mindestens einen Posten an.');
  const zaehler: Record<BelegPostenArt, number> = { ware: 0, kategorie: 0, leergut: 0 };
  daten.posten.forEach((p) => {
    const n = postenZeilenLabel(p.art, ++zaehler[p.art]);
    if (p.art !== 'leergut' && !p.kategorieId) f('posten', `${n}: Bitte wähle eine Kategorie.`);
    if (p.anzahlMilli === 0) f('posten', `${n}: Bitte gib die Anzahl an.`);
    if (gueltig && !gueltig.includes(p.steuersatz))
      f(
        'posten',
        `${n}: Der Steuersatz ${satzText(p.steuersatz)} gilt am Belegdatum nicht (erlaubt: ${gueltig.map(satzText).join(', ')}).`,
      );
    if (p.art === 'ware') {
      if (!p.wareId) f('posten', `${n}: Bitte wähle eine Ware.`);
      else if (!p.gebindeId) f('posten', `${n}: Bitte wähle ein Gebinde.`);
    }
    if (p.art === 'kategorie' && !p.text) f('posten', `${n}: Bitte gib den Artikel an.`);
    if (p.art === 'leergut' && !p.text) f('posten', `${n}: Bitte beschreibe das Leergut.`);
  });
  const rechnung = belegBerechnen(daten);
  for (const m of rechnung.fehler) f(m.includes('Korrektur') ? 'korrekturen' : 'posten', m);
  if (daten.belegsummeCent == null) f('belegsumme', 'Bitte gib die Belegsumme an.');
  else if (
    daten.posten.length > 0 &&
    rechnung.fehler.length === 0 &&
    daten.belegsummeCent !== rechnung.summe
  )
    f(
      'belegsumme',
      `Die Posten ergeben ${formatEuro(rechnung.summe)}, die Belegsumme ist ${formatEuro(daten.belegsummeCent)}.`,
    );
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
    if (!daten.fachId && rechnung.summe !== 0)
      f('fach', 'Bitte wähle das Fach, aus dem bar gezahlt wurde.');
    const wert = daten.stueckelung.reduce((s, x) => s + x.nennwertCent * x.anzahl, 0);
    if (daten.stueckelung.length === 0 && rechnung.summe === 0) {
      // Nothing is paid: no Stückelung needed.
    } else if (daten.stueckelung.length === 0) f('stueckelung', 'Bitte gib die Stückelung an.');
    else if (rechnung.fehler.length === 0 && wert !== -rechnung.summe)
      f(
        'stueckelung',
        `Die Stückelung (${wert > 0 ? `${formatEuro(wert)} Eingang` : `${formatEuro(-wert)} Abgang`}) passt nicht zur Summe (${formatEuro(rechnung.summe)}).`,
      );
  }
  return fehler;
}

// ----- Warengruppe -> Kategorie

/** Nearest Kategorie assigned to the Warengruppe or one of its ancestors; null if there is none. */
export function warengruppeKategorie(
  gruppen: readonly { id: string; parentId: string | null; kategorieId: string | null }[],
  id: string | null,
): string | null {
  const index = new Map(gruppen.map((g) => [g.id, g]));
  const gesehen = new Set<string>();
  let aktuell = id === null ? undefined : index.get(id);
  while (aktuell && !gesehen.has(aktuell.id)) {
    if (aktuell.kategorieId) return aktuell.kategorieId;
    gesehen.add(aktuell.id);
    aktuell = aktuell.parentId === null ? undefined : index.get(aktuell.parentId);
  }
  return null;
}

// ----- Einreichung (a member submits a Beleg)

export const ENTWURF_STATUS = ['entwurf', 'eingereicht', 'verworfen'] as const;
export type EntwurfStatus = (typeof ENTWURF_STATUS)[number];

export const EINREICHUNG_STATUS = [
  'eingereicht',
  'verworfen',
  'gebucht',
  'erstattet',
  'storniert',
] as const;
export type EinreichungStatus = (typeof EINREICHUNG_STATUS)[number];
export const EINREICHUNG_STATUS_LABELS: Record<EinreichungStatus, string> = {
  eingereicht: 'Eingereicht',
  verworfen: 'Verworfen',
  gebucht: 'Gebucht',
  erstattet: 'Erstattet',
  storniert: 'Storniert',
};

/**
 * Status of a submission for the member, derived: the draft (`entwurfStatus`) while it exists, else
 * the booked Beleg (`beleg`): reversed, reimbursed (an Erstattung exists) or just booked (open).
 */
export function einreichungStatus(e: {
  entwurfStatus: EntwurfStatus | null;
  beleg: { storniert: boolean; erstattet: boolean } | null;
}): EinreichungStatus {
  if (e.beleg) return e.beleg.storniert ? 'storniert' : e.beleg.erstattet ? 'erstattet' : 'gebucht';
  return e.entwurfStatus === 'verworfen' ? 'verworfen' : 'eingereicht';
}

/** Body of `POST /api/finanzen/beleg-entwuerfe/:id/verwerfen`. */
export const belegVerwerfenSchema = z.object({
  grund: z
    .string('Bitte nenne einen Grund.')
    .trim()
    .min(1, 'Bitte nenne einen Grund.')
    .max(500, 'Höchstens 500 Zeichen erlaubt.'),
});
export type BelegVerwerfen = z.output<typeof belegVerwerfenSchema>;

/** One own submission in `GET /api/finanzen/einreichungen`. */
export interface EinreichungDto {
  id: string;
  status: EinreichungStatus;
  belegdatum: string | null;
  betragCent: number | null;
  /** Name of the chosen Rechnungssteller, else the free name the member typed. */
  rechnungssteller: string | null;
  notiz: string | null;
  /** Reason, when `status` is `verworfen`. */
  verworfenGrund: string | null;
  /** Number of the booked Beleg, once booked. */
  belegNummer: string | null;
  eingereichtAm: string | null;
}

/** `GET /api/finanzen/einreichungen/auswahl`: slim choices for the submission form of a member. */
export interface EinreichungAuswahlDto {
  /** Active Rechnungssteller. */
  rechnungssteller: { id: string; name: string }[];
  /** Active Aufwand Konten (Kategorien). */
  kategorien: { id: string; name: string }[];
  /** Non-archived Waren with their Gebinde, for Ware items. */
  waren: BelegWareDto[];
  /** Artikel names booked so far with their Kategorien, for the Artikel autocomplete and Kategorie suggestion. */
  artikelVorschlaege: ArtikelKategorieVorschlaege;
  /** Tax rate periods: the rates a Beleg date allows (`steuersaetzeAm`). */
  steuersatzZeitraeume: SteuersatzZeitraum[];
}

/** `GET /api/finanzen/einreichungen/:id`: own submission with the file. */
export interface EinreichungDetailDto extends EinreichungDto {
  dateiUrl: string | null;
  dateiName: string | null;
  dateiTyp: string | null;
  /** True while the member can still withdraw it (`DELETE`). */
  zurueckziehbar: boolean;
  /** The Posten the member entered (or of the booked Beleg). */
  posten: EinreichungPostenDto[];
}

export interface EinreichungPostenDto {
  /** Name of the Kategorie (Konto); null while none is chosen. */
  kategorie: string | null;
  text: string;
  betragCent: number;
  steuersatz: number;
  /** Ware items only: name of the Ware, designation of the Gebinde and the number of Gebinde in thousandths. */
  ware: string | null;
  gebinde: string | null;
  anzahlMilli: number | null;
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
    // A Beleg of 0 owes nothing, so it is never an open Auslage.
    if (stornierte.has(b.buchungId) || erstattet.has(b.id) || b.summeCent === 0) continue;
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

/** `GET /api/finanzen/warengruppen-kategorien`: one entry per Warengruppe. */
export interface WarengruppeKategorieDto {
  id: string;
  name: string;
  parentId: string | null;
  archiviert: boolean;
  /** Kategorie (Aufwand Konto) assigned to this group itself. */
  kategorieId: string | null;
  /** Effective Kategorie: the own one or the nearest ancestor's (`warengruppeKategorie`). */
  wirksamKategorieId: string | null;
}

export interface BelegGebindeDto {
  id: string;
  /** Full designation, e.g. "Kasten à 20 × 0,5 l". */
  bezeichnung: string;
  /** Deposit of the Gebinde including its Untergebinde (`pfandGesamtCent`); null = no deposit. */
  pfandGesamtCent: number | null;
  /** Last booked purchase price per Gebinde (gross, without deposit); null when never bought. Prefills Rechnungen. */
  letzterPreisCent: number | null;
}

/** `GET /api/finanzen/beleg-waren`: the Waren a Ware item can pick, with what the form pre-fills. */
export interface BelegWareDto {
  id: string;
  name: string;
  warengruppeId: string;
  /** Suggested Kategorie from the Warengruppe (inherited); null without an assignment. */
  kategorieId: string | null;
  /** Other names the Ware is found by (`waren.aliase`). */
  aliase: string[];
  /** Gebinde to preselect (every Ware has one; it is one of `gebinde`). */
  standardGebindeId: string;
  gebinde: BelegGebindeDto[];
}

/** Artikel names already booked on Kategorie items, with the Kategorien used for them (most often first). */
export type ArtikelKategorieVorschlaege = {
  artikel: string;
  /** Default tax rate of the Artikel (`fin_artikel`) as Art; null when it has none yet. */
  steuersatzArt: SteuersatzArt | null;
  kategorien: { kategorieId: string; anzahl: number }[];
}[];

/** Key to compare Artikel names: trimmed, case-insensitive (`fin_artikel.name_norm`). */
export const artikelNameNorm = (name: string): string => name.trim().toLowerCase();

/** `GET /api/finanzen/artikel`: an Artikel with how it was booked. */
export interface ArtikelDto {
  id: string;
  name: string;
  /** Default tax rate as Art; the value follows from the date of the Beleg. */
  steuersatzArt: SteuersatzArt | null;
  /** Kategorien it was booked on, most often first. */
  kategorien: { kategorieId: string; anzahl: number }[];
  /** Number of booked Posten with this name. */
  postenAnzahl: number;
  /** ISO timestamp of the most recent booking; null when never booked. */
  zuletztAm: string | null;
}

/** Body of `PATCH /api/finanzen/artikel/:id`. */
export const artikelAendernSchema = z.object({ steuersatzArt: steuersatzArtSchema });

/**
 * Builds the Artikel list from `fin_artikel` rows and counted booked (Artikel, Kategorie) groups
 * (`zuletztAm` = latest booking of that group). Sorted by name.
 */
export function artikelListeBilden(
  artikel: readonly { id: string; name: string; steuersatzArt: SteuersatzArt | null }[],
  zeilen: readonly {
    artikel: string;
    kategorieId: string;
    anzahl: number;
    zuletztAm: string | null;
  }[],
): ArtikelDto[] {
  const jeName = new Map<string, ArtikelDto>();
  for (const a of artikel) {
    jeName.set(artikelNameNorm(a.name), {
      id: a.id,
      name: a.name,
      steuersatzArt: a.steuersatzArt,
      kategorien: [],
      postenAnzahl: 0,
      zuletztAm: null,
    });
  }
  for (const z of zeilen) {
    const eintrag = jeName.get(artikelNameNorm(z.artikel));
    if (!eintrag) continue;
    const k = eintrag.kategorien.find((x) => x.kategorieId === z.kategorieId);
    if (k) k.anzahl += z.anzahl;
    else eintrag.kategorien.push({ kategorieId: z.kategorieId, anzahl: z.anzahl });
    eintrag.postenAnzahl += z.anzahl;
    if (z.zuletztAm && (!eintrag.zuletztAm || z.zuletztAm > eintrag.zuletztAm))
      eintrag.zuletztAm = z.zuletztAm;
  }
  for (const e of jeName.values()) e.kategorien.sort((a, b) => b.anzahl - a.anzahl);
  return [...jeName.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Builds the suggestions from counted (Artikel, Kategorie) groups. Artikel are compared case-insensitively
 * and trimmed; the shown spelling is the one of the most frequent group (ties: alphabetically first).
 * Artikel are sorted by name, Kategorien by `anzahl` descending.
 */
export function artikelVorschlaegeBilden(
  zeilen: readonly { artikel: string; kategorieId: string; anzahl: number }[],
  /** Default tax rate Art per Artikel, keyed by `artikelNameNorm`. */
  steuersatzArten: ReadonlyMap<string, SteuersatzArt | null> = new Map(),
): ArtikelKategorieVorschlaege {
  const sortiert = zeilen
    .filter((z) => z.artikel.trim() !== '')
    .sort((a, b) => b.anzahl - a.anzahl || a.artikel.localeCompare(b.artikel, 'de'));
  const nachName = new Map<string, ArtikelKategorieVorschlaege[number]>();
  for (const z of sortiert) {
    const schluessel = artikelNameNorm(z.artikel);
    const eintrag = nachName.get(schluessel) ?? {
      artikel: z.artikel.trim(),
      steuersatzArt: steuersatzArten.get(schluessel) ?? null,
      kategorien: [],
    };
    const vorhanden = eintrag.kategorien.find((k) => k.kategorieId === z.kategorieId);
    if (vorhanden) vorhanden.anzahl += z.anzahl;
    else eintrag.kategorien.push({ kategorieId: z.kategorieId, anzahl: z.anzahl });
    nachName.set(schluessel, eintrag);
  }
  for (const e of nachName.values()) e.kategorien.sort((a, b) => b.anzahl - a.anzahl);
  return [...nachName.values()].sort((a, b) => a.artikel.localeCompare(b.artikel, 'de'));
}

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
  status: EntwurfStatus;
  /** Cognito sub of the member who submitted the draft; null for a draft of a Finanzer:in. */
  eingereichtVon: string | null;
  eingereichtAm: string | null;
  verworfenGrund: string | null;
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
  status: EntwurfStatus;
  eingereichtVon: FinanzMitgliedDto | null;
  eingereichtAm: string | null;
  verworfenGrund: string | null;
  erstelltVon: FinanzMitgliedDto | null;
  erstelltAm: string;
  geaendertAm: string;
}

/**
 * The date a Beleg is booked on without a closed month: the Belegdatum for an Auslage, else the
 * Bezahldatum. True when the actual `buchungsdatum` differs (the booking was shifted).
 */
export const belegBuchungVerschoben = (b: {
  zahlweg: Zahlweg;
  belegdatum: string;
  bezahldatum: string | null;
  buchungsdatum: string;
}): boolean => b.buchungsdatum !== (b.zahlweg === 'auslage' ? b.belegdatum : b.bezahldatum);

/** Entry of the Beleg list: a draft (no number yet) or a booked Beleg. */
export interface BelegListeEintrag {
  id: string;
  status: BelegStatus;
  nummer: string | null;
  rechnungsstellerId: string | null;
  rechnungssteller: string | null;
  /** Drafts submitted by a member: the free name they typed (a suggestion only). */
  rechnungsstellerName: string | null;
  belegdatum: string | null;
  summeCent: number | null;
  zahlweg: Zahlweg | null;
  mitgliedId: string | null;
  hatDatei: boolean;
  erstelltAm: string;
  /** Drafts only: `eingereicht` = submitted by a member, waiting for the Finanzer:in. */
  entwurfStatus: 'entwurf' | 'eingereicht' | null;
  /** Cognito sub of the member who submitted it (drafts and booked Belege). */
  eingereichtVon: string | null;
  eingereichtAm: string | null;
  /** The amount the member stated (cent). */
  eingereichtBetragCent: number | null;
  /** Booked Belege: the date of the booking; null for drafts. */
  buchungsdatum: string | null;
  /** Booked on a later day than the date it would normally get (the month was festgeschrieben). */
  buchungVerschoben: boolean;
}

export interface BelegListeDto extends Omit<BelegListeEintrag, 'mitgliedId' | 'eingereichtVon'> {
  mitglied: FinanzMitgliedDto | null;
  eingereichtVon: FinanzMitgliedDto | null;
}

export interface BelegeSeiteDto {
  belege: BelegListeDto[];
  /** More Belege matched than returned. */
  gekappt: boolean;
}

export interface BelegPostenDto {
  pos: number;
  art: BelegPostenArt;
  /** Leergut items carry the Pfand Konto. */
  kategorieId: string;
  kategorieName: string;
  wareId: string | null;
  wareName: string | null;
  gebindeId: string | null;
  /** Deposit per Gebinde and its amount (cent), Ware items only. */
  pfandCent: number | null;
  pfandBetragCent: number | null;
  text: string;
  anzahlMilli: number;
  einzelpreisCent: number;
  /** Set on a Gesamtpreis line: the amount is exactly this and `einzelpreisCent` is derived. */
  gesamtCent: number | null;
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
  /** The date of the booking of the Beleg. */
  buchungsdatum: string;
  /** Booked on a later day than the date it would normally get (the month was festgeschrieben). */
  buchungVerschoben: boolean;
  /** The booking of the Beleg is reversed. */
  storniert: boolean;
  erstattung: BelegErstattungVerweis | null;
  eingereichtVon: string | null;
  eingereichtAm: string | null;
  eingereichtBetragCent: number | null;
  erstelltVon: string;
  erstelltAm: string;
}

/** `GET /api/finanzen/belege/:id`. */
export interface BelegDetailDto extends Omit<
  BelegDetailEintrag,
  'mitgliedId' | 'erstelltVon' | 'datei' | 'eingereichtVon'
> {
  mitglied: FinanzMitgliedDto | null;
  eingereichtVon: FinanzMitgliedDto | null;
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
