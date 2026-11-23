import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import {
  type BelegWarnungDto,
  type BelegZeile,
  type DatenexportDaten,
  type RechnungDetailDto,
  type RechnungDateiEingabe,
  type RechnungEinstellungenEingabe,
  type RechnungEntwurfDaten,
  type RechnungGestelltDto,
  type RechnungListeDto,
  type RechnungPostenArt,
  type RechnungPostenDto,
  type RechnungStatus,
  type RechnungStellen,
  type RechnungStorno,
  type RechnungStornoErgebnisDto,
  type RechnungVerein,
  type RechnungZahlung,
  type RechnungZahlungErgebnisDto,
  type RechnungenAbfrage,
  type RechnungsempfaengerAendern,
  type RechnungsempfaengerDto,
  type RechnungsempfaengerEingabe,
  type BelegModus,
  faelligAm,
  gebindeBezeichnung,
  pruefeBestand,
  pruefeBuchung,
  rechnungBerechnen,
  rechnungBuchungstext,
  rechnungEntwurfDatenSchema,
  rechnungKontoIds,
  rechnungNummer,
  rechnungPruefen,
  rechnungStatus,
  rechnungStellungsZeilen,
  rechnungStornoText,
  rechnungUeberfaellig,
  rechnungWarnungen,
  rechnungZahlungPruefen,
  rechnungZahlungText,
  rechnungZahlungsKontoId,
  rechnungZahlungsZeilen,
  type BestandKonto,
  type Gebinde,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  finBuchungen,
  finKonten,
  finRechnungDateien,
  finRechnungEinstellungen,
  finRechnungEntwuerfe,
  finRechnungZahlungen,
  finRechnungen,
  finRechnungsempfaenger,
  finRechnungsposten,
  finZaehler,
  gebinde,
  finSteuersatzZeitraeume,
  wareGebinde,
  waren,
  type FinRechnungRow,
} from './db/schema';
import { sperreBeruehren } from './db/sperren';
import { BuchungUngueltig, zaehlungKontoFehler, type GebuchtErgebnis, type Q } from './finanzen';
import {
  BelegWarnungenOffen,
  datumBerlin,
  type BelegeKern,
  type BelegKonto,
} from './finanzenBelege';
import type { Tx } from './waren';

// Finanzen Rechnungen (see docs/finanzen.md): outgoing invoices with Ist-Versteuerung. The planning
// (validation, journal lines) is pure and shared with the fake.

export { BelegWarnungenOffen };

/** The action is not allowed in the state of the Rechnung (already paid, cancelled, ...). */
export class RechnungKonflikt extends Error {}

/** What the Rechnungen code needs from the journal store beyond the Belege kern. */
export interface RechnungenKern extends BelegeKern {
  /** Reverses a booking inside `tx`; undefined when it does not exist. Throws StornoKonflikt. */
  stornoEinfuegen(
    tx: Tx,
    buchungId: string,
    e: {
      datum: string;
      text: (original: { seq: number }) => string;
      sub: string;
      rechnungErlaubt?: boolean;
    },
  ): Promise<GebuchtErgebnis | undefined>;
}

// ----- Planning (pure)

/** The recipient as it is printed; `mitgliedSub` xor `empfaengerId` is set. */
export interface RechnungEmpfaengerAufgeloest {
  mitgliedSub: string | null;
  empfaengerId: string | null;
  name: string;
  anschrift: string;
  ustId: string | null;
}
export type RechnungEmpfaengerErgebnis = RechnungEmpfaengerAufgeloest | { fehler: string };

export interface RechnungEinstellungenEintrag extends RechnungVerein {
  id: string;
  zahlungszielTage: number;
  erloesKontoWaren: string | null;
  /** Cognito sub. */
  erstelltVon: string;
  erstelltAm: string;
}

/** A Ware as the planning sees it; the Gebinde carry their designation for the printout. */
export interface RechnungWare {
  id: string;
  name: string;
  archiviert: boolean;
  gebinde: readonly { id: string; archiviert: boolean; bezeichnung: string }[];
}

export interface RechnungPlanKontext {
  konten: readonly BelegKonto[];
  waren: readonly RechnungWare[];
  zeitraeume: readonly { ab: string; regel: number; ermaessigt: number }[];
  heute: string;
  einstellungen: RechnungEinstellungenEintrag | null;
  empfaenger: RechnungEmpfaengerErgebnis | null;
}

/** An item as stored. */
export interface RechnungPostenZeile {
  pos: number;
  art: RechnungPostenArt;
  wareId: string | null;
  gebindeId: string | null;
  einheit: string | null;
  text: string;
  anzahlMilli: number;
  einzelpreisCent: number;
  pfandCent: number | null;
  pfandBetragCent: number | null;
  steuersatz: number;
  erloesKontoId: string;
  gesamtCent: number;
}

export interface RechnungPlan {
  fehler: string[];
  /** Set when `fehler` is empty. */
  buchung?: {
    rechnungsdatum: string;
    faelligAm: string;
    zahlungszielTage: number;
    verein: RechnungVerein;
    empfaenger: RechnungEmpfaengerAufgeloest;
    posten: RechnungPostenZeile[];
    summeCent: number;
    zeilen: BelegZeile[];
  };
}

export const VEREIN_FELDER = [
  'vereinsname',
  'anschrift',
  'steuernummer',
  'ustId',
  'bankName',
  'iban',
  'bic',
  'vorstand',
  'register',
  'kontakt',
  'fusstext',
] as const satisfies readonly (keyof RechnungVerein)[];

/** The club data of the Einstellungen as stored with a Rechnung. */
export const vereinAus = (e: RechnungVerein): RechnungVerein => ({
  vereinsname: e.vereinsname,
  anschrift: e.anschrift,
  steuernummer: e.steuernummer,
  ustId: e.ustId,
  bankName: e.bankName,
  iban: e.iban,
  bic: e.bic,
  vorstand: e.vorstand,
  register: e.register,
  kontakt: e.kontakt,
  fusstext: e.fusstext,
});

