import { describe, expect, it } from 'vitest';
import {
  buchungEingabeSchema,
  buchungsHash,
  centZuEuroText,
  euroZuCent,
  GENESIS_HASH,
  kanonisch,
  kanonischJson,
  kontoAendernSchema,
  kontoEingabeSchema,
  pruefeBuchung,
  pruefeKette,
  stornoEingabeSchema,
  stornoZeilen,
  type BuchungZeileEingabe,
  type HashBuchung,
  type HashZeile,
  type KettenBuchung,
  type PruefKonto,
} from './finanzen';

const konten: PruefKonto[] = [
  { id: 'safe', name: 'Safe', stueckelung: true, archiviert: false },
  { id: 'bank', name: 'Bank', stueckelung: false, archiviert: false },
  { id: 'alt', name: 'Altkonto', stueckelung: false, archiviert: true },
  { id: 'aufwand', name: 'Aufwand', stueckelung: false, archiviert: false },
];

const zeile = (kontoId: string, betragCent: number, rest: Partial<BuchungZeileEingabe> = {}) =>
  ({
    kontoId,
    betragCent,
    stueckelung: null,
    nettoCent: null,
    steuerCent: null,
    steuersatz: null,
    steuerArt: 'keine',
    ...rest,
  }) satisfies BuchungZeileEingabe;

const fehler = (zeilen: BuchungZeileEingabe[]) => pruefeBuchung({ zeilen }, konten);

describe('pruefeBuchung', () => {
  it('accepts a balanced entry', () => {
    expect(fehler([zeile('bank', -500), zeile('aufwand', 500)])).toEqual([]);
  });

  it('needs at least two lines and a sum of 0', () => {
    expect(fehler([zeile('bank', 0)])).toContain('Eine Buchung braucht mindestens zwei Zeilen.');
    const f = fehler([zeile('bank', -500), zeile('aufwand', 400)]);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('geht nicht auf');
  });

  it('rejects unknown and archived accounts', () => {
    expect(fehler([zeile('nix', -5), zeile('aufwand', 5)])).toEqual([
      'Zeile 1: Das Konto gibt es nicht.',
    ]);
    expect(fehler([zeile('alt', -5), zeile('aufwand', 5)])).toEqual([
      'Zeile 1: Das Konto „Altkonto“ ist archiviert.',
    ]);
  });

  it('rejects a zero amount without denominations and amounts above the limit', () => {
    expect(fehler([zeile('bank', 0), zeile('aufwand', 0)])).toHaveLength(2);
    const gross = fehler([zeile('bank', -1_000_000_001), zeile('aufwand', 1_000_000_001)]);
    expect(gross).toHaveLength(2);
    expect(gross[0]).toContain('höchstens');
    expect(fehler([zeile('bank', -1_000_000_000), zeile('aufwand', 1_000_000_000)])).toEqual([]);
  });

  it('requires matching denominations on Stückelung accounts', () => {
    const ok = zeile('safe', 2500, {
      stueckelung: [
        { nennwertCent: 2000, anzahl: 1 },
        { nennwertCent: 500, anzahl: 1 },
      ],
    });
    expect(fehler([ok, zeile('bank', -2500)])).toEqual([]);
    // wrong sum
    const falsch = zeile('safe', 2500, { stueckelung: [{ nennwertCent: 2000, anzahl: 1 }] });
    expect(fehler([falsch, zeile('bank', -2500)])[0]).toContain('passt nicht zum Betrag');
    // missing
    expect(fehler([zeile('safe', 2500), zeile('bank', -2500)])).toEqual([
      'Zeile 1: Für das Konto „Safe“ brauchst du eine Stückelung.',
    ]);
    // not allowed on a plain account
    const unzulaessig = zeile('bank', -500, { stueckelung: [{ nennwertCent: 500, anzahl: -1 }] });
    expect(fehler([unzulaessig, zeile('aufwand', 500)])).toEqual([
      'Zeile 1: Das Konto „Bank“ hat keine Stückelung.',
    ]);
  });

  it('rejects invalid, duplicate and zero denominations', () => {
    const z = (stueckelung: { nennwertCent: number; anzahl: number }[], betrag: number) =>
      fehler([zeile('safe', betrag, { stueckelung }), zeile('bank', -betrag)]);
    expect(z([{ nennwertCent: 300, anzahl: 1 }], 300)[0]).toContain('nicht erlaubt');
    expect(
      z(
        [
          { nennwertCent: 100, anzahl: 1 },
          { nennwertCent: 100, anzahl: 1 },
        ],
        200,
      )[0],
    ).toContain('doppelt');
    expect(z([{ nennwertCent: 100, anzahl: 0 }], 0)[0]).toContain('Anzahl');
  });

  it('allows a Wechselzeile of amount 0 with denominations', () => {
    const wechsel = zeile('safe', 0, {
      stueckelung: [
        { nennwertCent: 500, anzahl: 4 },
        { nennwertCent: 1000, anzahl: -2 },
      ],
    });
    expect(fehler([wechsel, zeile('bank', 0)])).toEqual([
      'Zeile 2: Der Betrag darf nur bei einer Stückelung (Wechseln) 0 sein.',
    ]);
    const gegen = zeile('safe', 0, { stueckelung: [{ nennwertCent: 2000, anzahl: 0 }] });
    expect(fehler([wechsel, gegen]).join()).toContain('Anzahl');
    const ausgleich = zeile('safe', 0, {
      stueckelung: [
        { nennwertCent: 2000, anzahl: 1 },
        { nennwertCent: 1000, anzahl: -2 },
      ],
    });
    expect(fehler([wechsel, ausgleich])).toEqual([]);
  });

  it('checks the tax fields', () => {
    const ust = (netto: number, steuer: number) =>
      zeile('aufwand', 1190, {
        steuerArt: 'vorsteuer',
        nettoCent: netto,
        steuerCent: steuer,
        steuersatz: 1900,
      });
    expect(fehler([ust(1000, 190), zeile('bank', -1190)])).toEqual([]);
    expect(fehler([ust(1000, 180), zeile('bank', -1190)])).toEqual([
      'Zeile 1: Netto und Steuer ergeben nicht den Betrag.',
    ]);
    expect(
      fehler([
        zeile('aufwand', 1190, { steuerArt: 'ust', nettoCent: 1000 }),
        zeile('bank', -1190),
      ])[0],
    ).toContain('brauchst du Netto');
    expect(
      fehler([zeile('aufwand', 1190, { steuerCent: 190 }), zeile('bank', -1190)])[0],
    ).toContain('dürfen keine Steuerwerte');
  });
});

