import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import {
  DATENEXPORT_TABELLEN,
  beschreibungTxt,
  datumAnzeigen,
  indexXml,
  tabelleAlsCsv,
  type DatenexportAuftrag,
  GDPDU_DTD,
  GDPDU_DTD_NAME,
} from '@c4/shared';
import { bestEffort, type Benachrichtigungen } from './benachrichtigungen';
import type { Finanzarchiv } from './finanzarchiv';
import type { FinanzenStore } from './finanzen';

/** fflate writes no Zip64: a ZIP (and each file in it) must stay below 4 GiB. */
export const ZIP_MAX_BYTES = 3.9 * 1024 ** 3;

const URL_SEITE = '/app/finanzen/datenexport';

export interface DatenexportJobDeps {
  store: Pick<FinanzenStore, 'datenexportDaten' | 'datenexportEintragen'>;
  archiv: Pick<Finanzarchiv, 'lesenStream' | 'streamSchreiben'>;
  benachrichtigungen: Pick<Benachrichtigungen, 'senden'>;
  /** Display name of the requester for `beschreibung.txt`. */
  erstellerName: (sub: string) => Promise<string>;
}

/**
 * Asynchronous Datenexport with Beleg files (docs/finanzen.md "Datenexport"): builds the ZIP as a
 * stream (CSV/XML/TXT compressed, Beleg files stored as they are, one at a time) straight into a
 * multipart upload to the archive, so memory stays small however large the ZIP gets. The requester
 * gets a push when it is done or has failed; a missing Beleg file fails the whole export.
 */
export async function datenexportMitBelegdateien(
  deps: DatenexportJobDeps,
  auftrag: Pick<DatenexportAuftrag, 'id' | 'von' | 'bis' | 'sub'>,
  jetzt: Date,
): Promise<{ ok: boolean; id: string; fehler?: string }> {
  const { id, von, bis, sub } = auftrag;
  const zeitraum = `${datumAnzeigen(von)}–${datumAnzeigen(bis)}`;
  const senden = (titel: string, text: string) =>
    bestEffort(() =>
      deps.benachrichtigungen.senden({
        subs: [sub],
        art: 'finanzen.datenexport_fertig',
        titel,
        text,
        url: URL_SEITE,
      }),
    );
  try {
    const stempel = jetzt.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    const schluessel = `datenexport/${stempel}-${von}-${bis}.zip`;
    const sha256 = await zipSchreiben(deps, { von, bis, sub, jetzt, schluessel });
    await deps.store.datenexportEintragen({
      id,
      von,
      bis,
      schluessel,
      sha256,
      erstelltVon: sub,
      erstelltAm: jetzt,
      mitBelegdateien: true,
    });
    await senden('Datenexport fertig', `Dein Datenexport ${zeitraum} mit Belegdateien ist fertig.`);
    return { ok: true, id };
  } catch (e) {
    console.error('Datenexport mit Belegdateien fehlgeschlagen', e);
    await senden(
      'Datenexport fehlgeschlagen',
      `Der Datenexport ${zeitraum} mit Belegdateien ist fehlgeschlagen.${
        e instanceof ExportFehler ? ` ${e.message}` : ''
      }`,
    );
    return { ok: false, id, fehler: e instanceof Error ? e.message : String(e) };
  }
}

/** An error whose message is meant for the requester. */
class ExportFehler extends Error {}

