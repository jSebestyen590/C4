import { z } from 'zod';
import type { SumupAuszahlungZeile, SumupTransaktion } from '@c4/shared';
import { createSecretLeser } from './secrets';

// SumUp REST client (Finanzen slice 7, see docs/finanzen.md („SumUp“)). The field names of the SumUp
// responses are not confirmed against real data yet, so the schemas are tolerant: an item that
// cannot be read is logged and skipped instead of failing the whole run.

const BASIS = 'https://api.sumup.com';
const SEITE_GROESSE = 100;
/** One run reads at most this many pages (Lambda time); the next run continues. */
export const SUMUP_MAX_SEITEN = 8;
const AUSZAHLUNG_LIMIT = 500;

/** A transaction as stored: the raw SumUp JSON travels along as text. */
export type SumupTransaktionRoh = SumupTransaktion & { roh: string };
export type SumupAuszahlungRoh = SumupAuszahlungZeile & { roh: string };

export interface SumupKonfig {
  apiKey: string;
  /** Empty = looked up via `/v0.1/me`. */
  merchantCode?: string | undefined;
}

/** Secret `c4-<env>-sumup`: API key, merchant code (optional) and the first day to import. */
export const sumupSecretSchema = z.object({
  apiKey: z.string().min(1),
  merchantCode: z.string().optional(),
  abDatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SumupSecret = z.output<typeof sumupSecretSchema>;

/** Reads (cached 5 minutes) the SumUp secret; undefined when unset, empty or incomplete. */
export const createSumupSecretLeser = (secretArn: string | undefined, region: string) =>
  createSecretLeser<SumupSecret>(secretArn, region, sumupSecretSchema, 'SumUp');

export interface SumupApi {
  /** Final transactions (SUCCESSFUL, REFUNDED) since `seit`, oldest first. */
  transaktionen(
    seit: Date,
  ): Promise<{ transaktionen: SumupTransaktionRoh[]; vollstaendig: boolean }>;
  /** Payout lines with a date in [von, bis] (`YYYY-MM-DD`). */
  auszahlungen(von: string, bis: string): Promise<SumupAuszahlungRoh[]>;
}

export interface SumupDeps {
  fetch?: typeof fetch;
}

const zahl = z.coerce.number();
const text = z.union([z.string(), z.number()]).transform(String);

const transaktionSchema = z
  .object({
    id: text,
    transaction_code: z.string().optional(),
    amount: zahl,
    currency: z.string().optional(),
    timestamp: z.string(),
    status: z.string(),
    type: z.string().optional(),
    tip_amount: zahl.optional(),
    user: z.string().nullish(),
    payment_type: z.string().nullish(),
  })
  .passthrough();

const auszahlungSchema = z
  .object({
    id: text,
    date: z.string(),
    type: z.string().optional(),
    amount: zahl,
    fee: zahl.optional(),
    currency: z.string().optional(),
    transaction_code: z.string().nullish(),
    reference: z.string().nullish(),
    status: z.string().optional(),
  })
  .passthrough();

const seiteSchema = z
  .object({
    items: z.array(z.unknown()).default([]),
    links: z
      .array(z.object({ rel: z.string().optional(), href: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

const cent = (euro: number) => Math.round(euro * 100);
const ENDZUSTAENDE = new Set(['SUCCESSFUL', 'REFUNDED']);
const ABZUG_TYPEN = new Set(['REFUND', 'CHARGE_BACK']);

/** Null when the item is no final EUR transaction or cannot be read (logged). */
export function transaktionAusItem(item: unknown): SumupTransaktionRoh | null {
  const p = transaktionSchema.safeParse(item);
  if (!p.success || Number.isNaN(Date.parse(p.data.timestamp))) {
    console.warn('SumUp transaction cannot be read', p.success ? 'timestamp' : p.error.issues[0]);
    return null;
  }
  const t = p.data;
  if (!ENDZUSTAENDE.has(t.status.toUpperCase())) return null;
  if (t.currency && t.currency.toUpperCase() !== 'EUR') {
    console.warn('SumUp transaction skipped: currency', t.currency);
    return null;
  }
  const typ = (t.type ?? 'PAYMENT').toUpperCase();
  const betrag = cent(Math.abs(t.amount));
  return {
    id: t.id,
    transactionCode: t.transaction_code ?? t.id,
    zeitpunkt: new Date(t.timestamp).toISOString(),
    betragCent: ABZUG_TYPEN.has(typ) ? -betrag : betrag,
    typ,
    status: t.status.toUpperCase(),
    trinkgeldCent: cent(t.tip_amount ?? 0),
    sumupBenutzer: t.user ?? null,
    roh: JSON.stringify(item),
  };
}

export function auszahlungAusItem(item: unknown): SumupAuszahlungRoh | null {
  const p = auszahlungSchema.safeParse(item);
  if (!p.success || !/^\d{4}-\d{2}-\d{2}/.test(p.data.date)) {
    console.warn('SumUp payout cannot be read', p.success ? 'date' : p.error.issues[0]);
    return null;
  }
  const a = p.data;
  if (a.currency && a.currency.toUpperCase() !== 'EUR') {
    console.warn('SumUp payout skipped: currency', a.currency);
    return null;
  }
  return {
    id: a.id,
    datum: a.date.slice(0, 10),
    typ: (a.type ?? 'PAYOUT').toUpperCase(),
    betragCent: cent(a.amount),
    // ASSUMPTION: SumUp reports the held back fee as a positive number.
    gebuehrCent: Math.abs(cent(a.fee ?? 0)),
    transactionCode: a.transaction_code ?? null,
    referenz: a.reference ?? null,
    status: (a.status ?? '').toUpperCase(),
    roh: JSON.stringify(item),
  };
}

export function createSumup(konfig: SumupKonfig, deps: SumupDeps = {}): SumupApi {
  const http = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let merchantCode = konfig.merchantCode?.trim() || undefined;

  const holen = async (url: string): Promise<unknown> => {
    const res = await http(url, {
      headers: { Authorization: `Bearer ${konfig.apiKey}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`SumUp answered ${res.status}`);
    return res.json();
  };

  const haendler = async (): Promise<string> => {
    if (merchantCode) return merchantCode;
    const me = (await holen(`${BASIS}/v0.1/me`)) as {
      merchant_profile?: { merchant_code?: unknown };
    } | null;
    const code = me?.merchant_profile?.merchant_code;
    if (typeof code !== 'string' || !code) throw new Error('SumUp: merchant code not found');
    merchantCode = code;
    return code;
  };

  return {
    async transaktionen(seit) {
      const code = await haendler();
      const wurzel = `${BASIS}/v2.1/merchants/${encodeURIComponent(code)}/transactions/history`;
      let url: string | null =
        `${wurzel}?oldest_time=${encodeURIComponent(seit.toISOString())}&limit=${SEITE_GROESSE}&order=ascending`;
      const ergebnis: SumupTransaktionRoh[] = [];
      let seiten = 0;
      while (url) {
        if (seiten >= SUMUP_MAX_SEITEN) return { transaktionen: ergebnis, vollstaendig: false };
        seiten += 1;
        const seite = seiteSchema.parse(await holen(url));
        for (const item of seite.items) {
          const t = transaktionAusItem(item);
          if (t) ergebnis.push(t);
        }
        const href = seite.links?.find((l) => l.rel === 'next')?.href;
        url = null;
        if (href && seite.items.length > 0) {
          // SumUp sends a bare query string ("limit=100&oldest_ref=…", no "?"); a path or URL also works.
          const naechste = new URL(/^(\/|\?|https?:)/.test(href) ? href : `?${href}`, wurzel);
          if (naechste.origin === BASIS) url = naechste.toString();
        }
      }
      return { transaktionen: ergebnis, vollstaendig: true };
    },
    async auszahlungen(von, bis) {
      const code = await haendler();
      const url =
        `${BASIS}/v1.0/merchants/${encodeURIComponent(code)}/payouts` +
        `?start_date=${von}&end_date=${bis}&format=json&limit=${AUSZAHLUNG_LIMIT}`;
      const antwort = await holen(url);
      const liste = Array.isArray(antwort)
        ? antwort
        : (seiteSchema.safeParse(antwort).data?.items ?? []);
      return liste.flatMap((i) => auszahlungAusItem(i) ?? []);
    },
  };
}