describe('schemas', () => {
  const schluessel = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';
  const basis = {
    idempotenzSchluessel: schluessel,
    datum: '2027-01-05',
    text: '  Einkauf  ',
    zeilen: [
      { kontoId: 'bank', betragCent: -500 },
      { kontoId: 'aufwand', betragCent: 500 },
    ],
  };

  it('parses a Buchung and fills defaults', () => {
    const r = buchungEingabeSchema.parse(basis);
    expect(r.text).toBe('Einkauf');
    expect(r.quelleTyp).toBe('manuell');
    expect(r.eventId).toBeNull();
    expect(r.zeilen[0]).toMatchObject({ steuerArt: 'keine', stueckelung: null, nettoCent: null });
  });

  it('rejects bad dates, fractional cents, one line and the storno type', () => {
    expect(buchungEingabeSchema.safeParse({ ...basis, datum: '2027-02-30' }).success).toBe(false);
    expect(buchungEingabeSchema.safeParse({ ...basis, datum: '5.1.2027' }).success).toBe(false);
    expect(
      buchungEingabeSchema.safeParse({
        ...basis,
        zeilen: [{ kontoId: 'bank', betragCent: 1.5 }, basis.zeilen[1]],
      }).success,
    ).toBe(false);
    expect(buchungEingabeSchema.safeParse({ ...basis, zeilen: [basis.zeilen[0]] }).success).toBe(
      false,
    );
    expect(buchungEingabeSchema.safeParse({ ...basis, quelleTyp: 'storno' }).success).toBe(false);
    expect(buchungEingabeSchema.safeParse({ ...basis, text: '  ' }).success).toBe(false);
  });

  it('parses Konto and Storno input', () => {
    const k = kontoEingabeSchema.parse({ name: 'Kasse', art: 'bargeld' });
    expect(k).toEqual({
      name: 'Kasse',
      art: 'bargeld',
      parentId: null,
      stueckelung: false,
      steuersatzStandard: null,
    });
    expect(kontoEingabeSchema.safeParse({ name: 'X', art: 'buch' }).success).toBe(false);
    // a partial change must not reset the other fields
    expect(kontoAendernSchema.parse({ name: 'Neu' })).toEqual({ name: 'Neu' });
    expect(kontoAendernSchema.parse({ parentId: null })).toEqual({ parentId: null });
    expect(kontoAendernSchema.safeParse({}).success).toBe(false);
    expect(kontoAendernSchema.safeParse({ steuersatzStandard: 12000 }).success).toBe(false);
    expect(
      stornoEingabeSchema.parse({
        idempotenzSchluessel: schluessel,
        datum: '2027-01-05',
        text: ' ',
      }),
    ).toEqual({ idempotenzSchluessel: schluessel, datum: '2027-01-05', text: null });
    // the key is required and must be a UUID
    expect(stornoEingabeSchema.safeParse({ datum: '2027-01-05' }).success).toBe(false);
    expect(buchungEingabeSchema.safeParse({ ...basis, idempotenzSchluessel: 'x' }).success).toBe(
      false,
    );
    expect(
      buchungEingabeSchema.safeParse({ ...basis, idempotenzSchluessel: undefined }).success,
    ).toBe(false);
  });
});