/** Validates a draft against the accounts and builds the posten and the journal lines of Stellen. */
export function planeRechnung(daten: RechnungEntwurfDaten, k: RechnungPlanKontext): RechnungPlan {
  const fehler = rechnungPruefen(daten, { heute: k.heute, zeitraeume: k.zeitraeume }).map(
    (f) => f.meldung,
  );
  if (!k.einstellungen) fehler.push('Bitte erst die Rechnungs-Einstellungen ausfüllen.');
  if (k.empfaenger && 'fehler' in k.empfaenger) fehler.push(k.empfaenger.fehler);
  const konten = new Map(k.konten.map((x) => [x.id, x]));
  for (const id of new Set(
    daten.posten.flatMap((p) => (p.erloesKontoId ? [p.erloesKontoId] : [])),
  )) {
    const konto = konten.get(id);
    if (!konto) fehler.push('Eine Erlös-Kategorie gibt es nicht.');
    else if (konto.art !== 'erloes' || konto.hatUnterkonten)
      fehler.push(`„${konto.name}“ ist keine Erlös-Kategorie.`);
  }
  const waren = new Map(k.waren.map((w) => [w.id, w]));
  const einheiten = new Map<number, string>();
  let wareZeile = 0;
  daten.posten.forEach((p, i) => {
    if (p.art !== 'ware') return;
    const n = `Waren, Zeile ${++wareZeile}`;
    if (!p.wareId || !p.gebindeId) return;
    const w = waren.get(p.wareId);
    const g = w?.gebinde.find((x) => x.id === p.gebindeId);
    if (!w) fehler.push(`${n}: Die Ware gibt es nicht.`);
    else if (w.archiviert) fehler.push(`${n}: Die Ware „${w.name}“ ist archiviert.`);
    else if (!g) fehler.push(`${n}: Dieses Gebinde gehört nicht zur Ware „${w.name}“.`);
    else if (g.archiviert) fehler.push(`${n}: Das Gebinde ist archiviert.`);
    else einheiten.set(i, g.bezeichnung);
  });
  if (fehler.length > 0 || !k.einstellungen || !k.empfaenger || 'fehler' in k.empfaenger)
    return { fehler };
  const berechnung = rechnungBerechnen(daten);
  const zeilen = rechnungStellungsZeilen(berechnung.summe);
  const geprueft = pruefeBuchung({ zeilen: zeilen.map((z) => ({ ...z })) }, k.konten);
  if (geprueft.length > 0) return { fehler: geprueft };
  const zahlungszielTage = daten.zahlungszielTage ?? k.einstellungen.zahlungszielTage;
  return {
    fehler: [],
    buchung: {
      rechnungsdatum: k.heute,
      faelligAm: faelligAm(k.heute, zahlungszielTage),
      zahlungszielTage,
      verein: vereinAus(k.einstellungen),
      empfaenger: k.empfaenger,
      summeCent: berechnung.summe,
      zeilen,
      posten: daten.posten.map((p, i) => ({
        pos: i + 1,
        art: p.art,
        wareId: p.art === 'ware' ? p.wareId : null,
        gebindeId: p.art === 'ware' ? p.gebindeId : null,
        einheit: einheiten.get(i) ?? null,
        text:
          p.art === 'ware' ? p.text.trim() || (waren.get(p.wareId!)?.name ?? '') : p.text.trim(),
        anzahlMilli: p.anzahlMilli,
        einzelpreisCent: p.einzelpreisCent,
        pfandCent: p.art === 'ware' ? p.pfandCent : null,
        pfandBetragCent:
          p.art === 'ware' && p.pfandCent !== null ? berechnung.pfandBetraege[i]! : null,
        steuersatz: p.steuersatz,
        erloesKontoId: p.erloesKontoId!,
        gesamtCent: berechnung.postenBetraege[i]!,
      })),
    },
  };
}

/** A stored Rechnung as the payment needs it. */
export interface RechnungFuerZahlung {
  nummer: string;
  empfaengerName: string;
  modus: BelegModus;
  bruttoCent: number;
  rechnungsdatum: string;
  posten: readonly Pick<
    RechnungPostenZeile,
    'art' | 'anzahlMilli' | 'einzelpreisCent' | 'pfandCent' | 'steuersatz' | 'erloesKontoId'
  >[];
}

/** Accounts a payment books on. */
export const zahlungKontoIds = (
  r: Pick<RechnungFuerZahlung, 'posten'>,
  z: Pick<RechnungZahlung, 'zahlweg' | 'fachId'>,
): string[] => [
  ...new Set([...rechnungKontoIds({ posten: r.posten }), rechnungZahlungsKontoId(z)]),
];

/** Validates a payment and builds its journal lines; `fehler` empty = fine. */
export function planeRechnungZahlung(
  eingabe: RechnungZahlung,
  k: {
    rechnung: RechnungFuerZahlung;
    konten: readonly BelegKonto[];
    bestand: readonly BestandKonto[];
    heute: string;
  },
): { fehler: string[]; warnungen: BelegWarnungDto[]; zeilen: BelegZeile[]; text: string } {
  const text = rechnungZahlungText(k.rechnung.nummer, k.rechnung.empfaengerName);
  const { fehler, warnungen } = rechnungZahlungPruefen(eingabe, {
    heute: k.heute,
    rechnungsdatum: k.rechnung.rechnungsdatum,
    bruttoCent: k.rechnung.bruttoCent,
  });
  const kontoId = rechnungZahlungsKontoId(eingabe);
  if (eingabe.zahlweg === 'bar')
    fehler.push(...zaehlungKontoFehler(k.konten.find((x) => x.id === kontoId)));
  if (fehler.length > 0) return { fehler, warnungen, zeilen: [], text };
  const zeilen = rechnungZahlungsZeilen(
    {
      modus: k.rechnung.modus,
      posten: k.rechnung.posten.map((p) => ({ ...p })),
    },
    { kontoId, ...(eingabe.zahlweg === 'bar' && { stueckelung: eingabe.stueckelung }) },
  );
  const geprueft = [
    ...pruefeBuchung({ zeilen: zeilen.map((z) => ({ ...z })) }, k.konten),
    ...pruefeBestand(zeilen, k.bestand),
  ];
  return { fehler: geprueft, warnungen, zeilen, text };
}

// ----- Store

export interface RechnungEntwurfEintrag {
  id: string;
  daten: RechnungEntwurfDaten;
  /** Cognito sub. */
  erstelltVon: string;
  erstelltAm: string;
  geaendertAm: string;
}

export interface RechnungListeEintrag extends Omit<RechnungListeDto, 'mitglied'> {
  mitgliedSub: string | null;
}

export interface RechnungDetailEintrag extends Omit<
  RechnungDetailDto,
  'mitglied' | 'erstelltVon' | 'datei'
> {
  mitgliedSub: string | null;
  /** Cognito sub. */
  erstelltVon: string;
  datei: { sha256: string; groesse: number } | null;
}

