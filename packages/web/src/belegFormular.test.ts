import { describe, expect, it } from 'vitest';
import {
  anzahlLesen,
  anzahlText,
  bezahltCent,
  datenZuFormular,
  dateiTypVon,
  formularFehler,
  formularSumme,
  formularZuDaten,
  groesseText,
  hatInhalt,
  hexVon,
  leeresFormular,
  mengenAus,
  pfandJeSatz,
  neuerPosten,
  satzText,
  steuersatzVorschlag,
  stueckelungAus,
  stueckelungHinweis,
  verwendeteSaetze,
  type BelegFormular,
} from './belegFormular';

const voll = (): BelegFormular => ({
  ...leeresFormular(),
  rechnungsstellerId: 'r1',
  belegdatum: '2027-03-01',
  posten: [{ ...neuerPosten(1900), kategorieId: 'k1', anzahl: '2', einzelpreisCent: 500 }],
  zahlweg: 'bar',
  bezahldatum: '2027-03-01',
  fachId: 'f1',
  gegeben: { 1000: 1 },
  wechselgeld: {},
  eigenbeleg: true,
  eigenbelegBegruendung: 'Kassenbon verloren',
});

describe('anzahlLesen / anzahlText', () => {
  it('liest Dezimalkomma und Punkt in Tausendstel', () => {
    expect(anzahlLesen('1,5')).toBe(1500);
    expect(anzahlLesen('2')).toBe(2000);
    expect(anzahlLesen('0,125')).toBe(125);
    expect(anzahlLesen('-1')).toBe(-1000);
    expect(anzahlLesen('1.5')).toBe(1500);
  });
  it('lehnt Ungültiges ab', () => {
    expect(anzahlLesen('')).toBeNull();
    expect(anzahlLesen('abc')).toBeNull();
    expect(anzahlLesen('1,2345')).toBeNull();
  });
  it('formatiert ohne überflüssige Nullen', () => {
    expect(anzahlText(1500)).toBe('1,5');
    expect(anzahlText(1000)).toBe('1');
    expect(anzahlText(125)).toBe('0,125');
  });
});

describe('satzText und Vorschlag', () => {
  it('zeigt Prozent', () => {
    expect(satzText(1900)).toBe('19 %');
    expect(satzText(700)).toBe('7 %');
  });
  it('schlägt nur angebotene Sätze vor', () => {
    expect(steuersatzVorschlag({ steuersatzStandard: 700 })).toBe(700);
    expect(steuersatzVorschlag({ steuersatzStandard: 1600 })).toBeNull();
    expect(steuersatzVorschlag({ steuersatzStandard: null })).toBeNull();
    expect(steuersatzVorschlag(undefined)).toBeNull();
  });
});

describe('Stückelung mit Vorzeichen', () => {
  it('bucht Gegebenes negativ und Wechselgeld positiv', () => {
    expect(stueckelungAus({ 1000: 1 }, { 100: 2, 50: 1 })).toEqual([
      { nennwertCent: 50, anzahl: 1 },
      { nennwertCent: 100, anzahl: 2 },
      { nennwertCent: 1000, anzahl: -1 },
    ]);
  });
  it('verrechnet denselben Nennwert in beiden Spalten', () => {
    expect(stueckelungAus({ 100: 3 }, { 100: 1 })).toEqual([{ nennwertCent: 100, anzahl: -2 }]);
    expect(stueckelungAus({ 100: 1 }, { 100: 1 })).toEqual([]);
  });
  it('teilt zurück in die zwei Spalten', () => {
    const m = mengenAus([
      { nennwertCent: 1000, anzahl: -1 },
      { nennwertCent: 100, anzahl: 2 },
    ]);
    expect(m.gegeben).toEqual({ 1000: 1 });
    expect(m.wechselgeld).toEqual({ 100: 2 });
  });
  it('rechnet den bezahlten Betrag', () => {
    expect(bezahltCent({ 1000: 1 }, { 100: 2 })).toBe(800);
  });
  it('meldet, was fehlt oder zu viel ist', () => {
    expect(stueckelungHinweis(1000, {}, {})).toBeNull();
    expect(stueckelungHinweis(1000, { 1000: 1 }, {})).toBeNull();
    expect(stueckelungHinweis(1000, { 500: 1 }, {})).toContain('fehlen');
    expect(stueckelungHinweis(1000, { 2000: 1 }, {})).toContain('zu viel');
  });
});