async function zipSchreiben(
  deps: DatenexportJobDeps,
  p: { von: string; bis: string; sub: string; jetzt: Date; schluessel: string },
): Promise<string> {
  const [rohdaten, ersteller] = await Promise.all([
    deps.store.datenexportDaten(p.von, p.bis),
    deps.erstellerName(p.sub),
  ]);
  const daten = {
    ...rohdaten,
    belege: rohdaten.belege.map((b) => ({ ...b, dateiPfad: b.dateiSchluessel })),
    rechnungen: rohdaten.rechnungen.map((r) => ({ ...r, dateiPfad: r.dateiSchluessel })),
  };
  // Every file once, even when several Belege share it (same content = same SHA-256).
  const dateien = new Map<string, { sha256: string; bezeichnung: string }>();
  for (const b of daten.belege)
    if (b.dateiSchluessel && b.dateiSha256 && !dateien.has(b.dateiSchluessel))
      dateien.set(b.dateiSchluessel, { sha256: b.dateiSha256, bezeichnung: `Beleg ${b.nummer}` });
  for (const r of daten.rechnungen)
    if (r.dateiSchluessel && r.dateiSha256 && !dateien.has(r.dateiSchluessel))
      dateien.set(r.dateiSchluessel, {
        sha256: r.dateiSha256,
        bezeichnung: `Rechnung ${r.nummer}`,
      });

  const out = new PassThrough();
  const hash = createHash('sha256');
  let gesamt = 0;
  let abbruch: Error | undefined;
  const abbrechen = (e: Error) => {
    abbruch ??= e;
    out.destroy(e);
  };
  const zip = new Zip((err, chunk, final) => {
    if (err) return abbrechen(err);
    if (out.destroyed) return;
    gesamt += chunk.length;
    if (gesamt > ZIP_MAX_BYTES)
      return abbrechen(
        new ExportFehler('Der Export ist zu groß (über 4 GB). Wähle einen kürzeren Zeitraum.'),
      );
    hash.update(chunk);
    out.write(chunk);
    if (final) out.end();
  });
  /** Waits until the upload has taken what was written (backpressure), fails when it died. */
  const abfluss = () =>
    new Promise<void>((resolve, reject) => {
      if (abbruch) return reject(abbruch);
      if (!out.writableNeedDrain) return resolve();
      const aufraeumen = () => {
        out.off('drain', ok);
        out.off('close', zu);
        out.off('error', zu);
      };
      const ok = () => {
        aufraeumen();
        resolve();
      };
      const zu = (e?: Error) => {
        aufraeumen();
        reject(abbruch ?? e ?? new Error('Der Upload ins Archiv wurde abgebrochen.'));
      };
      out.once('drain', ok);
      out.once('close', zu);
      out.once('error', zu);
    });
  const text = async (name: string, inhalt: string) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(inhalt), true);
    await abfluss();
  };

  const upload = deps.archiv.streamSchreiben(p.schluessel, out, 'application/zip');
  upload.catch(() => {}); // Reported below; avoids an unhandled rejection while the ZIP is built.
  try {
    for (const t of DATENEXPORT_TABELLEN) await text(t.datei, tabelleAlsCsv(t, daten));
    await text('index.xml', indexXml(DATENEXPORT_TABELLEN, 'C4 Leipzig'));
    await text(GDPDU_DTD_NAME, GDPDU_DTD);
    await text(
      'beschreibung.txt',
      beschreibungTxt({
        von: p.von,
        bis: p.bis,
        erstelltVon: ersteller,
        erstelltAm: p.jetzt.toISOString(),
        mitBelegdateien: true,
      }),
    );
    for (const [schluessel, d] of [...dateien].sort(([a], [b]) => (a < b ? -1 : 1)))
      await belegdatei(deps, zip, abfluss, schluessel, d);
    zip.end();
    await abfluss();
    await upload;
  } catch (e) {
    out.destroy();
    throw abbruch ?? e;
  }
  return hash.digest('hex');
}

/** Streams one Beleg file from the archive into the ZIP (stored, not compressed) and checks its SHA-256. */
async function belegdatei(
  deps: DatenexportJobDeps,
  zip: Zip,
  abfluss: () => Promise<void>,
  schluessel: string,
  d: { sha256: string; bezeichnung: string },
): Promise<void> {
  const fehlt = (grund: string) => new ExportFehler(`Die Datei von ${d.bezeichnung} ${grund}.`);
  let quelle;
  try {
    quelle = await deps.archiv.lesenStream(schluessel);
  } catch (e) {
    console.error(`Belegdatei ${schluessel} nicht lesbar`, e);
    throw fehlt('fehlt im Archiv');
  }
  const datei = new ZipPassThrough(schluessel);
  zip.add(datei);
  const pruefsumme = createHash('sha256');
  try {
    for await (const chunk of quelle as AsyncIterable<Uint8Array>) {
      pruefsumme.update(chunk);
      datei.push(chunk, false);
      await abfluss();
    }
  } catch (e) {
    if (e instanceof ExportFehler) throw e;
    console.error(`Belegdatei ${schluessel} nicht lesbar`, e);
    throw fehlt('konnte nicht vollständig gelesen werden');
  }
  datei.push(new Uint8Array(0), true);
  await abfluss();
  if (pruefsumme.digest('hex') !== d.sha256)
    throw fehlt('stimmt nicht mit ihrer Prüfsumme überein');
}
