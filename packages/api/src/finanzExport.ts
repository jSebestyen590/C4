import { GENESIS_HASH, kanonisch, kanonischJson } from '@c4/shared';
import type { Finanzarchiv } from './finanzarchiv';
import type { FinanzenStore } from './finanzen';
import { datumBerlin } from './finanzenBelege';

/**
 * Daily export (docs/finanzen.md): all entries since the last export as canonical JSON lines to
 * `export/<date>.jsonl` (skipped without new entries) and the chain head to `anker/<date>.json`.
 */
export async function finanzExport(
  deps: {
    store: Pick<FinanzenStore, 'kettenDaten' | 'letzterExportSeq' | 'exportEintragen'>;
    archiv: Finanzarchiv;
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
  return { neu: neue.length, bisSeq };
}