describe('formularZuDaten', () => {
  it('übernimmt Zahlweg bar mit Fach und Stückelung', () => {
    const d = formularZuDaten(voll());
    expect(d.posten).toEqual([
      {
        art: 'kategorie',
        kategorieId: 'k1',
        text: '',
        anzahlMilli: 2000,
        einzelpreisCent: 500,
        steuersatz: 1900,
      },
    ]);
    expect(d.zahlweg).toBe('bar');
    expect(d.fachId).toBe('f1');
    expect(d.stueckelung).toEqual([{ nennwertCent: 1000, anzahl: -1 }]);
    expect(d.mitgliedId).toBeNull();
    expect(d.eigenbelegBegruendung).toBe('Kassenbon verloren');
  });
  it('lässt Felder anderer Zahlwege weg', () => {
    const d = formularZuDaten({ ...voll(), zahlweg: 'auslage', mitgliedId: 'm1' });
    expect(d.fachId).toBeNull();
    expect(d.stueckelung).toEqual([]);
    expect(d.bezahldatum).toBeNull();
    expect(d.mitgliedId).toBe('m1');
  });
  it('verwirft die Begründung, sobald eine Datei da ist', () => {
    const datei = {
      sha256: 'a'.repeat(64),
      schluessel: 'x',
      typ: 'application/pdf' as const,
      name: 'a.pdf',
    };
    expect(formularZuDaten({ ...voll(), datei }).eigenbelegBegruendung).toBeNull();
  });
  it('speichert Korrekturen nur bei Netto und ohne Nullen', () => {
    const f = {
      ...voll(),
      korrekturen: {
        1900: { nettoCent: 1, steuerCent: null },
        700: { nettoCent: 0, steuerCent: 0 },
      },
    };
    expect(formularZuDaten(f).korrekturen).toEqual([]);
    expect(formularZuDaten({ ...f, modus: 'netto' }).korrekturen).toEqual([
      { steuersatz: 1900, nettoCent: 1, steuerCent: 0 },
    ]);
  });
  it('macht aus leeren Feldern null bzw. 0', () => {
    const d = formularZuDaten(leeresFormular());
    expect(d.belegdatum).toBeNull();
    expect(d.posten[0]!.einzelpreisCent).toBe(0);
    expect(d.zahlweg).toBeNull();
  });
});

describe('datenZuFormular', () => {
  it('ist die Umkehrung von formularZuDaten', () => {
    const d = formularZuDaten(voll());
    const f = datenZuFormular(d);
    expect(formularZuDaten(f)).toEqual(d);
    expect(f.eigenbeleg).toBe(true);
    expect(f.gegeben).toEqual({ 1000: 1 });
  });
  it('legt für einen leeren Entwurf eine Postenzeile an', () => {
    expect(datenZuFormular(formularZuDaten(leeresFormular())).posten).toHaveLength(1);
  });
});

describe('Ware, Leergut und Einreichung', () => {
  const lager = (): BelegFormular => ({
    ...voll(),
    posten: [
      {
        ...neuerPosten(700),
        art: 'ware',
        wareId: 'w1',
        gebindeId: 'g1',
        kategorieId: 'k1',
        anzahl: '2',
        einzelpreisCent: 1000,
        pfandCent: 300,
      },
      { ...neuerPosten(700), art: 'leergut', text: 'Leergut', anzahl: '1', einzelpreisCent: -600 },
      { ...neuerPosten(1900), kategorieId: 'k2', einzelpreisCent: 100 },
    ],
    eingereichtBetragCent: 1234,
    rechnungsstellerName: ' Getränke Müller ',
    notiz: ' Bon liegt bei ',
  });

  it('trägt Ware- und Leergut-Posten in die Daten', () => {
    const d = formularZuDaten(lager());
    expect(d.posten[0]).toEqual({
      art: 'ware',
      wareId: 'w1',
      gebindeId: 'g1',
      kategorieId: 'k1',
      text: '',
      anzahlMilli: 2000,
      einzelpreisCent: 1000,
      steuersatz: 700,
      pfandCent: 300,
    });
    expect(d.posten[1]).toEqual({
      art: 'leergut',
      text: 'Leergut',
      anzahlMilli: 1000,
      einzelpreisCent: -600,
      steuersatz: 700,
    });
    expect(d.posten[2]!.art).toBe('kategorie');
  });
  it('trägt Betrag, Name und Notiz ohne Verlust', () => {
    const d = formularZuDaten(lager());
    expect(d.eingereichtBetragCent).toBe(1234);
    expect(d.rechnungsstellerName).toBe('Getränke Müller');
    expect(d.notiz).toBe('Bon liegt bei');
  });
  it('ist über Laden und Speichern verlustfrei', () => {
    const d = formularZuDaten(lager());
    const f = datenZuFormular(d);
    expect(formularZuDaten(f)).toEqual(d);
    expect(f.posten[0]).toMatchObject({
      art: 'ware',
      wareId: 'w1',
      pfandCent: 300,
    });
    expect(f.notiz).toBe('Bon liegt bei');
  });
  it('rechnet das Pfand je Steuersatz mit', () => {
    const b = formularSumme(lager());
    expect(b.pfandBetraege[0]).toBe(600);
    expect(b.summe).toBe(2000 + 600 - 600 + 100);
  });
  it('summiert das Pfand je Steuersatz', () => {
    const f = lager();
    const b = formularSumme(f);
    expect(pfandJeSatz(f.posten, b.pfandBetraege)).toEqual({ 700: 600 });
  });
  it('verlangt Ware, Gebinde und Leergut-Text', () => {
    const f = lager();
    f.posten[0] = { ...f.posten[0]!, wareId: null };
    f.posten[1] = { ...f.posten[1]!, text: '' };
    const m = formularFehler(f)
      .map((x) => x.meldung)
      .join(' ');
    expect(m).toContain('Bitte wähle eine Ware');
    expect(m).toContain('Bitte beschreibe das Leergut');
  });
  it('zählt eine Ware-Zeile als Inhalt', () => {
    const f = { ...leeresFormular(), posten: [{ ...neuerPosten(), art: 'ware' as const }] };
    expect(hatInhalt(f)).toBe(true);
  });
});