/** Rechnungen part of `FinanzenStore`. Subs are Cognito subs; the routes turn them into member DTOs. */
export interface RechnungenStore {
  /** Rechnungen (with items and payments) of the bookings dated in [von, bis], for the Datenexport. */
  datenexportRechnungen(
    von: string,
    bis: string,
    tx?: Tx,
  ): Promise<Pick<DatenexportDaten, 'rechnungen' | 'rechnungsposten' | 'rechnungszahlungen'>>;
  /** The newest version. */
  rechnungEinstellungen(): Promise<RechnungEinstellungenEintrag | undefined>;
  /** Adds a new version; returns its id. */
  rechnungEinstellungenSpeichern(
    eingabe: RechnungEinstellungenEingabe,
    sub: string,
  ): Promise<string>;
  /** By name; archived ones only on request. */
  rechnungsempfaenger(mitArchiv: boolean): Promise<RechnungsempfaengerDto[]>;
  /** Throws BuchungUngueltig when the name exists already (case-insensitive). Returns the id. */
  rechnungsempfaengerAnlegen(eingabe: RechnungsempfaengerEingabe): Promise<string>;
  /** False when it does not exist; throws BuchungUngueltig for a name that exists already. */
  rechnungsempfaengerAendern(id: string, daten: RechnungsempfaengerAendern): Promise<boolean>;
  rechnungEntwurfAnlegen(daten: RechnungEntwurfDaten, sub: string): Promise<string>;
  rechnungEntwurf(id: string): Promise<RechnungEntwurfEintrag | undefined>;
  /** False when the draft does not exist (e.g. already issued). */
  rechnungEntwurfSpeichern(id: string, daten: RechnungEntwurfDaten): Promise<boolean>;
  rechnungEntwurfLoeschen(id: string): Promise<boolean>;
  /** The warnings before Stellen; undefined when the draft does not exist. */
  rechnungEntwurfWarnungen(id: string): Promise<BelegWarnungDto[] | undefined>;
  /**
   * Issues a draft in one transaction (number, Rechnung, items, booking; the draft is deleted).
   * `mitglied` is the recipient resolved by the route for a draft addressed to a member. Undefined
   * when the draft does not exist and the key is new. Throws BuchungUngueltig, BelegWarnungenOffen.
   */
  rechnungStellen(
    id: string,
    eingabe: RechnungStellen,
    sub: string,
    mitglied: RechnungEmpfaengerErgebnis | null,
  ): Promise<RechnungGestelltDto | undefined>;
  /** Drafts first, then issued ones newest first (at most `limit`), plus the key figures of all. */
  rechnungen(abfrage: RechnungenAbfrage & { limit: number }): Promise<{
    eintraege: RechnungListeEintrag[];
    gekappt: boolean;
    offeneSummeCent: number;
    ueberfaelligAnzahl: number;
  }>;
  rechnung(id: string): Promise<RechnungDetailEintrag | undefined>;
  /** Books a payment; undefined when the Rechnung does not exist. Throws RechnungKonflikt, BuchungUngueltig, BelegWarnungenOffen. */
  rechnungZahlen(
    id: string,
    eingabe: RechnungZahlung,
    sub: string,
  ): Promise<RechnungZahlungErgebnisDto | undefined>;
  /** Issues the Stornorechnung of an unpaid Rechnung; undefined when it does not exist. */
  rechnungStornieren(
    id: string,
    eingabe: RechnungStorno,
    sub: string,
  ): Promise<RechnungStornoErgebnisDto | undefined>;
  /** New draft with the data of an issued Rechnung; undefined when it does not exist. */
  rechnungKopieren(id: string, sub: string): Promise<string | undefined>;
  /** Registers the PDF; 'fehlt' when the Rechnung does not exist, 'vorhanden' when it has one. */
  rechnungDateiRegistrieren(
    id: string,
    datei: RechnungDateiEingabe,
  ): Promise<'ok' | 'fehlt' | 'vorhanden'>;
}

const gleicherName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const datenAusRow = (json: string): RechnungEntwurfDaten =>
  rechnungEntwurfDatenSchema.parse(JSON.parse(json));

const vereinAusRow = (json: string): RechnungVerein => JSON.parse(json) as RechnungVerein;

export const empfaengerDto = (r: {
  id: string;
  name: string;
  anschrift: string;
  email: string | null;
  ustId: string | null;
  archiviert: boolean;
}): RechnungsempfaengerDto => ({
  id: r.id,
  name: r.name,
  anschrift: r.anschrift,
  email: r.email,
  ustId: r.ustId,
  archiviert: r.archiviert,
});

/** The draft data of a copy of an issued Rechnung. */
export const entwurfAusRechnung = (r: {
  mitgliedSub: string | null;
  empfaengerId: string | null;
  modus: BelegModus;
  betreff: string;
  einleitung: string | null;
  hinweis: string | null;
  posten: readonly RechnungPostenZeile[];
}): RechnungEntwurfDaten =>
  rechnungEntwurfDatenSchema.parse({
    empfaenger: r.mitgliedSub
      ? { typ: 'mitglied', sub: r.mitgliedSub }
      : r.empfaengerId
        ? { typ: 'extern', id: r.empfaengerId }
        : null,
    betreff: r.betreff,
    einleitung: r.einleitung,
    hinweis: r.hinweis,
    modus: r.modus,
    posten: r.posten.map((p) =>
      p.art === 'ware'
        ? {
            art: 'ware',
            wareId: p.wareId,
            gebindeId: p.gebindeId,
            text: p.text,
            anzahlMilli: p.anzahlMilli,
            einzelpreisCent: p.einzelpreisCent,
            pfandCent: p.pfandCent,
            steuersatz: p.steuersatz,
            erloesKontoId: p.erloesKontoId,
          }
        : {
            art: 'frei',
            text: p.text,
            anzahlMilli: p.anzahlMilli,
            einzelpreisCent: p.einzelpreisCent,
            steuersatz: p.steuersatz,
            erloesKontoId: p.erloesKontoId,
          },
    ),
  });

/** The state of a Rechnung derived from Stornorechnung and payment, for the list and detail. */
export interface RechnungZustand {
  status: RechnungStatus;
  ueberfaellig: boolean;
}

export const zustandBilden = (
  r: { faelligAm: string; istStorno: boolean },
  stornoVorhanden: boolean,
  bezahlt: boolean,
  heute: string,
): RechnungZustand => {
  const status = rechnungStatus({
    istStorno: r.istStorno,
    stornoRechnungVorhanden: stornoVorhanden,
    bezahlt,
  });
  return { status, ueberfaellig: rechnungUeberfaellig(status, r.faelligAm, heute) };
};

/** Whether the list entry passes the filter (status, search); `jahr` is applied to issued ones only. */
export const listePasst = (
  e: Pick<RechnungListeEintrag, 'status' | 'nummer' | 'empfaengerName' | 'betreff'>,
  abfrage: RechnungenAbfrage,
): boolean => {
  if (abfrage.status && e.status !== abfrage.status) return false;
  const q = abfrage.q?.toLowerCase();
  if (!q) return true;
  return [e.nummer ?? '', e.empfaengerName ?? '', e.betreff].some((t) =>
    t.toLowerCase().includes(q),
  );
};

