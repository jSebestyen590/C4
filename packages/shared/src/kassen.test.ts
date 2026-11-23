import { describe, expect, it } from 'vitest';
import { pruefeBestand, stueckelungSumme, type BestandKonto } from './bargeld';
import { pruefeBuchung, type PruefKonto } from './finanzen';
import {
  berechneKassenabrechnung,
  eventEinnahmenVorschlag,
  eventKassenEinnahme,
  eventKassenSumme,
  kassenabrechnungEingabeSchema,
  kasseKontenFehler,
  MUENZROLLE,
  nachschubVorschlag,
  nettoSteuer,
  pruefeKassenTransfers,
  rollenText,
  transferVorschlag,
  type KassenRechnungEingabe,
} from './kassen';

const st = (...p: [number, number][]) =>
  p.map(([nennwertCent, anzahl]) => ({ nennwertCent, anzahl }));

describe('MUENZROLLE', () => {
  it('hat die Euro-Standardgrößen, Scheine ohne Rolle', () => {
    expect(MUENZROLLE[1]).toBe(50);
    expect(MUENZROLLE[10]).toBe(40);
    expect(MUENZROLLE[200]).toBe(25);
    expect(MUENZROLLE[500]).toBeUndefined();
    expect(rollenText(100, 25)).toBe('1 Rolle (25 Stück)');
    expect(rollenText(100, 50)).toBe('2 Rollen (50 Stück)');
    expect(rollenText(100, 20)).toBe('20 Stück');
    expect(rollenText(500, 5)).toBe('5 Stück');
  });
});

describe('eventEinnahmenVorschlag', () => {
  const z = (eventId: string, summeCent: number, gezaehltAm: string, eventBeginn: string) => ({
    eventId,
    zaehlungId: `z-${eventId}-${gezaehltAm}`,
    summeCent,
    gezaehltAm,
    eventBeginn,
  });
  it('rechnet Differenzen der Zählungen ab dem Soll, nach Event-Beginn sortiert', () => {
    const v = eventEinnahmenVorschlag(10000, [
      z('e2', 19000, '2027-01-12T01:00:00Z', '2027-01-12T18:00:00Z'),
      z('e1', 15000, '2027-01-05T01:00:00Z', '2027-01-05T18:00:00Z'),
    ]);
    expect(v.map((x) => [x.eventId, x.betragCent])).toEqual([
      ['e1', 5000],
      ['e2', 4000],
    ]);
  });
  it('nimmt je Event die neueste Zählung', () => {
    const v = eventEinnahmenVorschlag(0, [
      z('e1', 1000, '2027-01-05T01:00:00Z', '2027-01-05T18:00:00Z'),
      z('e1', 5000, '2027-01-05T02:00:00Z', '2027-01-05T18:00:00Z'),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]!.betragCent).toBe(5000);
  });
  it('ohne Zählungen gibt es keinen Vorschlag', () => {
    expect(eventEinnahmenVorschlag(500, [])).toEqual([]);
  });
});

describe('transferVorschlag', () => {
  it('führt den Überschuss ab und füllt aus dem Ziel-Fach auf', () => {
    const v = transferVorschlag(st([100, 40], [200, 2]), st([100, 30], [200, 5]), st([200, 10]));
    expect(v.transfer).toEqual(st([100, 10], [200, -3]));
    expect(v.fehlbestand).toEqual([]);
  });
  it('begrenzt durch das Ziel-Fach und meldet den Fehlbestand (30/10/10)', () => {
    const v = transferVorschlag(st([100, 10]), st([100, 30]), st([100, 10]));
    expect(v.transfer).toEqual(st([100, -10]));
    expect(v.fehlbestand).toEqual(st([100, 10]));
  });
});