const hz = (
  pos: number,
  kontoId: string,
  betragCent: number,
  extra: Partial<HashZeile> = {},
): HashZeile => ({
  pos,
  kontoId,
  betragCent,
  nettoCent: null,
  steuerCent: null,
  steuersatz: null,
  steuerArt: 'keine',
  stueckelung: [],
  ...extra,
});

describe('stornoZeilen', () => {
  it('negates amounts, tax values and denomination counts and keeps pos', () => {
    const original = [
      hz(1, 'safe', 2500, { stueckelung: [{ nennwertCent: 500, anzahl: 5 }] }),
      hz(2, 'aufwand', -2500, {
        nettoCent: -2101,
        steuerCent: -399,
        steuersatz: 1900,
        steuerArt: 'vorsteuer',
      }),
      hz(3, 'safe', 0, { stueckelung: [{ nennwertCent: 100, anzahl: 0 }] }),
    ];
    const s = stornoZeilen(original);
    expect(s.map((z) => z.pos)).toEqual([1, 2, 3]);
    expect(s[0]).toMatchObject({
      betragCent: -2500,
      stueckelung: [{ nennwertCent: 500, anzahl: -5 }],
    });
    expect(s[1]).toMatchObject({
      betragCent: 2500,
      nettoCent: 2101,
      steuerCent: 399,
      steuersatz: 1900,
    });
    expect(Object.is(s[2]!.betragCent, 0)).toBe(true);
    expect(Object.is(s[2]!.stueckelung[0]!.anzahl, 0)).toBe(true);
    // original untouched, and a storno of a storno restores the amounts
    expect(original[0]!.betragCent).toBe(2500);
    expect(stornoZeilen(s)).toEqual(original);
  });
});