export function createRechnungenStore(db: Db, kern: RechnungenKern): RechnungenStore {
  const naechsteNummer = async (tx: Tx, jahr: number): Promise<{ nummer: string; lfd: number }> => {
    const name = `rechnung:${jahr}`;
    await sperreBeruehren(tx, `rechnung-zaehler:${jahr}`);
    const [zeile] = await tx.select().from(finZaehler).where(eq(finZaehler.name, name));
    if (zeile) {
      await tx
        .update(finZaehler)
        .set({ wert: sql`${finZaehler.wert} + 1` })
        .where(eq(finZaehler.name, name));
      return { nummer: rechnungNummer(jahr, zeile.wert + 1), lfd: zeile.wert + 1 };
    }
    await tx.insert(finZaehler).values({ name, wert: 1, letzterHash: '' });
    return { nummer: rechnungNummer(jahr, 1), lfd: 1 };
  };

  const einstellungenLaden = async (q: Q): Promise<RechnungEinstellungenEintrag | null> => {
    const [row] = await q
      .select()
      .from(finRechnungEinstellungen)
      .orderBy(desc(finRechnungEinstellungen.erstelltAm))
      .limit(1);
    return row ? { ...row, erstelltAm: row.erstelltAm.toISOString() } : null;
  };

  const stornierte = async (q: Q, buchungIds: string[]): Promise<Set<string>> => {
    if (buchungIds.length === 0) return new Set();
    const rows = await q
      .select({ stornoVon: finBuchungen.stornoVon })
      .from(finBuchungen)
      .where(inArray(finBuchungen.stornoVon, buchungIds));
    return new Set(rows.flatMap((r) => (r.stornoVon ? [r.stornoVon] : [])));
  };

  /** Stornorechnungen by cancelled Rechnung and the active (not reversed) payment by Rechnung. */
  const zustandsDaten = async (q: Q) => {
    const [stornos, zahlungen] = await Promise.all([
      q
        .select({
          id: finRechnungen.id,
          nummer: finRechnungen.nummer,
          rechnungsdatum: finRechnungen.rechnungsdatum,
          stornoVon: finRechnungen.stornoVon,
        })
        .from(finRechnungen)
        .where(isNotNull(finRechnungen.stornoVon)),
      q.select().from(finRechnungZahlungen).orderBy(desc(finRechnungZahlungen.erstelltAm)),
    ]);
    const storno = await stornierte(
      q,
      zahlungen.map((z) => z.buchungId),
    );
    const stornoZu = new Map(stornos.map((s) => [s.stornoVon!, s]));
    const zahlungVon = new Map<string, (typeof zahlungen)[number]>();
    for (const z of zahlungen)
      if (!storno.has(z.buchungId) && !zahlungVon.has(z.rechnungId))
        zahlungVon.set(z.rechnungId, z);
    return { stornoZu, zahlungVon };
  };

  const postenLaden = async (q: Q, rechnungIds: string[]) => {
    if (rechnungIds.length === 0) return [];
    return q
      .select({ p: finRechnungsposten, kontoName: finKonten.name })
      .from(finRechnungsposten)
      .innerJoin(finKonten, eq(finKonten.id, finRechnungsposten.erloesKontoId))
      .where(inArray(finRechnungsposten.rechnungId, rechnungIds))
      .orderBy(asc(finRechnungsposten.rechnungId), asc(finRechnungsposten.pos));
  };

  const postenZeile = (p: typeof finRechnungsposten.$inferSelect): RechnungPostenZeile => ({
    pos: p.pos,
    art: p.art,
    wareId: p.wareId,
    gebindeId: p.gebindeId,
    einheit: p.einheit,
    text: p.text,
    anzahlMilli: p.anzahlMilli,
    einzelpreisCent: p.einzelpreisCent,
    pfandCent: p.pfandCent,
    pfandBetragCent: p.pfandBetragCent,
    steuersatz: p.steuersatz,
    erloesKontoId: p.erloesKontoId,
    gesamtCent: p.gesamtCent,
  });

  const zeitraeumeLaden = async (q: Q) =>
    (await q.select().from(finSteuersatzZeitraeume).orderBy(asc(finSteuersatzZeitraeume.ab))).map(
      (z) => ({ ab: z.ab, regel: z.regel, ermaessigt: z.ermaessigt }),
    );

  const planKontext = async (
    q: Q,
    daten: RechnungEntwurfDaten,
    mitglied: RechnungEmpfaengerErgebnis | null,
  ): Promise<RechnungPlanKontext> => {
    const { pruef, rows } = await kern.kontenMitBestand(q, rechnungKontoIds(daten));
    const art = new Map(rows.map((k) => [k.id, k.art]));
    const wareIds = [
      ...new Set(daten.posten.flatMap((p) => (p.art === 'ware' && p.wareId ? [p.wareId] : []))),
    ];
    const [wareRows, verknuepft, alleGebinde] = wareIds.length
      ? await Promise.all([
          q.select().from(waren).where(inArray(waren.id, wareIds)),
          q
            .select({ wareId: wareGebinde.wareId, gebindeId: wareGebinde.gebindeId })
            .from(wareGebinde)
            .where(inArray(wareGebinde.wareId, wareIds)),
          q.select().from(gebinde),
        ])
      : [[], [], []];
    const alle = alleGebinde as (Gebinde & { archiviert: boolean })[];
    let empfaenger: RechnungEmpfaengerErgebnis | null = null;
    if (daten.empfaenger?.typ === 'mitglied') empfaenger = mitglied;
    else if (daten.empfaenger?.typ === 'extern') {
      const [e] = await q
        .select()
        .from(finRechnungsempfaenger)
        .where(eq(finRechnungsempfaenger.id, daten.empfaenger.id));
      empfaenger = !e
        ? { fehler: 'Den Empfänger gibt es nicht.' }
        : e.archiviert
          ? { fehler: `Der Empfänger „${e.name}“ ist archiviert.` }
          : {
              mitgliedSub: null,
              empfaengerId: e.id,
              name: e.name,
              anschrift: e.anschrift,
              ustId: e.ustId,
            };
    }
    return {
      zeitraeume: await zeitraeumeLaden(q),
      heute: datumBerlin(new Date()),
      einstellungen: await einstellungenLaden(q),
      empfaenger,
      konten: pruef.map((k) => ({ ...k, art: art.get(k.id)! })),
      waren: wareRows.map((w) => ({
        id: w.id,
        name: w.name,
        archiviert: w.archiviert,
        gebinde: verknuepft
          .filter((v) => v.wareId === w.id)
          .flatMap((v) => {
            const g = alle.find((x) => x.id === v.gebindeId);
            return g
              ? [{ id: g.id, archiviert: g.archiviert, bezeichnung: gebindeBezeichnung(g, alle) }]
              : [];
          }),
      })),
    };
  };

  const gestelltErgebnis = async (q: Q, row: FinRechnungRow, wiederholt?: boolean) => {
    const [b] = await q
      .select({ seq: finBuchungen.seq })
      .from(finBuchungen)
      .where(eq(finBuchungen.id, row.buchungId));
    return {
      id: row.id,
      nummer: row.nummer,
      buchungId: row.buchungId,
      buchungSeq: b?.seq ?? 0,
      ...(wiederholt && { wiederholt }),
    } satisfies RechnungGestelltDto;
  };

  const stellenTx = (
    id: string,
    eingabe: RechnungStellen,
    sub: string,
    mitglied: RechnungEmpfaengerErgebnis | null,
  ) =>
    kern.wiederholen(() =>
      db.transaction(async (tx) => {
        const [schon] = await tx
          .select()
          .from(finRechnungen)
          .where(eq(finRechnungen.idempotenzSchluessel, eingabe.idempotenzSchluessel));
        if (schon) return gestelltErgebnis(tx, schon, true);
        const [entwurf] = await tx
          .select()
          .from(finRechnungEntwuerfe)
          .where(eq(finRechnungEntwuerfe.id, id));
        if (!entwurf) return undefined;
        const daten = datenAusRow(entwurf.daten);
        const plan = planeRechnung(daten, await planKontext(tx, daten, mitglied));
        if (!plan.buchung) throw new BuchungUngueltig(plan.fehler);
        const b = plan.buchung;
        const offen = rechnungWarnungen({ daten, heute: b.rechnungsdatum }).filter(
          (w) => !eingabe.bestaetigt.includes(w.code),
        );
        if (offen.length > 0) throw new BelegWarnungenOffen(offen);
        const jetzt = new Date();
        const jahr = Number(b.rechnungsdatum.slice(0, 4));
        const { nummer, lfd } = await naechsteNummer(tx, jahr);
        const rechnungId = randomUUID();
        const gebucht = await kern.einfuegen(tx, {
          datum: b.rechnungsdatum,
          text: rechnungBuchungstext(nummer, b.empfaenger.name),
          quelleTyp: 'rechnung',
          datumVerschiebbar: true,
          quelleId: rechnungId,
          eventId: null,
          stornoVon: null,
          erstelltVon: sub,
          zeilen: b.zeilen,
        });
        await tx.insert(finRechnungen).values({
          id: rechnungId,
          nummer,
          jahr,
          lfd,
          rechnungsdatum: b.rechnungsdatum,
          leistungVon: daten.leistungVon!,
          leistungBis: daten.leistungBis,
          faelligAm: b.faelligAm,
          mitgliedSub: b.empfaenger.mitgliedSub,
          empfaengerId: b.empfaenger.empfaengerId,
          empfaengerName: b.empfaenger.name,
          empfaengerAnschrift: b.empfaenger.anschrift,
          empfaengerUstId: b.empfaenger.ustId,
          verein: JSON.stringify(b.verein),
          modus: daten.modus,
          betreff: daten.betreff.trim(),
          einleitung: daten.einleitung,
          hinweis: daten.hinweis,
          bruttoCent: b.summeCent,
          stornoVon: null,
          stornoBegruendung: null,
          buchungId: gebucht.id,
          idempotenzSchluessel: eingabe.idempotenzSchluessel,
          erstelltVon: sub,
          erstelltAm: jetzt,
        });
        await tx.insert(finRechnungsposten).values(b.posten.map((p) => ({ rechnungId, ...p })));
        await tx.delete(finRechnungEntwuerfe).where(eq(finRechnungEntwuerfe.id, id));
        return { id: rechnungId, nummer, buchungId: gebucht.id, buchungSeq: gebucht.seq };
      }),
    );

  /** State of one Rechnung inside a transaction. */
  const zustandEinzeln = async (q: Q, row: FinRechnungRow) => {
    const { stornoZu, zahlungVon } = await zustandsDaten(q);
    return {
      stornoVorhanden: stornoZu.has(row.id),
      zahlung: zahlungVon.get(row.id) ?? null,
    };
  };

  const zahlenTx = (id: string, eingabe: RechnungZahlung, sub: string) =>
    kern.wiederholen(() =>
      db.transaction(async (tx) => {
        const [schon] = await tx
          .select({ z: finRechnungZahlungen, seq: finBuchungen.seq })
          .from(finRechnungZahlungen)
          .innerJoin(finBuchungen, eq(finBuchungen.id, finRechnungZahlungen.buchungId))
          .where(eq(finRechnungZahlungen.idempotenzSchluessel, eingabe.idempotenzSchluessel));
        if (schon)
          return {
            id: schon.z.id,
            buchungId: schon.z.buchungId,
            buchungSeq: schon.seq,
            wiederholt: true,
          } satisfies RechnungZahlungErgebnisDto;
        // Two payments of the same Rechnung must not both be booked.
        await sperreBeruehren(tx, `rechnung:${id}`);
        const [row] = await tx.select().from(finRechnungen).where(eq(finRechnungen.id, id));
        if (!row) return undefined;
        if (row.stornoVon) throw new RechnungKonflikt('Eine Stornorechnung wird nicht bezahlt.');
        const zustand = await zustandEinzeln(tx, row);
        if (zustand.stornoVorhanden) throw new RechnungKonflikt('Die Rechnung ist storniert.');
        if (zustand.zahlung) throw new RechnungKonflikt('Die Rechnung ist schon bezahlt.');
        const posten = (await postenLaden(tx, [id])).map((x) => postenZeile(x.p));
        const rechnung: RechnungFuerZahlung = {
          nummer: row.nummer,
          empfaengerName: row.empfaengerName,
          modus: row.modus,
          bruttoCent: row.bruttoCent,
          rechnungsdatum: row.rechnungsdatum,
          posten,
        };
        const { pruef, bestand, rows } = await kern.kontenMitBestand(
          tx,
          zahlungKontoIds(rechnung, eingabe),
        );
        const art = new Map(rows.map((k) => [k.id, k.art]));
        const heute = datumBerlin(new Date());
        const plan = planeRechnungZahlung(eingabe, {
          rechnung,
          konten: pruef.map((k) => ({ ...k, art: art.get(k.id)! })),
          bestand,
          heute,
        });
        if (plan.fehler.length > 0) throw new BuchungUngueltig(plan.fehler);
        const offen = plan.warnungen.filter((w) => !eingabe.bestaetigt.includes(w.code));
        if (offen.length > 0) throw new BelegWarnungenOffen(offen);
        const zahlungId = randomUUID();
        const gebucht = await kern.einfuegen(tx, {
          datum: eingabe.datum,
          text: plan.text,
          quelleTyp: 'rechnungszahlung',
          datumVerschiebbar: true,
          quelleId: id,
          eventId: null,
          stornoVon: null,
          erstelltVon: sub,
          zeilen: plan.zeilen,
        });
        await tx.insert(finRechnungZahlungen).values({
          id: zahlungId,
          rechnungId: id,
          zahlweg: eingabe.zahlweg,
          datum: eingabe.datum,
          kontoId: rechnungZahlungsKontoId(eingabe),
          buchungId: gebucht.id,
          idempotenzSchluessel: eingabe.idempotenzSchluessel,
          erstelltVon: sub,
          erstelltAm: new Date(),
        });
        return {
          id: zahlungId,
          buchungId: gebucht.id,
          buchungSeq: gebucht.seq,
        } satisfies RechnungZahlungErgebnisDto;
      }),
    );

  const stornierenTx = (id: string, eingabe: RechnungStorno, sub: string) =>
    kern.wiederholen(() =>
      db.transaction(async (tx) => {
        const [schon] = await tx
          .select()
          .from(finRechnungen)
          .where(eq(finRechnungen.idempotenzSchluessel, eingabe.idempotenzSchluessel));
        if (schon)
          return (await gestelltErgebnis(tx, schon, true)) satisfies RechnungStornoErgebnisDto;
        await sperreBeruehren(tx, `rechnung:${id}`);
        const [row] = await tx.select().from(finRechnungen).where(eq(finRechnungen.id, id));
        if (!row) return undefined;
        if (row.stornoVon)
          throw new RechnungKonflikt('Eine Stornorechnung kann nicht storniert werden.');
        const zustand = await zustandEinzeln(tx, row);
        if (zustand.stornoVorhanden)
          throw new RechnungKonflikt('Die Rechnung ist schon storniert.');
        if (zustand.zahlung)
          throw new RechnungKonflikt(
            'Die Rechnung ist bezahlt. Storniere zuerst die Zahlungsbuchung im Journal, dann die Rechnung.',
          );
        const heute = datumBerlin(new Date());
        const jahr = Number(heute.slice(0, 4));
        const { nummer, lfd } = await naechsteNummer(tx, jahr);
        const gebucht = await kern.stornoEinfuegen(tx, row.buchungId, {
          datum: heute,
          text: () => rechnungStornoText(nummer, row.nummer),
          sub,
          rechnungErlaubt: true,
        });
        if (!gebucht) throw new BuchungUngueltig(['Die Buchung der Rechnung gibt es nicht.']);
        const stornoId = randomUUID();
        await tx.insert(finRechnungen).values({
          ...row,
          id: stornoId,
          nummer,
          jahr,
          lfd,
          rechnungsdatum: heute,
          faelligAm: heute,
          bruttoCent: -row.bruttoCent,
          stornoVon: id,
          stornoBegruendung: eingabe.begruendung,
          buchungId: gebucht.id,
          idempotenzSchluessel: eingabe.idempotenzSchluessel,
          erstelltVon: sub,
          erstelltAm: new Date(),
        });
        const posten = await tx
          .select()
          .from(finRechnungsposten)
          .where(eq(finRechnungsposten.rechnungId, id));
        await tx.insert(finRechnungsposten).values(
          posten.map((p) => ({
            ...p,
            rechnungId: stornoId,
            anzahlMilli: -p.anzahlMilli,
            gesamtCent: -p.gesamtCent,
            pfandBetragCent: p.pfandBetragCent === null ? null : -p.pfandBetragCent,
          })),
        );
        return {
          id: stornoId,
          nummer,
          buchungId: gebucht.id,
          buchungSeq: gebucht.seq,
        } satisfies RechnungStornoErgebnisDto;
      }),
    );

  const eintragListe = (r: FinRechnungRow, zustand: RechnungZustand): RechnungListeEintrag => ({
    id: r.id,
    status: zustand.status,
    ueberfaellig: zustand.ueberfaellig,
    nummer: r.nummer,
    istStorno: r.stornoVon !== null,
    rechnungsdatum: r.rechnungsdatum,
    faelligAm: r.faelligAm,
    empfaengerName: r.empfaengerName,
    mitgliedSub: r.mitgliedSub,
    bruttoCent: r.bruttoCent,
    betreff: r.betreff,
  });

  return {
    async datenexportRechnungen(von, bis, tx) {
      const q: Q = tx ?? db;
      const imZeitraum = and(gte(finBuchungen.datum, von), lte(finBuchungen.datum, bis));
      const [gestellt, zahlungen] = await Promise.all([
        q
          .select({ r: finRechnungen })
          .from(finRechnungen)
          .innerJoin(finBuchungen, eq(finBuchungen.id, finRechnungen.buchungId))
          .where(imZeitraum),
        q
          .select({ z: finRechnungZahlungen })
          .from(finRechnungZahlungen)
          .innerJoin(finBuchungen, eq(finBuchungen.id, finRechnungZahlungen.buchungId))
          .where(imZeitraum),
      ]);
      // A payment in the period brings its Rechnung along, even when it was issued earlier.
      const bekannt = new Set(gestellt.map(({ r }) => r.id));
      const fehlend = [...new Set(zahlungen.map(({ z }) => z.rechnungId))].filter(
        (id) => !bekannt.has(id),
      );
      const nachgeladen = fehlend.length
        ? await q.select().from(finRechnungen).where(inArray(finRechnungen.id, fehlend))
        : [];
      const rechnungen = [...gestellt.map(({ r }) => r), ...nachgeladen].sort((a, b) =>
        a.nummer.localeCompare(b.nummer),
      );
      const ids = rechnungen.map((r) => r.id);
      const [posten, dateien] = await Promise.all([
        ids.length
          ? q
              .select()
              .from(finRechnungsposten)
              .where(inArray(finRechnungsposten.rechnungId, ids))
              .orderBy(asc(finRechnungsposten.rechnungId), asc(finRechnungsposten.pos))
          : [],
        ids.length
          ? q.select().from(finRechnungDateien).where(inArray(finRechnungDateien.rechnungId, ids))
          : [],
      ]);
      const datei = new Map(dateien.map((d) => [d.rechnungId, d.sha256]));
      return {
        rechnungen: rechnungen.map((r) => ({
          id: r.id,
          nummer: r.nummer,
          rechnungsdatum: r.rechnungsdatum,
          leistungVon: r.leistungVon,
          leistungBis: r.leistungBis,
          faelligAm: r.faelligAm,
          mitgliedSub: r.mitgliedSub,
          empfaengerId: r.empfaengerId,
          empfaengerName: r.empfaengerName,
          empfaengerAnschrift: r.empfaengerAnschrift,
          empfaengerUstId: r.empfaengerUstId,
          modus: r.modus,
          betreff: r.betreff,
          bruttoCent: r.bruttoCent,
          stornoVon: r.stornoVon,
          stornoBegruendung: r.stornoBegruendung,
          buchungId: r.buchungId,
          dateiSha256: datei.get(r.id) ?? null,
          dateiSchluessel: datei.has(r.id) ? `rechnungen/${datei.get(r.id)}.pdf` : null,
          erstelltVon: r.erstelltVon,
          erstelltAm: r.erstelltAm.toISOString(),
        })),
        rechnungsposten: posten.map((p) => ({
          rechnungId: p.rechnungId,
          pos: p.pos,
          art: p.art,
          text: p.text,
          einheit: p.einheit,
          anzahlMilli: p.anzahlMilli,
          einzelpreisCent: p.einzelpreisCent,
          pfandCent: p.pfandCent,
          pfandBetragCent: p.pfandBetragCent,
          steuersatz: p.steuersatz,
          erloesKontoId: p.erloesKontoId,
          gesamtCent: p.gesamtCent,
        })),
        rechnungszahlungen: zahlungen
          .map(({ z }) => z)
          .sort((a, b) => a.erstelltAm.getTime() - b.erstelltAm.getTime())
          .map((z) => ({
            id: z.id,
            rechnungId: z.rechnungId,
            zahlweg: z.zahlweg,
            datum: z.datum,
            kontoId: z.kontoId,
            buchungId: z.buchungId,
            erstelltVon: z.erstelltVon,
            erstelltAm: z.erstelltAm.toISOString(),
          })),
      };
    },

    async rechnungEinstellungen() {
      return (await einstellungenLaden(db)) ?? undefined;
    },

    async rechnungEinstellungenSpeichern(eingabe, sub) {
      const id = randomUUID();
      await db.insert(finRechnungEinstellungen).values({
        id,
        ...eingabe,
        erloesKontoWaren: eingabe.erloesKontoWaren,
        erstelltVon: sub,
        erstelltAm: new Date(),
      });
      return id;
    },

    async rechnungsempfaenger(mitArchiv) {
      const rows = await db
        .select()
        .from(finRechnungsempfaenger)
        .orderBy(asc(finRechnungsempfaenger.name));
      return rows.filter((r) => mitArchiv || !r.archiviert).map(empfaengerDto);
    },

    async rechnungsempfaengerAnlegen(eingabe) {
      return kern.wiederholen(() =>
        db.transaction(async (tx) => {
          await sperreBeruehren(tx, 'rechnungsempfaenger');
          const alle = await tx.select().from(finRechnungsempfaenger);
          if (alle.some((r) => gleicherName(r.name, eingabe.name)))
            throw new BuchungUngueltig(['Diesen Empfänger gibt es schon.']);
          const id = randomUUID();
          await tx.insert(finRechnungsempfaenger).values({
            id,
            name: eingabe.name.trim(),
            anschrift: eingabe.anschrift,
            email: eingabe.email,
            ustId: eingabe.ustId,
          });
          return id;
        }),
      );
    },

    async rechnungsempfaengerAendern(id, daten) {
      return kern.wiederholen(() =>
        db.transaction(async (tx) => {
          await sperreBeruehren(tx, 'rechnungsempfaenger');
          const alle = await tx.select().from(finRechnungsempfaenger);
          if (!alle.some((r) => r.id === id)) return false;
          if (
            daten.name !== undefined &&
            alle.some((r) => r.id !== id && gleicherName(r.name, daten.name!))
          )
            throw new BuchungUngueltig(['Diesen Empfänger gibt es schon.']);
          await tx
            .update(finRechnungsempfaenger)
            .set({
              ...(daten.name !== undefined && { name: daten.name.trim() }),
              ...(daten.anschrift !== undefined && { anschrift: daten.anschrift }),
              ...(daten.email !== undefined && { email: daten.email }),
              ...(daten.ustId !== undefined && { ustId: daten.ustId }),
              ...(daten.archiviert !== undefined && { archiviert: daten.archiviert }),
            })
            .where(eq(finRechnungsempfaenger.id, id));
          return true;
        }),
      );
    },

    async rechnungEntwurfAnlegen(daten, sub) {
      const id = randomUUID();
      const jetzt = new Date();
      await db.insert(finRechnungEntwuerfe).values({
        id,
        daten: JSON.stringify(daten),
        erstelltVon: sub,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      });
      return id;
    },

    async rechnungEntwurf(id) {
      const [row] = await db
        .select()
        .from(finRechnungEntwuerfe)
        .where(eq(finRechnungEntwuerfe.id, id));
      return row
        ? {
            id: row.id,
            daten: datenAusRow(row.daten),
            erstelltVon: row.erstelltVon,
            erstelltAm: row.erstelltAm.toISOString(),
            geaendertAm: row.geaendertAm.toISOString(),
          }
        : undefined;
    },

    async rechnungEntwurfSpeichern(id, daten) {
      const rows = await db
        .update(finRechnungEntwuerfe)
        .set({ daten: JSON.stringify(daten), geaendertAm: new Date() })
        .where(eq(finRechnungEntwuerfe.id, id))
        .returning({ id: finRechnungEntwuerfe.id });
      return rows.length > 0;
    },

    async rechnungEntwurfLoeschen(id) {
      const rows = await db
        .delete(finRechnungEntwuerfe)
        .where(eq(finRechnungEntwuerfe.id, id))
        .returning({ id: finRechnungEntwuerfe.id });
      return rows.length > 0;
    },

    async rechnungEntwurfWarnungen(id) {
      const [row] = await db
        .select()
        .from(finRechnungEntwuerfe)
        .where(eq(finRechnungEntwuerfe.id, id));
      return row
        ? rechnungWarnungen({ daten: datenAusRow(row.daten), heute: datumBerlin(new Date()) })
        : undefined;
    },

    async rechnungStellen(id, eingabe, sub, mitglied) {
      try {
        return await stellenTx(id, eingabe, sub, mitglied);
      } catch (err) {
        const e = err as { code?: unknown; cause?: unknown } | null;
        if (e?.code === '23505' || (e?.cause as { code?: unknown } | null)?.code === '23505') {
          const [row] = await db
            .select()
            .from(finRechnungen)
            .where(eq(finRechnungen.idempotenzSchluessel, eingabe.idempotenzSchluessel));
          if (row) return gestelltErgebnis(db, row, true);
        }
        throw err;
      }
    },

    async rechnungen(abfrage) {
      const heute = datumBerlin(new Date());
      const [rows, { stornoZu, zahlungVon }, entwuerfe, empfaenger] = await Promise.all([
        db.select().from(finRechnungen).orderBy(desc(finRechnungen.erstelltAm)),
        zustandsDaten(db),
        db.select().from(finRechnungEntwuerfe).orderBy(desc(finRechnungEntwuerfe.geaendertAm)),
        db.select().from(finRechnungsempfaenger),
      ]);
      const alle = rows.map((r) => ({
        r,
        zustand: zustandBilden(
          { faelligAm: r.faelligAm, istStorno: r.stornoVon !== null },
          stornoZu.has(r.id),
          zahlungVon.has(r.id),
          heute,
        ),
      }));
      const offen = alle.filter((x) => x.zustand.status === 'gestellt');
      const namen = new Map(empfaenger.map((e) => [e.id, e.name]));
      const entwurfListe: RechnungListeEintrag[] = entwuerfe.map((e) => {
        const daten = datenAusRow(e.daten);
        return {
          id: e.id,
          status: 'entwurf',
          ueberfaellig: false,
          nummer: null,
          istStorno: false,
          rechnungsdatum: null,
          faelligAm: null,
          empfaengerName:
            daten.empfaenger?.typ === 'extern' ? (namen.get(daten.empfaenger.id) ?? null) : null,
          mitgliedSub: daten.empfaenger?.typ === 'mitglied' ? daten.empfaenger.sub : null,
          bruttoCent: daten.posten.length > 0 ? rechnungBerechnen(daten).summe : null,
          betreff: daten.betreff,
        };
      });
      const gestellt = alle
        .filter((x) => abfrage.jahr === undefined || x.r.jahr === abfrage.jahr)
        .map((x) => eintragListe(x.r, x.zustand));
      const passend = gestellt.filter((e) => listePasst(e, abfrage));
      return {
        eintraege: [
          ...entwurfListe.filter((e) => listePasst(e, abfrage)),
          ...passend.slice(0, abfrage.limit),
        ],
        gekappt: passend.length > abfrage.limit,
        offeneSummeCent: offen.reduce((s, x) => s + x.r.bruttoCent, 0),
        ueberfaelligAnzahl: offen.filter((x) => x.zustand.ueberfaellig).length,
      };
    },

    async rechnung(id) {
      const [row] = await db.select().from(finRechnungen).where(eq(finRechnungen.id, id));
      if (!row) return undefined;
      const heute = datumBerlin(new Date());
      const [{ stornoZu, zahlungVon }, posten, [datei], [buchung], [original]] = await Promise.all([
        zustandsDaten(db),
        postenLaden(db, [id]),
        db.select().from(finRechnungDateien).where(eq(finRechnungDateien.rechnungId, id)),
        db
          .select({ seq: finBuchungen.seq })
          .from(finBuchungen)
          .where(eq(finBuchungen.id, row.buchungId)),
        row.stornoVon
          ? db.select().from(finRechnungen).where(eq(finRechnungen.id, row.stornoVon))
          : Promise.resolve([]),
      ]);
      const zahlung = zahlungVon.get(id) ?? null;
      const zustand = zustandBilden(
        { faelligAm: row.faelligAm, istStorno: row.stornoVon !== null },
        stornoZu.has(id),
        zahlung !== null,
        heute,
      );
      let zahlungBuchungSeq = 0;
      if (zahlung) {
        const [b] = await db
          .select({ seq: finBuchungen.seq })
          .from(finBuchungen)
          .where(eq(finBuchungen.id, zahlung.buchungId));
        zahlungBuchungSeq = b?.seq ?? 0;
      }
      const postenDto: RechnungPostenDto[] = posten.map(({ p, kontoName }) => ({
        ...postenZeile(p),
        erloesKontoName: kontoName,
        betragCent: p.gesamtCent,
      }));
      const stornorechnung = stornoZu.get(id);
      return {
        id: row.id,
        nummer: row.nummer,
        jahr: row.jahr,
        istStorno: row.stornoVon !== null,
        status: zustand.status,
        ueberfaellig: zustand.ueberfaellig,
        rechnungsdatum: row.rechnungsdatum,
        leistungVon: row.leistungVon,
        leistungBis: row.leistungBis,
        faelligAm: row.faelligAm,
        mitgliedSub: row.mitgliedSub,
        empfaengerId: row.empfaengerId,
        empfaengerName: row.empfaengerName,
        empfaengerAnschrift: row.empfaengerAnschrift,
        empfaengerUstId: row.empfaengerUstId,
        verein: vereinAusRow(row.verein),
        modus: row.modus,
        betreff: row.betreff,
        einleitung: row.einleitung,
        hinweis: row.hinweis,
        bruttoCent: row.bruttoCent,
        posten: postenDto,
        summen: rechnungBerechnen({
          modus: row.modus,
          posten: postenDto.map((p) => ({ ...p, erloesKontoId: p.erloesKontoId })),
        }).jeSteuersatz,
        stornoVon: original
          ? { id: original.id, nummer: original.nummer, rechnungsdatum: original.rechnungsdatum }
          : null,
        stornoBegruendung: row.stornoBegruendung,
        stornorechnung: stornorechnung
          ? {
              id: stornorechnung.id,
              nummer: stornorechnung.nummer,
              rechnungsdatum: stornorechnung.rechnungsdatum,
            }
          : null,
        buchungId: row.buchungId,
        buchungSeq: buchung?.seq ?? 0,
        zahlung: zahlung
          ? {
              id: zahlung.id,
              zahlweg: zahlung.zahlweg,
              datum: zahlung.datum,
              buchungId: zahlung.buchungId,
              buchungSeq: zahlungBuchungSeq,
            }
          : null,
        datei: datei ? { sha256: datei.sha256, groesse: datei.groesse } : null,
        erstelltVon: row.erstelltVon,
        erstelltAm: row.erstelltAm.toISOString(),
      };
    },

    async rechnungZahlen(id, eingabe, sub) {
      try {
        return await zahlenTx(id, eingabe, sub);
      } catch (err) {
        const e = err as { code?: unknown; cause?: unknown } | null;
        if (e?.code === '23505' || (e?.cause as { code?: unknown } | null)?.code === '23505') {
          const [row] = await db
            .select({ z: finRechnungZahlungen, seq: finBuchungen.seq })
            .from(finRechnungZahlungen)
            .innerJoin(finBuchungen, eq(finBuchungen.id, finRechnungZahlungen.buchungId))
            .where(eq(finRechnungZahlungen.idempotenzSchluessel, eingabe.idempotenzSchluessel));
          if (row)
            return {
              id: row.z.id,
              buchungId: row.z.buchungId,
              buchungSeq: row.seq,
              wiederholt: true,
            };
        }
        throw err;
      }
    },

    async rechnungStornieren(id, eingabe, sub) {
      try {
        return await stornierenTx(id, eingabe, sub);
      } catch (err) {
        const e = err as { code?: unknown; cause?: unknown } | null;
        if (e?.code === '23505' || (e?.cause as { code?: unknown } | null)?.code === '23505') {
          const [row] = await db
            .select()
            .from(finRechnungen)
            .where(eq(finRechnungen.idempotenzSchluessel, eingabe.idempotenzSchluessel));
          if (row) return gestelltErgebnis(db, row, true);
        }
        throw err;
      }
    },

    async rechnungKopieren(id, sub) {
      const [row] = await db.select().from(finRechnungen).where(eq(finRechnungen.id, id));
      if (!row) return undefined;
      if (row.stornoVon)
        throw new RechnungKonflikt('Eine Stornorechnung lässt sich nicht kopieren.');
      const posten = (await postenLaden(db, [id])).map((x) => postenZeile(x.p));
      const jetzt = new Date();
      const neu = randomUUID();
      await db.insert(finRechnungEntwuerfe).values({
        id: neu,
        daten: JSON.stringify(entwurfAusRechnung({ ...row, posten })),
        erstelltVon: sub,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      });
      return neu;
    },

    async rechnungDateiRegistrieren(id, datei) {
      return kern.wiederholen(() =>
        db.transaction(async (tx) => {
          await sperreBeruehren(tx, `rechnung-datei:${id}`);
          const [row] = await tx
            .select({ id: finRechnungen.id })
            .from(finRechnungen)
            .where(eq(finRechnungen.id, id));
          if (!row) return 'fehlt' as const;
          const [vorhanden] = await tx
            .select({ id: finRechnungDateien.rechnungId })
            .from(finRechnungDateien)
            .where(eq(finRechnungDateien.rechnungId, id));
          if (vorhanden) return 'vorhanden' as const;
          await tx.insert(finRechnungDateien).values({
            rechnungId: id,
            sha256: datei.sha256,
            groesse: datei.groesse,
            erstelltAm: new Date(),
          });
          return 'ok' as const;
        }),
      );
    },
  };
}