describe('nachschubVorschlag', () => {
  const faecher = [
    { fachId: 'klein', name: 'Kleingeld', bestand: st([100, 3]) },
    { fachId: 'tresor', name: 'Tresor', bestand: st([100, 100], [200, 20]) },
  ];
  it('wählt das erste Fach mit genug und rundet auf ganze Rollen', () => {
    const v = nachschubVorschlag(st([100, 10]), faecher);
    expect(v).toEqual([
      { nennwertCent: 100, fachId: 'tresor', anzahl: 25, rollen: 1, ganzeRolle: true },
    ]);
  });
  it('liefert höchstens den Bestand, wenn keine ganze Rolle da ist', () => {
    const v = nachschubVorschlag(st([200, 10]), faecher);
    expect(v).toEqual([
      { nennwertCent: 200, fachId: 'tresor', anzahl: 20, rollen: null, ganzeRolle: false },
    ]);
  });
  it('schlägt nichts vor, wenn kein Fach genug hat', () => {
    expect(nachschubVorschlag(st([50, 10]), faecher)).toEqual([]);
  });
  it('Scheine gibt es nicht in Rollen', () => {
    const v = nachschubVorschlag(st([500, 3]), [{ fachId: 't', name: 'T', bestand: st([500, 9]) }]);
    expect(v[0]).toMatchObject({ anzahl: 3, ganzeRolle: false, rollen: null });
  });
});

describe('nettoSteuer', () => {
  it('trennt Netto und Steuer, mit Vorzeichen', () => {
    expect(nettoSteuer(11900, 1900)).toEqual({ nettoCent: 10000, steuerCent: 1900 });
    expect(nettoSteuer(-11900, 1900)).toEqual({ nettoCent: -10000, steuerCent: -1900 });
    expect(nettoSteuer(500, 0)).toEqual({ nettoCent: 500, steuerCent: 0 });
  });
});