describe('formularFehler', () => {
  it('lässt einen vollständigen Beleg durch', () => {
    const f = { ...voll(), gegeben: { 1000: 1 } };
    expect(formularFehler(f)).toEqual([]);
  });
  it('verlangt Rechnungssteller, Datum, Datei oder Begründung', () => {
    const felder = formularFehler(leeresFormular()).map((x) => x.feld);
    expect(felder).toEqual(
      expect.arrayContaining(['rechnungssteller', 'belegdatum', 'datei', 'zahlweg']),
    );
  });
  it('meldet eine unlesbare Anzahl und einen fehlenden Preis', () => {
    const f = voll();
    f.posten = [{ ...f.posten[0]!, anzahl: 'x', einzelpreisCent: null }];
    const m = formularFehler(f)
      .map((x) => x.meldung)
      .join('\n');
    expect(m).toContain('Anzahl');
    expect(m).toContain('Einzelpreis');
  });
  it('prüft die Stückelung gegen die Summe', () => {
    const f = { ...voll(), gegeben: { 500: 1 } };
    expect(formularFehler(f).some((x) => x.feld === 'stueckelung')).toBe(true);
  });
});

describe('Summen und Sätze', () => {
  it('rechnet brutto je Steuersatz', () => {
    const s = formularSumme(voll());
    expect(s.summe).toBe(1000);
    expect(s.jeSteuersatz.find((g) => g.satz === 1900)!.steuer).toBe(160);
  });
  it('listet die verwendeten Sätze absteigend', () => {
    const f = { ...voll(), posten: [neuerPosten(700), neuerPosten(1900), neuerPosten(700)] };
    expect(verwendeteSaetze(f)).toEqual([1900, 700]);
  });
});

describe('hatInhalt', () => {
  it('zählt ein vorbelegtes Formular nicht als Inhalt', () => {
    expect(hatInhalt(leeresFormular())).toBe(false);
    expect(hatInhalt({ ...leeresFormular(), rechnungsstellerId: 'r1' })).toBe(false);
  });
  it('erkennt Datum, Posten und Datei', () => {
    expect(hatInhalt({ ...leeresFormular(), belegdatum: '2027-01-01' })).toBe(true);
    expect(hatInhalt(voll())).toBe(true);
  });
});

describe('Datei', () => {
  it('erkennt den Typ am Typ oder an der Endung', () => {
    expect(dateiTypVon({ type: 'application/pdf', name: 'a' })).toBe('application/pdf');
    expect(dateiTypVon({ type: '', name: 'IMG_1.HEIC' })).toBe('image/heic');
    expect(dateiTypVon({ type: 'image/heif', name: 'x' })).toBe('image/heic');
    expect(dateiTypVon({ type: '', name: 'foto.jpeg' })).toBe('image/jpeg');
    expect(dateiTypVon({ type: 'text/plain', name: 'a.txt' })).toBeNull();
  });
  it('bildet Hex ab', () => {
    expect(hexVon(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });
  it('kürzt Größen', () => {
    expect(groesseText(500)).toBe('500 B');
    expect(groesseText(2048)).toBe('2 KB');
    expect(groesseText(1.5 * 1024 * 1024)).toBe('1,5 MB');
  });
});
