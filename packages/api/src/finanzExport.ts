import {
  GENESIS_HASH,
  kanonisch,
  kanonischJson,
  monatAnzeigen,
  naechsterFestschreibbarerMonat,
} from '@c4/shared';
import type { UserAdmin } from './admin';
import { bestEffort, type Benachrichtigungen } from './benachrichtigungen';
import type { Finanzarchiv } from './finanzarchiv';
import type { FinanzenStore } from './finanzen';
import { datumBerlin } from './finanzenBelege';
import type { PostenStore } from './posten';
import { mitgliederMitRecht } from './privatpartyBenachrichtigungen';

/** From this day of the month on, the Finanzer:innen are reminded of an open Festschreibung. */
const ERINNERUNG_AB_TAG = 10;

/** ISO week of a date as `YYYY-Www` (the Thursday decides the year). */
export function isoWoche(datum: string): string {
  const donnerstag = new Date(`${datum}T00:00:00Z`);
  donnerstag.setUTCDate(donnerstag.getUTCDate() + 4 - (donnerstag.getUTCDay() || 7));
  const jahr = donnerstag.getUTCFullYear();
  const tag = Math.floor((donnerstag.getTime() - Date.UTC(jahr, 0, 1)) / 86_400_000);
  return `${jahr}-W${String(Math.floor(tag / 7) + 1).padStart(2, '0')}`;
}

/**
 * Daily export (docs/finanzen.md): all entries since the last export as canonical JSON lines to
 * `export/<date>.jsonl` (skipped without new entries) and the chain head to `anker/<date>.json`.
 */
export async function finanzExport(
  deps: {
    store: Pick<
      FinanzenStore,
      | 'kettenDaten'
      | 'letzterExportSeq'
      | 'exportEintragen'
      | 'festschreibungen'
      | 'fruehesteBuchung'
    >;
    archiv: Finanzarchiv;
    /** Without these, no Festschreibung reminder is sent. */
    benachrichtigungen?: Pick<Benachrichtigungen, 'senden'>;
    posten?: Pick<PostenStore, 'inhaberMitRecht'>;
    userAdmin?: Pick<UserAdmin, 'rollen'>;
  },
  jetzt: Date,
): Promise<{ neu: number; bisSeq: number }> {
  const datum = datumBerlin(jetzt);
  const vonSeq = await deps.store.letzterExportSeq();
  const daten = await deps.store.kettenDaten();
  const neue = daten.buchungen.filter((b) => b.seq > vonSeq);
  const letzte = daten.buchungen.at(-1);
  const bisSeq = letzte?.seq ?? 0;
  const kopfHash = letzte?.hash ?? GENESIS_HASH;
  if (neue.length > 0)
    await deps.archiv.exportSchreiben(
      `export/${datum}.jsonl`,
      neue
        .map(
          (b) =>
            kanonischJson({
              hash: b.hash,
              prev_hash: b.prevHash,
              buchung: JSON.parse(kanonisch(b)),
            }) + '\n',
        )
        .join(''),
    );
  const erstelltAm = jetzt.toISOString();
  const schluessel = `anker/${datum}.json`;
  await deps.archiv.exportSchreiben(
    schluessel,
    JSON.stringify({ bis_seq: bisSeq, kopf_hash: kopfHash, erstellt_am: erstelltAm }),
  );
  await deps.store.exportEintragen({
    datum,
    vonSeq,
    bisSeq,
    kopfHash,
    schluessel,
    erstelltAm: jetzt,
  });
  await festschreibungErinnern(deps, datum);
  return { neu: neue.length, bisSeq };
}

/**
 * From the 10th on: a push to everybody with `finanzen:verwalten` while a past month is not closed,
 * at most once per week (dedupe key). A failure never fails the export.
 */
async function festschreibungErinnern(
  deps: Parameters<typeof finanzExport>[0],
  heute: string,
): Promise<void> {
  const { benachrichtigungen, posten, userAdmin } = deps;
  if (!benachrichtigungen || !posten || !userAdmin) return;
  if (Number(heute.slice(8, 10)) < ERINNERUNG_AB_TAG) return;
  await bestEffort(async () => {
    const [eintraege, frueh] = await Promise.all([
      deps.store.festschreibungen(),
      deps.store.fruehesteBuchung(),
    ]);
    const monat = naechsterFestschreibbarerMonat({
      letzterFest:
        eintraege
          .map((f) => f.monat)
          .sort()
          .at(-1) ?? null,
      fruehesteBuchung: frueh,
      heuteBerlin: heute,
    });
    if (!monat) return;
    await benachrichtigungen.senden({
      subs: await mitgliederMitRecht({ posten, userAdmin }, 'finanzen:verwalten', heute),
      art: 'finanzen.festschreibung_faellig',
      titel: 'Festschreibung fällig',
      text: `Der Monat ${monatAnzeigen(monat)} ist noch nicht festgeschrieben.`,
      url: '/app/finanzen/festschreibung',
      dedupeSchluessel: `festschreibung-faellig:${monat.slice(0, 7)}:${isoWoche(heute)}`,
    });
  });
}