describe('berechneKassenabrechnung', () => {
  const basis: KassenRechnungEingabe = {
    kasse: { id: 'kasse', name: 'Bar' },
    bestand: st([100, 30], [500, 2]),
    grundbestand: st([100, 30], [500, 2]),
    ist: st([100, 30], [500, 2]),
    transfers: [],
    erloesKonto: { id: 'erloes', steuersatz: 1900 },
    zielFachId: 'zaehlbrett',
    events: [],
  };
  const rechne = (extra: Partial<KassenRechnungEingabe>) =>
    berechneKassenabrechnung({ ...basis, ...extra });
  const summe = (zeilen: { betragCent: number }[]) => zeilen.reduce((s, z) => s + z.betragCent, 0);

  it('Ist = Soll und kein Transfer: keine Zeilen', () => {
    const r = rechne({});
    expect(r.zeilen).toEqual([]);
    expect(r.einnahmeCent).toBe(0);
    expect(r.warnungen).toEqual(['Seit der letzten Abrechnung gibt es keine Dienst-Zählung.']);
  });

  it('Beispiel 100/50/40: Einnahme 100 €, Fehler 10 €', () => {
    const r = rechne({
      ist: st([100, 30], [500, 2], [5000, 2]),
      events: [
        { betragCent: 5000, zaehlungId: 'z1' },
        { betragCent: 4000, zaehlungId: 'z2' },
      ],
      transfers: [{ fachId: 'zaehlbrett', nennwertCent: 5000, anzahl: 2 }],
    });
    expect(r.einnahmeCent).toBe(10000);
    expect(r.eventSummeCent).toBe(9000);
    expect(r.fehlerCent).toBe(1000);
    expect(r.warnungen).toContain('Abweichung zur letzten Dienst-Zählung: +10,00 €.');
  });

  it('bucht Kasse, Erlös mit Steuer, Transfer; Zeilen summieren auf 0, Stückelung = Betrag', () => {
    const r = rechne({
      ist: st([100, 30], [500, 2], [5000, 2], [2000, 1]),
      transfers: [
        { fachId: 'zaehlbrett', nennwertCent: 5000, anzahl: 2 },
        { fachId: 'zaehlbrett', nennwertCent: 2000, anzahl: 1 },
      ],
    });
    expect(r.einnahmeCent).toBe(12000);
    expect(r.transferCent).toBe(12000);
    expect(summe(r.zeilen)).toBe(0);
    for (const z of r.zeilen) {
      if (z.stueckelung.length > 0) expect(stueckelungSumme(z.stueckelung)).toBe(z.betragCent);
    }
    const erloes = r.zeilen.find((z) => z.kontoId === 'erloes')!;
    expect(erloes).toMatchObject({
      betragCent: -12000,
      steuerArt: 'ust',
      steuersatz: 1900,
      nettoCent: -10084,
      steuerCent: -1916,
    });
    expect(r.zeilen.find((z) => z.kontoId === 'zaehlbrett')!.betragCent).toBe(12000);
    expect(r.posten.find((p) => p.nennwertCent === 5000)!.danach).toBe(0);
    expect(r.warnungen.some((w) => w.includes('Grundbestand'))).toBe(false);
  });

  it('Erlöskonto ohne Steuersatz bucht ohne Steuer', () => {
    const r = rechne({
      ist: st([100, 31], [500, 2]),
      erloesKonto: { id: 'erloes', steuersatz: null },
    });
    expect(r.zeilen.find((z) => z.kontoId === 'erloes')).toMatchObject({
      betragCent: -100,
      steuerArt: 'keine',
      nettoCent: null,
    });
  });

  it('Einnahme darf negativ sein und warnt', () => {
    const r = rechne({ ist: st([100, 20], [500, 2]) });
    expect(r.einnahmeCent).toBe(-1000);
    expect(r.zeilen.find((z) => z.kontoId === 'erloes')!.betragCent).toBe(1000);
    expect(summe(r.zeilen)).toBe(0);
    expect(r.warnungen.some((w) => w.startsWith('Die Einnahme ist negativ'))).toBe(true);
  });

  it('nur andere Stückelung bei gleichem Betrag: Kasse umgestellt ohne Erlös', () => {
    const r = rechne({
      ist: st([100, 20], [500, 2], [1000, 1]),
      grundbestand: st([100, 20], [500, 2], [1000, 1]),
    });
    expect(r.einnahmeCent).toBe(0);
    expect(r.zeilen.every((z) => z.kontoId === 'kasse')).toBe(true);
    expect(r.zeilen).toHaveLength(2);
    expect(summe(r.zeilen)).toBe(0);
  });

  it('Fehlbestand mit Rolle: 25 ins Zählbrett, 20 in die Kasse, Zählbrett danach 15', () => {
    // Grundbestand 30 x 1 €, Ist 10, Zählbrett hat 10 x 1 €; Rolle (25) aus dem Tresor.
    const bestand = st([100, 10], [500, 2]);
    const r = rechne({
      bestand,
      ist: bestand,
      grundbestand: st([100, 30], [500, 2]),
      transfers: [
        { fachId: 'zaehlbrett', nennwertCent: 100, anzahl: -20 },
        { fachId: 'tresor', nennwertCent: 100, anzahl: -25 },
      ],
    });
    const faecher: BestandKonto[] = [
      {
        id: 'kasse',
        name: 'Bar',
        art: 'bargeld',
        stueckelung: true,
        saldoCent: 1000 + 1000,
        anzahl: new Map([
          [100, 10],
          [500, 2],
        ]),
      },
      {
        id: 'zaehlbrett',
        name: 'Zählbrett',
        art: 'bargeld',
        stueckelung: true,
        saldoCent: 1000,
        anzahl: new Map([[100, 10]]),
      },
      {
        id: 'tresor',
        name: 'Tresor',
        art: 'bargeld',
        stueckelung: true,
        saldoCent: 10000,
        anzahl: new Map([[100, 100]]),
      },
    ];
    expect(pruefeBestand(r.zeilen, faecher)).toEqual([]);
    const nach = (id: string) => {
      const f = faecher.find((x) => x.id === id)!;
      const a = new Map(f.anzahl);
      for (const z of r.zeilen.filter((x) => x.kontoId === id))
        for (const s of z.stueckelung)
          a.set(s.nennwertCent, (a.get(s.nennwertCent) ?? 0) + s.anzahl);
      return a;
    };
    expect(nach('zaehlbrett').get(100)).toBe(15);
    expect(nach('kasse').get(100)).toBe(30);
    expect(nach('tresor').get(100)).toBe(75);
    expect(summe(r.zeilen)).toBe(0);
    expect(r.posten.find((p) => p.nennwertCent === 100)!.danach).toBe(30);
    expect(r.warnungen.some((w) => w.includes('Grundbestand'))).toBe(false);
  });

  it('Rest ohne Nachschub: Warnung, der Grundbestand bleibt unverändert', () => {
    const r = rechne({
      bestand: st([100, 10]),
      ist: st([100, 10]),
      grundbestand: st([100, 30]),
      transfers: [{ fachId: 'zaehlbrett', nennwertCent: 100, anzahl: -10 }],
    });
    expect(r.posten.find((p) => p.nennwertCent === 100)).toMatchObject({
      grundbestand: 30,
      danach: 20,
    });
    expect(r.warnungen).toContain(
      'Die Kasse geht nicht mit dem Grundbestand raus – 1,00 €: 20 statt 30.',
    );
  });

  it('das Ziel-Fach ohne genug Bestand fällt in der Bestandsregel auf', () => {
    const r = rechne({
      bestand: st([100, 10]),
      ist: st([100, 10]),
      transfers: [{ fachId: 'zaehlbrett', nennwertCent: 100, anzahl: -20 }],
    });
    const fehler = pruefeBestand(r.zeilen, [
      {
        id: 'kasse',
        name: 'Bar',
        art: 'bargeld',
        stueckelung: true,
        saldoCent: 1000,
        anzahl: new Map([[100, 10]]),
      },
      {
        id: 'zaehlbrett',
        name: 'Zählbrett',
        art: 'bargeld',
        stueckelung: true,
        saldoCent: 1000,
        anzahl: new Map([[100, 10]]),
      },
    ]);
    expect(fehler).toEqual(['Im Fach „Zählbrett“ sind nur 10 × 1,00 € vorhanden.']);
  });

  it('die Zeilen bestehen pruefeBuchung', () => {
    const r = rechne({
      ist: st([100, 30], [500, 2], [5000, 1]),
      transfers: [{ fachId: 'zaehlbrett', nennwertCent: 5000, anzahl: 1 }],
    });
    const konten: PruefKonto[] = ['kasse', 'erloes', 'zaehlbrett'].map((id) => ({
      id,
      name: id,
      stueckelung: id !== 'erloes',
      archiviert: false,
    }));
    expect(pruefeBuchung({ zeilen: r.zeilen }, konten)).toEqual([]);
  });
});

