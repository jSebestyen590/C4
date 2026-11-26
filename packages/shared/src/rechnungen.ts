import { z } from 'zod';
import { datumAnzeigen, tagNachher } from './datum';
import {
  finanzDatumSchema,
  formatEuro,
  idempotenzSchluessel,
  stueckelungZeileSchema,
  type FinanzMitgliedDto,
  type StueckelungDto,
} from './finanzen';
import {
  BELEG_BETRAG_WARNUNG_CENT,
  BELEG_MODI,
  BELEG_POSTEN_ANZAHL_MAX,
  PFAND_KONTO_ID,
  anzahlMilliFeld,
  belegBerechnen,
  belegBuchungszeilen,
  centFeld,
  nullish,
  steuersatzFeld,
  type BelegBerechnung,
  type BelegFehler,
  type BelegModus,
  type BelegPruefKontext,
  type BelegWarnungDto,
  type BelegZeile,
  type SteuersatzSumme,
} from './belege';
import { steuersaetzeAm } from './steuersaetze';

// Finanzen Rechnungen (see docs/finanzen.md): outgoing invoices to members or external recipients,
// booked with Ist-Versteuerung. Stellen books `forderungen` against `erloese_offen` (no revenue, no
// VAT); the payment books the money in and moves the revenue with VAT to the Erlöskonten. Pure
// logic only: totals (the Beleg code), validation, journal lines, number and status.

/** Durchlauf Konten of the Ist-Versteuerung: open claims and the revenue they will become. */
export const FORDERUNGEN_KONTO_ID = 'forderungen';
export const ERLOESE_OFFEN_KONTO_ID = 'erloese_offen';
/** Durchlauf Konto for card payments via SumUp until the payout is matched. */
export const SUMUP_KONTO_ID = 'sumup';

/** The list of Rechnungen returns at most this many entries (the newest ones). */
export const RECHNUNGEN_MAX = 500;
export const RECHNUNG_ZAHLUNGSZIEL_STANDARD = 14;
export const RECHNUNG_ZAHLUNGSZIEL_MAX = 365;
/** Size limit of the generated invoice PDF. */
export const RECHNUNG_DATEI_MAX_BYTES = 20 * 1024 * 1024;
/** Key of the PDF of a Rechnung in the archive bucket. */
export const rechnungDateiSchluessel = (sha256: string) => `rechnungen/${sha256}.pdf`;

export const RECHNUNG_ZAHLWEGE = ['bank', 'bar', 'sumup'] as const;
export type RechnungZahlweg = (typeof RECHNUNG_ZAHLWEGE)[number];
export const RECHNUNG_ZAHLWEG_LABELS: Record<RechnungZahlweg, string> = {
  bank: 'Bank (Überweisung)',
  bar: 'Bar (in ein Fach)',
  sumup: 'Karte (SumUp)',
};

export const RECHNUNG_POSTEN_ARTEN = ['ware', 'frei'] as const;
export type RechnungPostenArt = (typeof RECHNUNG_POSTEN_ARTEN)[number];
export const RECHNUNG_POSTEN_TABELLEN_LABELS: Record<RechnungPostenArt, string> = {
  ware: 'Waren',
  frei: 'Freitext',
};
/** `Waren, Zeile 2`: `position` is the 1-based position within the items of that art. */
export const rechnungPostenLabel = (art: RechnungPostenArt, position: number): string =>
  `${RECHNUNG_POSTEN_TABELLEN_LABELS[art]}, Zeile ${position}`;

export const RECHNUNG_STATUS = ['entwurf', 'gestellt', 'bezahlt', 'storniert'] as const;
export type RechnungStatus = (typeof RECHNUNG_STATUS)[number];
export const RECHNUNG_STATUS_LABELS: Record<RechnungStatus, string> = {
  entwurf: 'Entwurf',
  gestellt: 'Gestellt',
  bezahlt: 'Bezahlt',
  storniert: 'Storniert',
};

// ----- Schemas