describe('kanonischJson', () => {
  it('sorts keys recursively and writes no whitespace', () => {
    expect(kanonischJson({ b: 1, a: { d: [3, { z: null, y: true }], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[3,{"y":true,"z":null}]},"b":1}',
    );
  });

  it('normalises strings to NFC', () => {
    const nfd = 'O\u0308'; // O + combining diaeresis
    expect(nfd).not.toBe('\u00d6');
    expect(kanonischJson(nfd)).toBe('"\u00d6"');
    expect(kanonischJson({ 'O\u0308': 'A\u030a' })).toBe('{"\u00d6":"\u00c5"}');
  });

  it('escapes like JSON.stringify and keeps other unicode literally', () => {
    expect(kanonischJson('a"b\\c\n\t\u0001')).toBe('"a\\"b\\\\c\\n\\t\\u0001"');
    expect(kanonischJson('€ 😀 ä')).toBe('"€ 😀 ä"');
  });

  it('accepts only safe integers, booleans, null and strings', () => {
    expect(kanonischJson([0, -0, -5, Number.MAX_SAFE_INTEGER])).toBe(
      `[0,0,-5,${Number.MAX_SAFE_INTEGER}]`,
    );
    expect(() => kanonischJson(1.5)).toThrow();
    expect(() => kanonischJson(Number.NaN)).toThrow();
    expect(() => kanonischJson(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(() => kanonischJson(undefined)).toThrow();
    expect(() => kanonischJson(10n)).toThrow();
  });
});

const buchung1: HashBuchung = {
  seq: 1,
  id: 'b-1',
  datum: '2027-01-01',
  text: 'Eröffnung',
  quelleTyp: 'eroeffnung',
  quelleId: null,
  eventId: null,
  stornoVon: null,
  erstelltVon: 'sub-a',
  erstelltAm: '2027-01-01T10:00:00.000Z',
  zeilen: [
    // given out of order on purpose: pos and nennwert are sorted by `kanonisch`
    hz(2, 'eroeffnung', -12550),
    hz(1, 'safe', 12550, {
      stueckelung: [
        { nennwertCent: 5000, anzahl: 2 },
        { nennwertCent: 50, anzahl: 1 },
        { nennwertCent: 500, anzahl: 1 },
        { nennwertCent: 2000, anzahl: 1 },
      ],
    }),
  ],
};

const buchung2: HashBuchung = {
  seq: 2,
  id: 'b-2',
  datum: '2027-01-02',
  text: 'Kauf',
  quelleTyp: 'manuell',
  quelleId: null,
  eventId: null,
  stornoVon: null,
  erstelltVon: 'sub-b',
  erstelltAm: '2027-01-02T08:30:15.123Z',
  zeilen: [
    hz(1, 'bank', -11900),
    hz(2, 'aufwand', 11900, {
      nettoCent: 10000,
      steuerCent: 1900,
      steuersatz: 1900,
      steuerArt: 'vorsteuer',
    }),
  ],
};

// Pinned test vectors: if one of these changes, the hash format changed and existing journals
// no longer verify. Cross-checked with an independent SHA-256 implementation.
const KANONISCH_1 =
  '{"belege":[],"datum":"2027-01-01","erstellt_am":"2027-01-01T10:00:00.000Z","erstellt_von":"sub-a","event_id":null,"id":"b-1","quelle_id":null,"quelle_typ":"eroeffnung","seq":1,"storno_von":null,"text":"Eröffnung","v":1,"zeilen":[{"betrag_cent":12550,"konto_id":"safe","netto_cent":null,"pos":1,"steuer_art":"keine","steuer_cent":null,"steuersatz":null,"stueckelung":[{"anzahl":1,"nennwert_cent":50},{"anzahl":1,"nennwert_cent":500},{"anzahl":1,"nennwert_cent":2000},{"anzahl":2,"nennwert_cent":5000}]},{"betrag_cent":-12550,"konto_id":"eroeffnung","netto_cent":null,"pos":2,"steuer_art":"keine","steuer_cent":null,"steuersatz":null,"stueckelung":[]}]}';
const HASH_1 = 'b793c46053220e30625e617241d37e478d90891d9fab068c3ff031e526849484';
const HASH_2 = '9f3fb5b928579b8e4538e95694b99aec5a2eb9934e0144fa9d7846b16fed9837';

describe('kanonisch und buchungsHash', () => {
  it('serialises an entry in the pinned canonical form', () => {
    expect(kanonisch(buchung1)).toBe(KANONISCH_1);
  });

  it('is independent of the order of lines and keys, and of Date vs ISO string', () => {
    const umgekehrt = {
      ...buchung1,
      zeilen: [...buchung1.zeilen].reverse(),
      erstelltAm: new Date('2027-01-01T10:00:00Z'),
    };
    expect(kanonisch(umgekehrt)).toBe(KANONISCH_1);
  });

  it('writes milliseconds of the creation time', () => {
    expect(kanonisch({ ...buchung1, erstelltAm: new Date('2027-01-01T10:00:00Z') })).toContain(
      '"erstellt_am":"2027-01-01T10:00:00.000Z"',
    );
  });

  it('hashes with fixed test vectors', async () => {
    expect(GENESIS_HASH).toBe('0'.repeat(64));
    expect(await buchungsHash(GENESIS_HASH, buchung1)).toBe(HASH_1);
    expect(await buchungsHash(HASH_1, buchung2)).toBe(HASH_2);
  });

  it('changes when any covered field or the predecessor changes', async () => {
    expect(await buchungsHash('1'.repeat(64), buchung1)).not.toBe(HASH_1);
    expect(await buchungsHash(GENESIS_HASH, { ...buchung1, text: 'Eroeffnung' })).not.toBe(HASH_1);
    expect(await buchungsHash(GENESIS_HASH, { ...buchung1, seq: 2 })).not.toBe(HASH_1);
    expect(await buchungsHash(GENESIS_HASH, { ...buchung1, stornoVon: 'x' })).not.toBe(HASH_1);
  });
});

describe('pruefeKette', () => {
  const kette = (): KettenBuchung[] => [
    { ...buchung1, prevHash: GENESIS_HASH, hash: HASH_1 },
    { ...buchung2, prevHash: HASH_1, hash: HASH_2 },
  ];

  it('accepts an intact chain and an empty one', async () => {
    expect(await pruefeKette(kette())).toEqual({
      anzahl: 2,
      kopfHash: HASH_2,
      letzteSeq: 2,
      fehler: [],
    });
    expect(await pruefeKette([])).toEqual({
      anzahl: 0,
      kopfHash: GENESIS_HASH,
      letzteSeq: 0,
      fehler: [],
    });
  });

  it('reports a gap in seq', async () => {
    const k = kette();
    k[1] = { ...k[1]!, seq: 3 };
    const r = await pruefeKette(k);
    expect(r.fehler).toContainEqual({ seq: 3, art: 'luecke' });
  });

  it('reports a chain that does not start at 1', async () => {
    const r = await pruefeKette([kette()[1]!]);
    expect(r.fehler).toContainEqual({ seq: 2, art: 'luecke' });
    expect(r.fehler).toContainEqual({ seq: 2, art: 'prev_hash' });
  });

  it('reports a manipulated amount as hash and sum error', async () => {
    const k = kette();
    k[0] = {
      ...k[0]!,
      zeilen: k[0]!.zeilen.map((z) => (z.pos === 2 ? { ...z, betragCent: -12000 } : z)),
    };
    const r = await pruefeKette(k);
    expect(r.fehler).toContainEqual({ seq: 1, art: 'hash' });
    expect(r.fehler).toContainEqual({ seq: 1, art: 'summe' });
    expect(r.fehler.filter((f) => f.seq === 2)).toEqual([]);
  });

  it('reports a wrong prev_hash only once', async () => {
    const k = kette();
    k[1] = { ...k[1]!, prevHash: '1'.repeat(64) };
    expect((await pruefeKette(k)).fehler).toEqual([{ seq: 2, art: 'prev_hash' }]);
  });

  it('reports a manipulated text of a consistent entry', async () => {
    const k = kette();
    k[1] = { ...k[1]!, text: 'Kauf!' };
    expect((await pruefeKette(k)).fehler).toEqual([{ seq: 2, art: 'hash' }]);
  });

  it('reports denominations that do not add up to the line amount', async () => {
    const k = kette();
    k[0] = {
      ...k[0]!,
      zeilen: k[0]!.zeilen.map((z) =>
        z.pos === 1 ? { ...z, stueckelung: [{ nennwertCent: 5000, anzahl: 1 }] } : z,
      ),
    };
    const arten = (await pruefeKette(k)).fehler.filter((f) => f.seq === 1).map((f) => f.art);
    expect(arten).toContain('stueckelung');
    expect(arten).toContain('hash');
  });
});

describe('euroZuCent und centZuEuroText', () => {
  it('parses German and plain amounts', () => {
    expect(euroZuCent('12,5')).toBe(1250);
    expect(euroZuCent('12,50 €')).toBe(1250);
    expect(euroZuCent('1.234,56')).toBe(123456);
    expect(euroZuCent('12.50')).toBe(1250);
    expect(euroZuCent('-3')).toBe(-300);
    expect(euroZuCent('+0,05')).toBe(5);
    expect(euroZuCent('1.234')).toBe(123400);
    expect(euroZuCent('0')).toBe(0);
    expect(euroZuCent(19.99)).toBe(1999);
    expect(euroZuCent(0.1 + 0.2)).toBe(30);
  });

  it('rejects garbage and more than two decimals', () => {
    for (const x of ['', 'abc', '1,234', '1,2,3', '--1', '12 EUR'])
      expect(euroZuCent(x)).toBeNull();
    expect(euroZuCent(Number.NaN)).toBeNull();
    expect(euroZuCent('-0')).toBe(0);
  });

  it('formats cents for an input field', () => {
    expect(centZuEuroText(1250)).toBe('12,50');
    expect(centZuEuroText(-5)).toBe('-0,05');
    expect(centZuEuroText(0)).toBe('0,00');
    expect(euroZuCent(centZuEuroText(-123456))).toBe(-123456);
  });
});