describe('Regeln und Schemas', () => {
  it('prüft die Standardkonten einer Kasse', () => {
    const erloes = {
      id: 'e',
      name: 'Getränke',
      art: 'erloes' as const,
      stueckelung: false,
      archiviert: false,
    };
    const fach = {
      id: 'z',
      name: 'Zählbrett',
      art: 'bargeld' as const,
      stueckelung: true,
      archiviert: false,
    };
    expect(kasseKontenFehler(erloes, fach, 'k')).toEqual([]);
    expect(kasseKontenFehler({ ...erloes, art: 'aufwand' }, fach, 'k')).toEqual([
      'Das Konto „Getränke“ ist kein Erlöskonto.',
    ]);
    expect(kasseKontenFehler(erloes, { ...fach, id: 'k' }, 'k')).toEqual([
      'Das Ziel-Fach muss ein anderes Fach als die Kasse sein.',
    ]);
    expect(kasseKontenFehler(erloes, undefined, null)).toEqual(['Das Ziel-Fach gibt es nicht.']);
  });

  it('Nachschub nur mit negativer Anzahl', () => {
    expect(
      pruefeKassenTransfers([{ fachId: 't', nennwertCent: 100, anzahl: 25 }], 'z', 'k'),
    ).toEqual(['Nachschub aus einem Fach ist nur mit einer negativen Anzahl möglich.']);
    expect(
      pruefeKassenTransfers([{ fachId: 'z', nennwertCent: 100, anzahl: 25 }], 'z', 'k'),
    ).toEqual([]);
  });

  it('das Abrechnungs-Schema füllt Listen und lehnt doppelte Events ab', () => {
    const basis = {
      idempotenzSchluessel: crypto.randomUUID(),
      kontoId: 'k',
      datum: '2027-01-10',
      ist: [{ nennwertCent: 100, anzahl: 3 }],
      erloesKontoId: 'e',
      zielFachId: 'z',
    };
    const ok = kassenabrechnungEingabeSchema.parse(basis);
    expect(ok.transfers).toEqual([]);
    expect(ok.events).toEqual([]);
    expect(
      kassenabrechnungEingabeSchema.safeParse({
        ...basis,
        events: [
          { eventId: 'e1', betragCent: 1 },
          { eventId: 'e1', betragCent: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      kassenabrechnungEingabeSchema.safeParse({
        ...basis,
        transfers: [{ fachId: 'z', nennwertCent: 100, anzahl: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe('Einnahme eines Events je Kasse', () => {
  const z = (eventId: string, summeCent: number, tag: number) => ({
    eventId,
    zaehlungId: `z-${eventId}`,
    summeCent,
    gezaehltAm: `2027-01-0${tag}T01:00:00Z`,
    eventBeginn: `2027-01-0${tag}T18:00:00Z`,
  });
  it('ist vorläufig der Vorschlag der Abrechnung (Differenz zur Zählung davor, Start mit dem Soll)', () => {
    const zaehlungen = [z('e1', 9000, 1), z('e2', 13000, 2)];
    expect(
      eventKassenEinnahme({ eventId: 'e1', sollCent: 4000, zaehlungen, abgerechnetCent: null }),
    ).toEqual({
      einnahmeCent: 5000,
      status: 'vorlaeufig',
    });
    expect(
      eventKassenEinnahme({ eventId: 'e2', sollCent: 4000, zaehlungen, abgerechnetCent: null }),
    ).toEqual({
      einnahmeCent: 4000,
      status: 'vorlaeufig',
    });
  });
  it('ist nach der Abrechnung der gebuchte Betrag', () => {
    expect(
      eventKassenEinnahme({
        eventId: 'e1',
        sollCent: 0,
        zaehlungen: [z('e1', 9000, 1)],
        abgerechnetCent: 4500,
      }),
    ).toEqual({ einnahmeCent: 4500, status: 'abgerechnet' });
  });
  it('ohne Zählung und Abrechnung gibt es nichts', () => {
    expect(
      eventKassenEinnahme({
        eventId: 'e9',
        sollCent: 0,
        zaehlungen: [z('e1', 1, 1)],
        abgerechnetCent: null,
      }),
    ).toEqual({
      einnahmeCent: null,
      status: null,
    });
  });
  it('die Summe ist unvollständig, solange eine zugewiesene Kasse fehlt', () => {
    expect(
      eventKassenSumme([
        { zugewiesen: true, einnahmeCent: 5000 },
        { zugewiesen: true, einnahmeCent: null },
        { zugewiesen: false, einnahmeCent: 300 },
      ]),
    ).toEqual({ summeCent: 5300, unvollstaendig: true });
    expect(
      eventKassenSumme([
        { zugewiesen: true, einnahmeCent: 1 },
        { zugewiesen: false, einnahmeCent: null },
      ]),
    ).toEqual({
      summeCent: 1,
      unvollstaendig: false,
    });
    expect(eventKassenSumme([])).toEqual({ summeCent: 0, unvollstaendig: false });
  });
});
