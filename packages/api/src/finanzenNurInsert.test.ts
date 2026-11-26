import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard: the journal tables are insert-only. No production code may update or delete them.
const TABELLEN =
  'finBuchungen|finBuchungszeilen|finStueckelung|finZaehlungen|finZaehlungPosten|buchEintraege|buchTarife|buchAbrechnungen|buchSeitenVerlauf|finKassenzaehlungen|finKassenzaehlungPosten|finKassenabrechnungen|finKassenabrechnungPosten|finKassenabrechnungTransfers|finKassenabrechnungEvents|finBelege|finBelegposten|finBelegKorrekturen|finErstattungen|finErstattungBelege|finExporte|finFestschreibungen|finDatenexporte|finRechnungEinstellungen|finRechnungen|finRechnungsposten|finRechnungZahlungen|finRechnungDateien|warenAbgleichKorrekturen';
const SQL_TABELLEN =
  'fin_buchungen|fin_buchungszeilen|fin_stueckelung|fin_zaehlungen|fin_zaehlung_posten|buch_eintraege|buch_tarife|buch_abrechnungen|buch_seiten_verlauf|fin_kassenzaehlungen|fin_kassenzaehlung_posten|fin_kassenabrechnungen|fin_kassenabrechnung_posten|fin_kassenabrechnung_transfers|fin_kassenabrechnung_events|fin_belege|fin_belegposten|fin_beleg_korrekturen|fin_erstattungen|fin_erstattung_belege|fin_exporte|fin_festschreibungen|fin_datenexporte|fin_rechnung_einstellungen|fin_rechnungen|fin_rechnungsposten|fin_rechnung_zahlungen|fin_rechnung_dateien|waren_abgleich_korrekturen';

const MUSTER: RegExp[] = [
  new RegExp(`\\.(update|delete)\\(\\s*(${TABELLEN})\\b`, 'g'),
  new RegExp(`\\bUPDATE\\s+(${SQL_TABELLEN})\\b`, 'gi'),
  new RegExp(`\\bDELETE\\s+FROM\\s+(${SQL_TABELLEN})\\b`, 'gi'),
];

function treffer(text: string): string[] {
  return MUSTER.flatMap((m) => [...text.matchAll(m)].map((x) => x[0]));
}

function dateien(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const pfad = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'migrations' ? [] : dateien(pfad);
    if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts') || e.name.endsWith('.fake.ts')) {
      return [];
    }
    return [pfad];
  });
}

describe('Finanz-Journal ist insert-only', () => {
  it('kein Produktionscode ändert oder löscht Journaltabellen', () => {
    const funde = dateien(__dirname).flatMap((datei) =>
      treffer(readFileSync(datei, 'utf8')).map((t) => `${datei}: ${t}`),
    );
    expect(funde, `Update/Delete auf Journaltabellen gefunden:\n${funde.join('\n')}`).toEqual([]);
  });

  it('der Detektor erkennt Verstöße', () => {
    expect(treffer('await db.update(finBuchungen).set({})')).toHaveLength(1);
    expect(treffer('tx.delete(\n  finBuchungszeilen)')).toHaveLength(1);
    expect(treffer('db.update( finStueckelung )')).toHaveLength(1);
    expect(treffer('update Fin_Buchungen set x = 1')).toHaveLength(1);
    expect(treffer('DELETE   FROM fin_stueckelung')).toHaveLength(1);
    expect(treffer('db.update(finZaehlungen).set({})')).toHaveLength(1);
    expect(treffer('db.update(finKassenabrechnungen).set({})')).toHaveLength(1);
    expect(treffer('DELETE FROM fin_kassenzaehlungen')).toHaveLength(1);
    expect(treffer('db.update(finKassen).set({})')).toHaveLength(0);
    expect(treffer('db.update(finZaehler).set({})')).toHaveLength(0);
    expect(treffer('UPDATE fin_konten SET x = 1')).toHaveLength(0);
    expect(treffer('db.update(warenAbgleichKorrekturen).set({})')).toHaveLength(1);
    expect(treffer('DELETE FROM waren_abgleich_korrekturen')).toHaveLength(1);
    expect(treffer('db.update(einstellungen).set({})')).toHaveLength(0);
    expect(treffer('db.insert(finBuchungen).values({})')).toHaveLength(0);
  });
});