const kurzText = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen erlaubt.`);
const pflichtText = (meldung: string, max: number) =>
  z.string(meldung).trim().min(1, meldung).max(max, `Höchstens ${max} Zeichen erlaubt.`);
const optText = (max: number) => nullish(kurzText(max)).transform((v) => (v === '' ? null : v));
const preisFormelFeld = z.string().trim().max(200, 'Höchstens 200 Zeichen erlaubt.').nullish();

/** Default of the editable text below the items; `{...}` are placeholders. */
export const RECHNUNG_TEXT_STANDARD =
  'Bitte überweise den Betrag bis zum {faellig} auf das folgende Konto und gib dabei die Rechnungsnummer {nummer} an: {bank}, IBAN {iban}.';
export const RECHNUNG_TEXT_PLATZHALTER = [
  { platzhalter: '{nummer}', beschreibung: 'Rechnungsnummer' },
  { platzhalter: '{faellig}', beschreibung: 'Fälligkeitsdatum' },
  { platzhalter: '{betrag}', beschreibung: 'Gesamtbetrag (brutto)' },
  { platzhalter: '{bank}', beschreibung: 'Name der Bank' },
  { platzhalter: '{iban}', beschreibung: 'IBAN' },
  { platzhalter: '{bic}', beschreibung: 'BIC' },
] as const;

/**
 * Fills the placeholders of the text below the items. An empty text falls back to the default;
 * unknown `{...}` stay as they are.
 */
export function rechnungTextFuellen(
  vorlage: string | null | undefined,
  werte: {
    nummer: string;
    faellig: string;
    betrag: string;
    bank: string;
    iban: string;
    bic: string;
  },
): string {
  const text = vorlage && vorlage.trim() !== '' ? vorlage : RECHNUNG_TEXT_STANDARD;
  return text.replace(
    /\{(nummer|faellig|betrag|bank|iban|bic)\}/g,
    (_, k: keyof typeof werte) => werte[k],
  );
}

/** Club data printed on the invoices; a copy is stored with every Rechnung. */
export const rechnungVereinSchema = z.object({
  vereinsname: pflichtText('Bitte gib den Vereinsnamen an.', 120),
  anschrift: pflichtText('Bitte gib die Anschrift an.', 300),
  steuernummer: pflichtText('Bitte gib die Steuernummer an.', 40),
  ustId: optText(40),
  bankName: pflichtText('Bitte gib den Namen der Bank an.', 120),
  iban: pflichtText('Bitte gib die IBAN an.', 40),
  bic: pflichtText('Bitte gib die BIC an.', 20),
  vorstand: pflichtText('Bitte gib den Vorstand an.', 300),
  register: optText(200),
  kontakt: optText(300),
  /** "Text unter den Posten" with placeholders, see `RECHNUNG_TEXT_PLATZHALTER`. */
  fusstext: optText(1000),
});
export type RechnungVerein = z.output<typeof rechnungVereinSchema>;

/** Body of `POST /api/finanzen/rechnung-einstellungen` (adds a new version). */
/** The Vorstand is not entered: it comes from the Posten flagged as Vorstandsposten. */
export const rechnungEinstellungenEingabeSchema = rechnungVereinSchema
  .omit({ vorstand: true })
  .extend({
    zahlungszielTage: z
      .number('Bitte gib das Zahlungsziel an.')
      .int('Das Zahlungsziel muss in ganzen Tagen angegeben werden.')
      .min(0, 'Das Zahlungsziel darf nicht negativ sein.')
      .max(RECHNUNG_ZAHLUNGSZIEL_MAX, `Höchstens ${RECHNUNG_ZAHLUNGSZIEL_MAX} Tage erlaubt.`),
    /** Preselected Erlös-Kategorie of Ware items. */
    erloesKontoWaren: nullish(z.string().min(1)),
  });
export type RechnungEinstellungenEingabe = z.output<typeof rechnungEinstellungenEingabeSchema>;

const empfaengerName = pflichtText('Bitte gib einen Namen ein.', 120);
const empfaengerFelder = {
  anschrift: pflichtText('Bitte gib die Anschrift an.', 300),
  email: optText(200),
  ustId: optText(40),
};
export const rechnungsempfaengerEingabeSchema = z.object({
  name: empfaengerName,
  ...empfaengerFelder,
});
export type RechnungsempfaengerEingabe = z.output<typeof rechnungsempfaengerEingabeSchema>;
export const rechnungsempfaengerAendernSchema = z
  .object({
    name: empfaengerName.optional(),
    anschrift: empfaengerFelder.anschrift.optional(),
    email: optText(200).optional(),
    ustId: optText(40).optional(),
    archiviert: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Bitte gib eine Änderung an.');
export type RechnungsempfaengerAendern = z.output<typeof rechnungsempfaengerAendernSchema>;

const erloesKontoFeld = nullish(z.string().min(1));

/** Item of a Ware (Lager): a Gebinde with an optional deposit; the price excludes the deposit. */
export const rechnungPostenWareSchema = z.object({
  art: z.literal('ware'),
  wareId: nullish(z.string().min(1)),
  gebindeId: nullish(z.string().min(1)),
  /** Name of the Ware; empty = filled from the Ware when stellen. */
  text: kurzText(200).default(''),
  anzahlMilli: anzahlMilliFeld,
  /** Price per Gebinde without deposit. */
  einzelpreisCent: centFeld,
  /** Deposit per Gebinde; null = none. */
  pfandCent: nullish(centFeld),
  steuersatz: steuersatzFeld,
  erloesKontoId: erloesKontoFeld,
  preisFormel: preisFormelFeld,
});
export type RechnungPostenWare = z.output<typeof rechnungPostenWareSchema>;

/** Free text item. */
export const rechnungPostenFreiSchema = z.object({
  art: z.literal('frei'),
  text: kurzText(200).default(''),
  anzahlMilli: anzahlMilliFeld,
  einzelpreisCent: centFeld,
  steuersatz: steuersatzFeld,
  erloesKontoId: erloesKontoFeld,
  preisFormel: preisFormelFeld,
});
export type RechnungPostenFrei = z.output<typeof rechnungPostenFreiSchema>;

export const rechnungPostenSchema = z.discriminatedUnion('art', [
  rechnungPostenWareSchema,
  rechnungPostenFreiSchema,
]);
export type RechnungPosten = z.output<typeof rechnungPostenSchema>;

/** Recipient of a draft: a member (Cognito sub) or an external recipient. */
export const rechnungEmpfaengerSchema = z.discriminatedUnion('typ', [
  z.object({ typ: z.literal('mitglied'), sub: z.string().min(1) }),
  z.object({ typ: z.literal('extern'), id: z.string().min(1) }),
]);
export type RechnungEmpfaenger = z.output<typeof rechnungEmpfaengerSchema>;

/** The form state of a Rechnung; everything can still be missing in a draft. */
export const rechnungEntwurfDatenSchema = z.object({
  empfaenger: nullish(rechnungEmpfaengerSchema),
  /** Date of the service (from); the Rechnungsdatum is the day of Stellen. */
  leistungVon: nullish(finanzDatumSchema),
  /** End of a service period; null = a single day. */
  leistungBis: nullish(finanzDatumSchema),
  /** Days until due; null = the default of the Einstellungen. */
  zahlungszielTage: nullish(
    z
      .number()
      .int()
      .min(0, 'Das Zahlungsziel darf nicht negativ sein.')
      .max(RECHNUNG_ZAHLUNGSZIEL_MAX),
  ),
  betreff: kurzText(200).default(''),
  einleitung: nullish(kurzText(1000)),
  hinweis: nullish(kurzText(1000)),
  modus: z.enum(BELEG_MODI, 'Bitte wähle Brutto oder Netto.').default('brutto'),
  posten: z
    .array(rechnungPostenSchema)
    .max(BELEG_POSTEN_ANZAHL_MAX, `Höchstens ${BELEG_POSTEN_ANZAHL_MAX} Posten erlaubt.`)
    .default([]),
});
export type RechnungEntwurfDaten = z.output<typeof rechnungEntwurfDatenSchema>;
export type RechnungEntwurfDatenInput = z.input<typeof rechnungEntwurfDatenSchema>;

/** Body of `POST /api/finanzen/rechnung-entwuerfe` and `PUT /api/finanzen/rechnung-entwuerfe/:id`. */
export const rechnungEntwurfSchema = z.object({ daten: rechnungEntwurfDatenSchema });

/** Body of `POST /api/finanzen/rechnung-entwuerfe/:id/stellen`. */
export const rechnungStellenSchema = z.object({
  idempotenzSchluessel,
  /** Codes of the warnings the user has seen and confirmed (`BelegWarnungDto.code`). */
  bestaetigt: z.array(z.string()).max(50).default([]),
});
export type RechnungStellen = z.output<typeof rechnungStellenSchema>;

/** Body of `POST /api/finanzen/rechnungen/:id/zahlung`. */
export const rechnungZahlungSchema = z
  .object({
    idempotenzSchluessel,
    zahlweg: z.enum(RECHNUNG_ZAHLWEGE, 'Bitte wähle den Zahlweg.'),
    datum: finanzDatumSchema,
    /** Fach the cash goes into (Zahlweg bar). */
    fachId: nullish(z.string().min(1)),
    /** Signed counts as booked on the Fach (money in: positive); sum = the Rechnungsbetrag. */
    stueckelung: z.array(stueckelungZeileSchema).default([]),
    bestaetigt: z.array(z.string()).max(50).default([]),
  })
  .refine((v) => v.zahlweg !== 'bar' || v.fachId !== null, {
    message: 'Bitte wähle das Fach, in das bar gezahlt wurde.',
    path: ['fachId'],
  });
export type RechnungZahlung = z.output<typeof rechnungZahlungSchema>;

/** Body of `POST /api/finanzen/rechnungen/:id/storno`. */
export const rechnungStornoSchema = z.object({
  idempotenzSchluessel,
  begruendung: pflichtText('Bitte gib eine Begründung für die Stornorechnung an.', 500),
});
export type RechnungStorno = z.output<typeof rechnungStornoSchema>;

const sha256Feld = z
  .string('Der Datei-Hash fehlt.')
  .regex(/^[0-9a-f]{64}$/, 'Ungültiger Datei-Hash.');
const dateiGroesseFeld = z
  .number('Bitte gib die Dateigröße an.')
  .int()
  .min(1, 'Die Datei ist leer.')
  .max(RECHNUNG_DATEI_MAX_BYTES, 'Die Datei ist größer als 20 MB.');
/** Body of `POST /api/finanzen/rechnung-dateien/upload`. */
export const rechnungDateiUploadSchema = z.object({
  rechnungId: z.string().min(1),
  sha256: sha256Feld,
  groesse: dateiGroesseFeld,
});
/** Body of `POST /api/finanzen/rechnungen/:id/datei`. */
export const rechnungDateiSchema = z.object({ sha256: sha256Feld, groesse: dateiGroesseFeld });
export type RechnungDateiEingabe = z.output<typeof rechnungDateiSchema>;

/** Query of `GET /api/finanzen/rechnungen`. */
export const rechnungenAbfrageSchema = z.object({
  status: z.enum(RECHNUNG_STATUS).optional(),
  jahr: z.coerce.number().int().min(2000).max(2200).optional(),
  q: z.string().trim().max(100).optional(),
});
export type RechnungenAbfrage = z.output<typeof rechnungenAbfrageSchema>;

// ----- Calculation

type RechnungsPosten = Pick<
  RechnungPosten,
  'art' | 'anzahlMilli' | 'einzelpreisCent' | 'steuersatz'
> & { pfandCent?: number | null; erloesKontoId?: string | null };

/** Totals per tax rate: the Beleg calculation with the Rechnung items as Kategorie/Ware items. */
export function rechnungBerechnen(r: {
  modus: BelegModus;
  posten: readonly RechnungsPosten[];
}): BelegBerechnung {
  return belegBerechnen(belegAlsRechnung(r));
}

const belegAlsRechnung = (r: { modus: BelegModus; posten: readonly RechnungsPosten[] }) => ({
  modus: r.modus,
  korrekturen: [],
  posten: r.posten.map((p) => ({
    art: p.art === 'ware' ? ('ware' as const) : ('kategorie' as const),
    anzahlMilli: p.anzahlMilli,
    einzelpreisCent: p.einzelpreisCent,
    steuersatz: p.steuersatz,
    pfandCent: p.art === 'ware' ? (p.pfandCent ?? null) : null,
    kategorieId: p.erloesKontoId ?? null,
  })),
});

/** Key of a Ware and Gebinde in `letzterPreisJeGebinde`. */
export const warenGebindeKey = (wareId: string, gebindeId: string): string =>
  `${wareId}:${gebindeId}`;

/**
 * The last purchase price per Gebinde (gross, without deposit) per Ware and Gebinde from booked Ware
 * items, newest first; a net Beleg is converted with its tax rate. Prefills the price of a Rechnung.
 */
export function letzterPreisJeGebinde(
  posten: readonly {
    wareId: string | null;
    gebindeId: string | null;
    modus: BelegModus;
    einzelpreisCent: number;
    steuersatz: number;
  }[],
): Map<string, number> {
  const preise = new Map<string, number>();
  for (const p of posten) {
    if (!p.wareId || !p.gebindeId) continue;
    const key = warenGebindeKey(p.wareId, p.gebindeId);
    if (preise.has(key)) continue;
    preise.set(
      key,
      p.modus === 'netto'
        ? Math.round((p.einzelpreisCent * (10000 + p.steuersatz)) / 10000)
        : p.einzelpreisCent,
    );
  }
  return preise;
}

/** Due date: Rechnungsdatum plus the days of the Zahlungsziel. */
export const faelligAm = (rechnungsdatum: string, zahlungszielTage: number): string =>
  tagNachher(rechnungsdatum, zahlungszielTage);

/** `001-2027`; the Stornorechnung takes its number from the same sequence. */
export const rechnungNummer = (jahr: number, lfd: number): string =>
  `${String(lfd).padStart(3, '0')}-${jahr}`;

/**
 * Status of a stored Rechnung: a Stornorechnung (and a Rechnung that has one) is `storniert`,
 * otherwise `bezahlt` with a payment that is not reversed, else `gestellt`.
 */
export const rechnungStatus = (r: {
  istStorno: boolean;
  stornoRechnungVorhanden: boolean;
  bezahlt: boolean;
}): RechnungStatus =>
  r.istStorno || r.stornoRechnungVorhanden ? 'storniert' : r.bezahlt ? 'bezahlt' : 'gestellt';

/** Whether a `gestellt` Rechnung is past its due date (display only). */
export const rechnungUeberfaellig = (status: RechnungStatus, faellig: string, heute: string) =>
  status === 'gestellt' && faellig < heute;

// ----- Journal lines

const OHNE_STEUER = {
  nettoCent: null,
  steuerCent: null,
  steuersatz: null,
  steuerArt: 'keine',
} as const;

/** Stellen: the claim against the Erlöse not yet earned (Ist-Versteuerung: no revenue, no VAT). */
export const rechnungStellungsZeilen = (bruttoCent: number): BelegZeile[] => [
  { kontoId: FORDERUNGEN_KONTO_ID, betragCent: bruttoCent, stueckelung: [], ...OHNE_STEUER },
  { kontoId: ERLOESE_OFFEN_KONTO_ID, betragCent: -bruttoCent, stueckelung: [], ...OHNE_STEUER },
];

const negiert = (n: number): number => (n === 0 ? 0 : -n);
const GEGENKONTO_PLATZHALTER = '\u0000gegenkonto';

/**
 * Payment: the money comes in (Fach with signed denominations, Bank or SumUp), the claim and the open
 * revenue are settled, and the revenue is booked per Erlöskonto and tax rate with the USt fields
 * (`belegBuchungszeilen` mirrored: its Vorsteuer lines become negative USt lines). The deposit goes
 * against the Pfand Konto with the rate of its Ware.
 */
export function rechnungZahlungsZeilen(
  rechnung: {
    modus: BelegModus;
    posten: readonly (RechnungsPosten & { erloesKontoId: string })[];
  },
  geld: { kontoId: string; stueckelung?: readonly StueckelungDto[] },
): BelegZeile[] {
  const brutto = rechnungBerechnen(rechnung).summe;
  const erloese = belegBuchungszeilen(belegAlsRechnung(rechnung), {
    kontoId: GEGENKONTO_PLATZHALTER,
  })
    .filter((z) => z.kontoId !== GEGENKONTO_PLATZHALTER)
    .map((z): BelegZeile => ({
      ...z,
      betragCent: negiert(z.betragCent),
      ...(z.steuerArt === 'vorsteuer'
        ? {
            nettoCent: negiert(z.nettoCent!),
            steuerCent: negiert(z.steuerCent!),
            steuerArt: 'ust' as const,
          }
        : {}),
    }));
  return [
    {
      kontoId: geld.kontoId,
      betragCent: brutto,
      stueckelung: (geld.stueckelung ?? []).map((s) => ({ ...s })),
      ...OHNE_STEUER,
    },
    { kontoId: FORDERUNGEN_KONTO_ID, betragCent: -brutto, stueckelung: [], ...OHNE_STEUER },
    { kontoId: ERLOESE_OFFEN_KONTO_ID, betragCent: brutto, stueckelung: [], ...OHNE_STEUER },
    ...erloese,
  ];
}

/** Accounts a draft books on (Erlöskonten and the Pfand Konto). */
export const rechnungKontoIds = (daten: {
  posten: readonly { art: string; erloesKontoId?: string | null; pfandCent?: number | null }[];
}): string[] => [
  ...new Set([
    ...daten.posten.flatMap((p) => (p.erloesKontoId ? [p.erloesKontoId] : [])),
    ...(daten.posten.some((p) => p.art === 'ware' && p.pfandCent) ? [PFAND_KONTO_ID] : []),
    FORDERUNGEN_KONTO_ID,
    ERLOESE_OFFEN_KONTO_ID,
  ]),
];

export const rechnungBuchungstext = (nummer: string, empfaenger: string): string =>
  `Rechnung ${nummer}: ${empfaenger}`;
export const rechnungZahlungText = (nummer: string, empfaenger: string): string =>
  `Zahlung Rechnung ${nummer}: ${empfaenger}`;
export const rechnungStornoText = (stornoNummer: string, nummer: string): string =>
  `Stornorechnung ${stornoNummer} zu ${nummer}`;

// ----- Validation

/** `Posten`, `leistung`, `betreff`, `empfaenger`, `erloeskonto`. */
export type RechnungFehler = BelegFehler;

/** What `rechnungPruefen` needs besides the draft: today (= Rechnungsdatum) and the tax rate periods. */
export type RechnungPruefKontext = BelegPruefKontext;

const satzText = (satz: number): string => `${(satz / 100).toLocaleString('de-DE')} %`;

/** Whether the draft is complete enough to book; the Rechnungsdatum is `kontext.heute`. */
export function rechnungPruefen(
  daten: RechnungEntwurfDaten,
  kontext: RechnungPruefKontext,
): RechnungFehler[] {
  const fehler: RechnungFehler[] = [];
  const f = (feld: string, meldung: string) => fehler.push({ feld, meldung });
  if (!daten.empfaenger) f('empfaenger', 'Bitte wähle einen Empfänger.');
  if (!daten.leistungVon) f('leistung', 'Bitte gib das Leistungsdatum an.');
  else if (daten.leistungBis && daten.leistungBis < daten.leistungVon)
    f('leistung', 'Das Ende der Leistung darf nicht vor dem Beginn liegen.');
  if (!daten.betreff.trim()) f('betreff', 'Bitte gib einen Betreff an.');
  if (daten.posten.length === 0) f('posten', 'Bitte gib mindestens einen Posten an.');
  const gueltig = steuersaetzeAm(kontext.zeitraeume, kontext.heute).saetze;
  const zaehler: Record<RechnungPostenArt, number> = { ware: 0, frei: 0 };
  daten.posten.forEach((p) => {
    const n = rechnungPostenLabel(p.art, ++zaehler[p.art]);
    if (!p.erloesKontoId) f('posten', `${n}: Bitte wähle eine Erlös-Kategorie.`);
    if (p.anzahlMilli === 0) f('posten', `${n}: Bitte gib die Anzahl an.`);
    if (!gueltig.includes(p.steuersatz))
      f(
        'posten',
        `${n}: Der Steuersatz ${satzText(p.steuersatz)} gilt am Rechnungsdatum nicht (erlaubt: ${gueltig.map(satzText).join(', ')}).`,
      );
    if (p.art === 'ware') {
      if (!p.wareId) f('posten', `${n}: Bitte wähle eine Ware.`);
      else if (!p.gebindeId) f('posten', `${n}: Bitte wähle ein Gebinde.`);
    } else if (!p.text.trim()) f('posten', `${n}: Bitte gib den Text an.`);
  });
  const berechnung = rechnungBerechnen(daten);
  for (const m of berechnung.fehler) f('posten', m);
  if (daten.posten.length > 0 && berechnung.fehler.length === 0 && berechnung.summe <= 0)
    f('posten', 'Die Rechnung muss einen Betrag über 0 € ergeben.');
  return fehler;
}

/** The non-blocking warnings before Stellen; every one must be confirmed by its `code`. */
export function rechnungWarnungen(p: {
  daten: RechnungEntwurfDaten;
  heute: string;
}): BelegWarnungDto[] {
  const w: BelegWarnungDto[] = [];
  const { daten } = p;
  if (daten.leistungVon && daten.leistungVon > p.heute)
    w.push({
      code: 'leistung_zukunft',
      text: `Das Leistungsdatum (${datumAnzeigen(daten.leistungVon)}) liegt in der Zukunft.`,
    });
  const summe = daten.posten.length > 0 ? rechnungBerechnen(daten).summe : null;
  if (summe !== null && Math.abs(summe) >= BELEG_BETRAG_WARNUNG_CENT)
    w.push({
      code: 'hoher_betrag',
      text: `Der Betrag ist hoch (${formatEuro(summe)}). Bitte prüfe ihn.`,
    });
  const nullPreise: string[] = [];
  const zaehler: Record<RechnungPostenArt, number> = { ware: 0, frei: 0 };
  for (const posten of daten.posten) {
    const n = ++zaehler[posten.art];
    if (posten.einzelpreisCent === 0) {
      const name = posten.art === 'ware' ? '' : posten.text.trim();
      nullPreise.push(
        `${RECHNUNG_POSTEN_TABELLEN_LABELS[posten.art]} ${n}${name ? ` (${name})` : ''}`,
      );
    }
  }
  if (nullPreise.length > 0)
    w.push({ code: 'preis_null', text: `Posten mit Preis 0: ${nullPreise.join(', ')}.` });
  return w;
}

/** Validates a payment: errors block, warnings must be confirmed by their `code`. */
export function rechnungZahlungPruefen(
  eingabe: Pick<RechnungZahlung, 'zahlweg' | 'datum' | 'fachId' | 'stueckelung'>,
  kontext: { heute: string; rechnungsdatum: string; bruttoCent: number },
): { fehler: string[]; warnungen: BelegWarnungDto[] } {
  const fehler: string[] = [];
  const warnungen: BelegWarnungDto[] = [];
  if (eingabe.datum > kontext.heute) fehler.push('Das Zahldatum darf nicht in der Zukunft liegen.');
  else if (eingabe.datum < kontext.rechnungsdatum)
    warnungen.push({
      code: 'zahlung_vor_rechnung',
      text: `Das Zahldatum liegt vor dem Rechnungsdatum (${datumAnzeigen(kontext.rechnungsdatum)}).`,
    });
  if (eingabe.zahlweg === 'bar') {
    if (!eingabe.fachId) fehler.push('Bitte wähle das Fach, in das bar gezahlt wurde.');
    const wert = eingabe.stueckelung.reduce((s, x) => s + x.nennwertCent * x.anzahl, 0);
    if (eingabe.stueckelung.length === 0) fehler.push('Bitte gib die Stückelung an.');
    else if (wert !== kontext.bruttoCent)
      fehler.push(
        `Die Stückelung (${formatEuro(wert)}) passt nicht zum Rechnungsbetrag (${formatEuro(kontext.bruttoCent)}).`,
      );
  }
  return { fehler, warnungen };
}

/** Konto the money of a payment lands on. */
export const rechnungZahlungsKontoId = (z: {
  zahlweg: RechnungZahlweg;
  fachId?: string | null;
}): string => (z.zahlweg === 'bar' ? z.fachId! : z.zahlweg === 'bank' ? 'bank' : SUMUP_KONTO_ID);

// ----- DTOs

/** A current holder of a Vorstandsposten. */
export interface RechnungVorstandDto {
  postenId: string;
  postenName: string;
  mitglied: FinanzMitgliedDto;
}

/** The club data of the newest `fin_rechnung_einstellungen` row. */
export interface RechnungEinstellungenDto extends Omit<RechnungVerein, 'vorstand'> {
  id: string;
  /** Holders of the Vorstandsposten today (not stored with the Einstellungen). */
  vorstand: RechnungVorstandDto[];
  zahlungszielTage: number;
  erloesKontoWaren: string | null;
  erstelltVon: FinanzMitgliedDto | null;
  erstelltAm: string;
}

export interface RechnungsempfaengerDto {
  id: string;
  name: string;
  anschrift: string;
  email: string | null;
  ustId: string | null;
  archiviert: boolean;
}

/** Name and address as they will be printed; `adresseFehlt` for a member without an address. */
export interface RechnungEmpfaengerAnzeigeDto {
  typ: 'mitglied' | 'extern';
  name: string;
  anschrift: string | null;
  mitglied: FinanzMitgliedDto | null;
  adresseFehlt: boolean;
}

/** `GET /api/finanzen/rechnung-entwuerfe/:id` */
export interface RechnungEntwurfDto {
  id: string;
  daten: RechnungEntwurfDaten;
  empfaenger: RechnungEmpfaengerAnzeigeDto | null;
  warnungen: BelegWarnungDto[];
  erstelltVon: FinanzMitgliedDto | null;
  erstelltAm: string;
  geaendertAm: string;
}

export interface RechnungPostenDto {
  pos: number;
  art: RechnungPostenArt;
  wareId: string | null;
  gebindeId: string | null;
  /** Gebinde designation at the time of Stellen (Ware items). */
  einheit: string | null;
  text: string;
  anzahlMilli: number;
  einzelpreisCent: number;
  pfandCent: number | null;
  pfandBetragCent: number | null;
  steuersatz: number;
  erloesKontoId: string;
  erloesKontoName: string;
  /** Amount without deposit (negative on a Stornorechnung). */
  betragCent: number;
}

export interface RechnungListeDto {
  /** Rechnung id, or the draft id for `status` `entwurf`. */
  id: string;
  status: RechnungStatus;
  ueberfaellig: boolean;
  nummer: string | null;
  istStorno: boolean;
  rechnungsdatum: string | null;
  faelligAm: string | null;
  empfaengerName: string | null;
  mitglied: FinanzMitgliedDto | null;
  bruttoCent: number | null;
  betreff: string;
}

/** `GET /api/finanzen/rechnungen`; the key figures count all Rechnungen, not only the filtered ones. */
export interface RechnungenSeiteDto {
  rechnungen: RechnungListeDto[];
  gekappt: boolean;
  offeneSummeCent: number;
  ueberfaelligAnzahl: number;
}

export interface RechnungBezugDto {
  id: string;
  nummer: string;
  rechnungsdatum: string;
}

export interface RechnungZahlungDto {
  id: string;
  zahlweg: RechnungZahlweg;
  datum: string;
  buchungId: string;
  buchungSeq: number;
}

/** `GET /api/finanzen/rechnungen/:id` */
export interface RechnungDetailDto {
  id: string;
  nummer: string;
  jahr: number;
  istStorno: boolean;
  status: RechnungStatus;
  ueberfaellig: boolean;
  rechnungsdatum: string;
  leistungVon: string;
  leistungBis: string | null;
  faelligAm: string;
  mitglied: FinanzMitgliedDto | null;
  empfaengerId: string | null;
  empfaengerName: string;
  empfaengerAnschrift: string;
  empfaengerUstId: string | null;
  verein: RechnungVerein;
  modus: BelegModus;
  betreff: string;
  einleitung: string | null;
  hinweis: string | null;
  bruttoCent: number;
  posten: RechnungPostenDto[];
  /** Totals per tax rate (negative on a Stornorechnung). */
  summen: SteuersatzSumme[];
  /** Set on a Stornorechnung: the Rechnung it cancels. */
  stornoVon: RechnungBezugDto | null;
  stornoBegruendung: string | null;
  /** Set on a cancelled Rechnung: its Stornorechnung. */
  stornorechnung: RechnungBezugDto | null;
  buchungId: string;
  buchungSeq: number;
  zahlung: RechnungZahlungDto | null;
  datei: { sha256: string; groesse: number; url: string } | null;
  erstelltVon: FinanzMitgliedDto | null;
  erstelltAm: string;
}

/** Result of Stellen. */
export interface RechnungGestelltDto {
  id: string;
  nummer: string;
  buchungId: string;
  buchungSeq: number;
  wiederholt?: boolean;
}

export interface RechnungZahlungErgebnisDto {
  id: string;
  buchungId: string;
  buchungSeq: number;
  wiederholt?: boolean;
}

/** Result of the Stornorechnung. */
export interface RechnungStornoErgebnisDto {
  id: string;
  nummer: string;
  buchungId: string;
  buchungSeq: number;
  wiederholt?: boolean;
}

/** `POST /api/finanzen/rechnung-dateien/upload` */
export interface RechnungUploadDto {
  uploadUrl: string;
  schluessel: string;
  checksumSha256: string;
}
