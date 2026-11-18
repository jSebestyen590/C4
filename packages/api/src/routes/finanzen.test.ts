import { describe, expect, it } from 'vitest';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('finanzen', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  /** v may read, r may check the chain; admin (a) has all four Finanzen rights. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'r', 'v', 'm2']) {
      await t.mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: null,
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
    }
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['finanzen:lesen' as const] : sub === 'r' ? ['finanzen:pruefen' as const] : [],
    );
    const roh = (token: string, method: string, pfad: string, body?: unknown) =>
      t.app.request(`/api/finanzen${pfad}`, json(token, method, body));
    // Bookings and reversals need an idempotency key; tests get a fresh one unless they bring their own.
    const anfrage = (token: string, method: string, pfad: string, body?: unknown) =>
      roh(
        token,
        method,
        pfad,
        method === 'POST' &&
          (pfad === '/buchungen' || pfad === '/zaehlungen' || pfad.endsWith('/storno')) &&
          body &&
          typeof body === 'object' &&
          !('idempotenzSchluessel' in body)
          ? { idempotenzSchluessel: crypto.randomUUID(), ...body }
          : body,
      );
    const buchen = (body: Record<string, unknown>, token = 'admin-token') =>
      anfrage(token, 'POST', '/buchungen', body);
    /** Moves `betragCent` from the Bank to the Geldtransit. */
    const umbuchung = (betragCent = 500, extra: Record<string, unknown> = {}) =>
      buchen({
        datum: '2027-01-05',
        text: 'Umbuchung',
        quelleTyp: 'umbuchung',
        zeilen: [
          { kontoId: 'geldtransit', betragCent },
          { kontoId: 'bank', betragCent: -betragCent },
        ],
        ...extra,
      });
    const lesen = async <T>(token: string, pfad: string) =>
      (await (await anfrage(token, 'GET', pfad)).json()) as T;
    /** Creates a Fach (Stückelung account below the Safe) and returns its id. */
    const fach = async (name = 'Wechselgeld') => {
      const res = await anfrage('admin-token', 'POST', '/konten', {
        name,
        art: 'bargeld',
        stueckelung: true,
        parentId: 'safe',
      });
      return ((await res.json()) as { id: string }).id;
    };
    /** Puts a Stückelung into a Fach (opening booking). */
    const befuellen = async (kontoId: string, stueckelung: [number, number][]) => {
      const betragCent = stueckelung.reduce((sum, [n, a]) => sum + n * a, 0);
      return buchen({
        datum: '2027-01-02',
        text: 'Anfangsbestand',
        quelleTyp: 'umbuchung',
        zeilen: [
          { kontoId: 'eroeffnung', betragCent: -betragCent },
          {
            kontoId,
            betragCent,
            stueckelung: stueckelung.map(([nennwertCent, anzahl]) => ({ nennwertCent, anzahl })),
          },
        ],
      });
    };
    return { ...t, anfrage, roh, buchen, umbuchung, lesen, fach, befuellen };
  }

  it('requires the matching right on every route', async () => {
    const t = await setup();
    const routen: [string, string, string][] = [
      ['GET', '/konten', 'finanzen:lesen'],
      ['POST', '/konten', 'finanzen:verwalten'],
      ['PUT', '/konten/safe', 'finanzen:verwalten'],
      ['PUT', '/konten/safe/archiv', 'finanzen:verwalten'],
      ['GET', '/buchungen', 'finanzen:lesen'],
      ['GET', '/buchungen/x', 'finanzen:lesen'],
      ['POST', '/buchungen', 'finanzen:buchen'],
      ['POST', '/buchungen/x/storno', 'finanzen:buchen'],
      ['GET', '/kette', 'finanzen:pruefen'],
    ];
    for (const [method, pfad] of routen) {
      for (const token of ['member-token', 'reader-token']) {
        if (token === 'reader-token' && pfad === '/kette') continue; // r holds finanzen:pruefen
        const res = await t.anfrage(token, method, pfad, method === 'GET' ? undefined : {});
        expect(res.status, `${method} ${pfad} ${token}`).toBe(403);
      }
    }
    // Lesen alone neither books, manages nor checks.
    expect((await t.anfrage('vorstand-token', 'GET', '/konten')).status).toBe(200);
    expect((await t.anfrage('vorstand-token', 'POST', '/buchungen', {})).status).toBe(403);
    expect((await t.anfrage('vorstand-token', 'POST', '/konten', {})).status).toBe(403);
    expect((await t.anfrage('vorstand-token', 'GET', '/kette')).status).toBe(403);
    expect((await t.anfrage('reader-token', 'GET', '/kette')).status).toBe(200);
    expect((await t.anfrage('reader-token', 'GET', '/konten')).status).toBe(403);
  });

  it('lists the base accounts with balance and manages the chart of accounts', async () => {
    const t = await setup();
    type K = {
      id: string;
      name: string;
      saldoCent: number;
      archiviert: boolean;
      parentId: string | null;
    };
    const konten = await t.lesen<K[]>('vorstand-token', '/konten');
    expect(konten.map((k) => k.id).sort()).toEqual([
      'bank',
      'eroeffnung',
      'geldtransit',
      'kassendifferenz',
      'safe',
    ]);
    expect(konten.every((k) => k.saldoCent === 0)).toBe(true);

    const neu = await t.anfrage('admin-token', 'POST', '/konten', {
      name: 'Getränke',
      art: 'erloes',
      steuersatzStandard: 1900,
    });
    expect(neu.status).toBe(201);
    const { id } = (await neu.json()) as { id: string };
    const unter = await t.anfrage('admin-token', 'POST', '/konten', {
      name: 'Bier',
      art: 'erloes',
      parentId: id,
    });
    expect(unter.status).toBe(201);
    const { id: unterId } = (await unter.json()) as { id: string };

    // a partial change leaves the other fields alone
    expect(
      (await t.anfrage('admin-token', 'PUT', `/konten/${id}`, { name: 'Getränke 19' })).status,
    ).toBe(200);
    const nachher = (
      await t.lesen<(K & { steuersatzStandard: number })[]>('vorstand-token', '/konten')
    ).find((k) => k.id === id);
    expect(nachher).toMatchObject({
      name: 'Getränke 19',
      steuersatzStandard: 1900,
      parentId: null,
    });

    // unknown parent, itself, cycle, empty body, unknown id
    expect(
      (
        await t.anfrage('admin-token', 'POST', '/konten', {
          name: 'X',
          art: 'neutral',
          parentId: 'nix',
        })
      ).status,
    ).toBe(400);
    expect((await t.anfrage('admin-token', 'PUT', `/konten/${id}`, { parentId: id })).status).toBe(
      400,
    );
    expect(
      (await t.anfrage('admin-token', 'PUT', `/konten/${id}`, { parentId: unterId })).status,
    ).toBe(400);
    expect((await t.anfrage('admin-token', 'PUT', `/konten/${id}`, {})).status).toBe(400);
    expect((await t.anfrage('admin-token', 'PUT', '/konten/nix', { name: 'X' })).status).toBe(404);
    expect(
      (await t.anfrage('admin-token', 'PUT', '/konten/nix/archiv', { archiviert: true })).status,
    ).toBe(404);
    expect(
      (await t.anfrage('admin-token', 'POST', '/konten', { name: 'X', art: 'buch' })).status,
    ).toBe(400);

    // archive and reactivate
    expect(
      (await t.anfrage('admin-token', 'PUT', `/konten/${unterId}/archiv`, { archiviert: true }))
        .status,
    ).toBe(200);
    expect((await t.lesen<K[]>('vorstand-token', '/konten')).some((k) => k.id === unterId)).toBe(
      false,
    );
    const alle = await t.lesen<K[]>('vorstand-token', '/konten?archiviert=1');
    expect(alle.find((k) => k.id === unterId)?.archiviert).toBe(true);
  });

  it('refuses to change art, Stückelung and parent once an account has lines', async () => {
    const t = await setup();
    expect((await t.umbuchung()).status).toBe(201);
    const aendern = (body: unknown) => t.anfrage('admin-token', 'PUT', '/konten/bank', body);
    expect((await aendern({ art: 'neutral' })).status).toBe(409);
    expect((await aendern({ stueckelung: true })).status).toBe(409);
    expect((await aendern({ parentId: 'safe' })).status).toBe(409);
    // unchanged values and name/tax rate stay possible
    expect((await aendern({ art: 'bank', name: 'Bank neu', steuersatzStandard: 700 })).status).toBe(
      200,
    );
  });

  it('books, shows the entry in the journal and moves the balances', async () => {
    const t = await setup();
    const res = await t.umbuchung(500);
    expect(res.status).toBe(201);
    const ergebnis = (await res.json()) as { id: string; seq: number };
    expect(ergebnis.seq).toBe(1);
    expect((await (await t.umbuchung(250)).json()) as { seq: number }).toMatchObject({ seq: 2 });

    const saldo = async (id: string) =>
      (await t.lesen<{ id: string; saldoCent: number }[]>('vorstand-token', '/konten')).find(
        (k) => k.id === id,
      )?.saldoCent;
    expect(await saldo('geldtransit')).toBe(750);
    expect(await saldo('bank')).toBe(-750);

    const seite = await t.lesen<{
      buchungen: {
        id: string;
        seq: number;
        betragCent: number;
        erstelltVon: { username: string; sub: string } | null;
      }[];
      gekappt: boolean;
    }>('vorstand-token', '/buchungen');
    expect(seite.gekappt).toBe(false);
    expect(seite.buchungen.map((b) => b.seq)).toEqual([2, 1]);
    expect(seite.buchungen[1]).toMatchObject({
      id: ergebnis.id,
      betragCent: 500,
      text: 'Umbuchung',
      datum: '2027-01-05',
      quelleTyp: 'umbuchung',
      stornoVon: null,
      storniertDurch: null,
      erstelltVon: { sub: 'a', username: 'user-a', status: 'anwaerter' },
    });

    const detail = await t.lesen<{
      zeilen: { pos: number; kontoName: string; betragCent: number }[];
      hash: string;
      prevHash: string;
    }>('vorstand-token', `/buchungen/${ergebnis.id}`);
    expect(detail.prevHash).toBe('0'.repeat(64));
    expect(detail.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.zeilen.map((z) => [z.pos, z.kontoName, z.betragCent])).toEqual([
      [1, 'Geldtransit', 500],
      [2, 'Bank (Fyrst)', -500],
    ]);
    expect((await t.anfrage('vorstand-token', 'GET', '/buchungen/nix')).status).toBe(404);
  });

  it('filters the journal and returns all matches', async () => {
    const t = await setup();
    await t.umbuchung(100, { datum: '2027-01-01' });
    await t.umbuchung(200, { datum: '2027-02-01' });
    const f = await t.fach();
    await t.buchen({
      datum: '2027-03-01',
      text: 'Eröffnung',
      zeilen: [
        { kontoId: 'eroeffnung', betragCent: -1000 },
        {
          kontoId: f,
          betragCent: 1000,
          stueckelung: [{ nennwertCent: 1000, anzahl: 1 }],
        },
      ],
    });
    const seqs = async (abfrage: string) =>
      (
        await t.lesen<{ buchungen: { seq: number }[] }>('vorstand-token', `/buchungen${abfrage}`)
      ).buchungen.map((b) => b.seq);
    expect(await seqs('')).toEqual([3, 2, 1]);
    expect(await seqs(`?kontoId=${f}`)).toEqual([3]);
    expect(await seqs('?kontoId=bank')).toEqual([2, 1]);
    expect(await seqs('?von=2027-02-01')).toEqual([3, 2]);
    expect(await seqs('?von=2027-01-15&bis=2027-02-15')).toEqual([2]);
    expect(await seqs('?limit=2&vorSeq=2')).toEqual([3, 2, 1]);
    expect((await t.anfrage('vorstand-token', 'GET', '/buchungen?von=kaputt')).status).toBe(400);
  });

  it('shows the direction of money and the running balance per account', async () => {
    const t = await setup();
    await t.umbuchung(100, { datum: '2027-01-01' });
    await t.umbuchung(250, { datum: '2027-02-01' });
    type Eintrag = {
      seq: number;
      abgang: { kontoId: string; kontoName: string; betragCent: number }[];
      zugang: { kontoId: string; kontoName: string; betragCent: number }[];
      konto: { betragCent: number; saldoNachCent: number } | null;
    };
    const alle = await t.lesen<{ buchungen: Eintrag[] }>('vorstand-token', '/buchungen');
    expect(alle.buchungen[0]!.abgang).toEqual([
      { kontoId: 'bank', kontoName: 'Bank (Fyrst)', betragCent: 250 },
    ]);
    expect(alle.buchungen[0]!.zugang).toEqual([
      { kontoId: 'geldtransit', kontoName: 'Geldtransit', betragCent: 250 },
    ]);
    expect(alle.buchungen.map((b) => b.konto)).toEqual([null, null]);
    // Account statement: the balance follows `seq`, not the display order.
    const konto = await t.lesen<{ buchungen: Eintrag[] }>(
      'vorstand-token',
      '/buchungen?kontoId=bank',
    );
    expect(konto.buchungen.map((b) => b.konto)).toEqual([
      { betragCent: -250, saldoNachCent: -350 },
      { betragCent: -100, saldoNachCent: -100 },
    ]);
    const gefiltert = await t.lesen<{ buchungen: Eintrag[] }>(
      'vorstand-token',
      '/buchungen?kontoId=bank&von=2027-02-01',
    );
    expect(gefiltert.buchungen.map((b) => b.konto?.saldoNachCent)).toEqual([-350]);
  });

  it('keeps the running balance right when other bookings are filtered out', async () => {
    const t = await setup();
    await t.umbuchung(100, { datum: '2027-03-01' });
    await t.umbuchung(200, { datum: '2027-01-01' });
    await t.umbuchung(300, { datum: '2027-03-02' });
    const res = await t.lesen<{
      buchungen: { seq: number; konto: { saldoNachCent: number } | null }[];
    }>('vorstand-token', '/buchungen?kontoId=bank&von=2027-03-01');
    expect(res.buchungen.map((b) => [b.seq, b.konto?.saldoNachCent])).toEqual([
      [3, -600],
      [1, -100],
    ]);
  });

  it('filters the journal to Stornos and the bookings they reversed', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(100, { datum: '2027-01-01' })).json()) as {
      id: string;
    };
    await t.umbuchung(200, { datum: '2027-01-02' });
    await t.umbuchung(300, { datum: '2027-02-01' });
    await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-02-02',
      text: 'Falsch',
    });
    const seqs = async (abfrage: string) =>
      (
        await t.lesen<{ buchungen: { seq: number }[] }>('vorstand-token', `/buchungen${abfrage}`)
      ).buchungen.map((b) => b.seq);
    expect(await seqs('')).toEqual([4, 3, 2, 1]);
    expect(await seqs('?storno=1')).toEqual([4, 1]);
    expect(await seqs('?storno=0')).toEqual([4, 3, 2, 1]);
    expect(await seqs('?storno=1&von=2027-02-01')).toEqual([4]);
    expect(await seqs('?storno=1&kontoId=bank&bis=2027-01-31')).toEqual([1]);
    expect((await t.anfrage('vorstand-token', 'GET', '/buchungen?storno=x')).status).toBe(400);
  });

  it('rejects invalid bookings with 400 and German messages', async () => {
    const t = await setup();
    const fehler = async (body: Record<string, unknown>) => {
      const res = await t.buchen(body);
      expect(res.status).toBe(400);
      return res.text();
    };
    const basis = { datum: '2027-01-05', text: 'Test' };
    expect(
      await fehler({
        ...basis,
        zeilen: [
          { kontoId: 'bank', betragCent: -500 },
          { kontoId: 'geldtransit', betragCent: 400 },
        ],
      }),
    ).toContain('geht nicht auf');
    expect(
      await fehler({
        ...basis,
        zeilen: [
          { kontoId: 'bank', betragCent: -500 },
          { kontoId: 'nix', betragCent: 500 },
        ],
      }),
    ).toContain('Das Konto gibt es nicht');
    expect(
      await fehler({
        ...basis,
        zeilen: [
          { kontoId: await t.fach(), betragCent: 500 },
          { kontoId: 'bank', betragCent: -500 },
        ],
      }),
    ).toContain('Stückelung');
    expect(await fehler({ ...basis, zeilen: [{ kontoId: 'bank', betragCent: 0 }] })).toContain(
      'mindestens zwei',
    );
    expect(
      await fehler({
        ...basis,
        zeilen: [
          { kontoId: 'bank', betragCent: -1.5 },
          { kontoId: 'geldtransit', betragCent: 1.5 },
        ],
      }),
    ).toContain('ganze Cent');
    expect(await fehler({ ...basis, quelleTyp: 'storno', zeilen: [] })).toBeTruthy();

    await t.anfrage('admin-token', 'PUT', '/konten/geldtransit/archiv', { archiviert: true });
    expect((await t.umbuchung()).status).toBe(400);
    // nothing was booked
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(0);
  });

  it('stores the denominations of a booking on a Stückelung account', async () => {
    const t = await setup();
    const f = await t.fach();
    const res = await t.buchen({
      datum: '2027-01-05',
      text: 'Anfangsbestand',
      zeilen: [
        { kontoId: 'eroeffnung', betragCent: -2500 },
        {
          kontoId: f,
          betragCent: 2500,
          stueckelung: [
            { nennwertCent: 2000, anzahl: 1 },
            { nennwertCent: 500, anzahl: 1 },
          ],
        },
      ],
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const detail = await t.lesen<{ zeilen: { kontoId: string; stueckelung: unknown[] }[] }>(
      'vorstand-token',
      `/buchungen/${id}`,
    );
    expect(detail.zeilen.find((z) => z.kontoId === f)?.stueckelung).toEqual([
      { nennwertCent: 500, anzahl: 1 },
      { nennwertCent: 2000, anzahl: 1 },
    ]);
  });

  it('books only once per idempotency key', async () => {
    const t = await setup();
    const key = crypto.randomUUID();
    const erste = await t.umbuchung(500, { idempotenzSchluessel: key });
    expect(erste.status).toBe(201);
    const { id, seq } = (await erste.json()) as { id: string; seq: number };
    const zweite = await t.umbuchung(500, { idempotenzSchluessel: key });
    expect(zweite.status).toBe(200);
    expect(await zweite.json()).toEqual({ id, seq, wiederholt: true });
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(1);

    // the same for a reversal
    const stornoKey = crypto.randomUUID();
    const storno = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Falscher Betrag',
      idempotenzSchluessel: stornoKey,
    });
    expect(storno.status).toBe(201);
    const { id: stornoId } = (await storno.json()) as { id: string };
    const nochmal = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Falscher Betrag',
      idempotenzSchluessel: stornoKey,
    });
    expect(nochmal.status).toBe(200);
    expect(((await nochmal.json()) as { id: string }).id).toBe(stornoId);
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(2);
  });

  it('requires a valid idempotency key', async () => {
    const t = await setup();
    const body = {
      datum: '2027-01-05',
      text: 'x',
      zeilen: [
        { kontoId: 'geldtransit', betragCent: 5 },
        { kontoId: 'bank', betragCent: -5 },
      ],
    };
    expect((await t.roh('admin-token', 'POST', '/buchungen', body)).status).toBe(400);
    const kaputt = await t.roh('admin-token', 'POST', '/buchungen', {
      ...body,
      idempotenzSchluessel: 'abc',
    });
    expect(kaputt.status).toBe(400);
    expect(await kaputt.text()).toContain('UUID');
    expect(
      (
        await t.roh('admin-token', 'POST', '/buchungen/x/storno', {
          datum: '2027-01-05',
          text: 'x',
        })
      ).status,
    ).toBe(400);
  });

  it('reverses a booking once and never a reversal', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    const storno = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Doppelt erfasst',
    });
    expect(storno.status).toBe(201);
    const { id: stornoId, seq } = (await storno.json()) as { id: string; seq: number };
    expect(seq).toBe(2);

    const original = await t.lesen<{ storniertDurch: { id: string; seq: number } | null }>(
      'vorstand-token',
      `/buchungen/${id}`,
    );
    expect(original.storniertDurch).toEqual({ id: stornoId, seq: 2 });
    const detail = await t.lesen<{
      text: string;
      quelleTyp: string;
      stornoVon: { id: string; seq: number } | null;
      zeilen: { kontoId: string; betragCent: number }[];
    }>('vorstand-token', `/buchungen/${stornoId}`);
    expect(detail).toMatchObject({
      text: 'Storno von Nr. 1: Doppelt erfasst',
      quelleTyp: 'storno',
      stornoVon: { id, seq: 1 },
    });
    expect(detail.zeilen.map((z) => [z.kontoId, z.betragCent])).toEqual([
      ['geldtransit', -500],
      ['bank', 500],
    ]);
    const konten = await t.lesen<{ id: string; saldoCent: number }[]>('vorstand-token', '/konten');
    expect(konten.find((k) => k.id === 'bank')?.saldoCent).toBe(0);

    // twice, and a Storno of a Storno
    const nochmal = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-07',
      text: 'Nochmal',
    });
    expect(nochmal.status).toBe(409);
    expect(await nochmal.text()).toContain('bereits storniert');
    expect(
      (
        await t.anfrage('admin-token', 'POST', `/buchungen/${stornoId}/storno`, {
          datum: '2027-01-07',
          text: 'Nochmal',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await t.anfrage('admin-token', 'POST', '/buchungen/nix/storno', {
          datum: '2027-01-07',
          text: 'x',
        })
      ).status,
    ).toBe(404);
    expect(
      (await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, { datum: 'x', text: 'x' }))
        .status,
    ).toBe(400);
  });

  it('requires a reason for a Storno', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    for (const text of [undefined, '', '   ']) {
      const res = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
        datum: '2027-01-06',
        ...(text !== undefined && { text }),
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Begründung');
    }
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(1);
  });

  it('uses the reason as Storno text and may reverse into archived accounts', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    await t.anfrage('admin-token', 'PUT', '/konten/geldtransit/archiv', { archiviert: true });
    const res = await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Falscher Betrag',
    });
    expect(res.status).toBe(201);
    const { id: stornoId } = (await res.json()) as { id: string };
    expect((await t.lesen<{ text: string }>('vorstand-token', `/buchungen/${stornoId}`)).text).toBe(
      'Storno von Nr. 1: Falscher Betrag',
    );
  });

  it('verifies the chain and detects manipulation', async () => {
    const t = await setup();
    const leer = await t.lesen<{ ok: boolean; anzahl: number; kopfHash: string }>(
      'reader-token',
      '/kette',
    );
    expect(leer).toMatchObject({ ok: true, anzahl: 0, kopfHash: '0'.repeat(64) });

    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    await t.umbuchung(300);
    await t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, {
      datum: '2027-01-06',
      text: 'Test',
    });
    const intakt = await t.lesen<{
      ok: boolean;
      anzahl: number;
      zaehlerPasst: boolean;
      fehler: unknown[];
      letzteSeq: number;
    }>('reader-token', '/kette');
    expect(intakt).toMatchObject({
      ok: true,
      anzahl: 3,
      zaehlerPasst: true,
      fehler: [],
      letzteSeq: 3,
    });

    // tamper with an amount in the stored journal
    t.finanzenFake.buchungen[1]!.zeilen = t.finanzenFake.buchungen[1]!.zeilen.map((z) =>
      z.pos === 1 ? { ...z, betragCent: 301 } : z,
    );
    const kaputt = await t.lesen<{ ok: boolean; fehler: { seq: number; art: string }[] }>(
      'reader-token',
      '/kette',
    );
    expect(kaputt.ok).toBe(false);
    expect(kaputt.fehler).toContainEqual({ seq: 2, art: 'hash' });
    expect(kaputt.fehler).toContainEqual({ seq: 2, art: 'summe' });
  });

  it('notices a counter that does not match the last booking', async () => {
    const t = await setup();
    await t.umbuchung(500);
    t.finanzenFake.zaehler.wert = 2;
    const res = await t.lesen<{ ok: boolean; zaehlerPasst: boolean; fehler: unknown[] }>(
      'reader-token',
      '/kette',
    );
    expect(res).toMatchObject({ ok: false, zaehlerPasst: false, fehler: [] });
  });

  it('has no routes to change or delete bookings', async () => {
    const t = await setup();
    const { id } = (await (await t.umbuchung(500)).json()) as { id: string };
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      for (const pfad of ['/buchungen', `/buchungen/${id}`, `/buchungen/${id}/storno`]) {
        const res = await t.anfrage('admin-token', method, pfad, {});
        expect([404, 405], `${method} ${pfad}`).toContain(res.status);
      }
    }
    expect(
      (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
    ).toHaveLength(1);
  });
  describe('Bargeld', () => {
    type Fehler = { error?: string; message?: string };
    const meldung = async (res: Response) => {
      const b = (await res.json()) as Fehler;
      return b.error ?? b.message ?? '';
    };
    const zaehlen = (
      t: Awaited<ReturnType<typeof setup>>,
      kontoId: string,
      ist: [number, number][],
      extra: Record<string, unknown> = {},
      token = 'admin-token',
    ) =>
      t.anfrage(token, 'POST', '/zaehlungen', {
        kontoId,
        datum: '2027-01-10',
        ist: ist.map(([nennwertCent, anzahl]) => ({ nennwertCent, anzahl })),
        ...extra,
      });
    const umbuchenFach = (
      t: Awaited<ReturnType<typeof setup>>,
      von: string,
      nach: string,
      nennwertCent: number,
      anzahl: number,
      zeilen: 'beide' | 'nur-von' = 'beide',
    ) =>
      t.buchen({
        datum: '2027-01-11',
        text: 'Umbuchung',
        quelleTyp: 'umbuchung',
        zeilen: [
          {
            kontoId: von,
            betragCent: -nennwertCent * anzahl,
            stueckelung: [{ nennwertCent, anzahl: -anzahl }],
          },
          zeilen === 'beide'
            ? {
                kontoId: nach,
                betragCent: nennwertCent * anzahl,
                stueckelung: [{ nennwertCent, anzahl }],
              }
            : { kontoId: nach, betragCent: nennwertCent * anzahl },
        ],
      });
    type Bargeld = {
      faecher: {
        id: string;
        name: string;
        saldoCent: number;
        bestand: { nennwertCent: number; anzahl: number }[];
      }[];
      summeBestand: { nennwertCent: number; anzahl: number }[];
      summeCent: number;
    };
    const anzahl = (b: { nennwertCent: number; anzahl: number }[], n: number) =>
      b.find((x) => x.nennwertCent === n)?.anzahl;

    it('requires the matching right on the Bargeld routes', async () => {
      const t = await setup();
      for (const token of ['member-token', 'reader-token']) {
        for (const [method, pfad] of [
          ['GET', '/bargeld'],
          ['GET', '/zaehlungen'],
          ['GET', '/zaehlungen/x'],
          ['POST', '/zaehlungen'],
        ]) {
          const res = await t.anfrage(token, method!, pfad!, method === 'GET' ? undefined : {});
          expect(res.status, `${method} ${pfad} ${token}`).toBe(403);
        }
      }
      expect((await t.anfrage('vorstand-token', 'GET', '/bargeld')).status).toBe(200);
      expect((await t.anfrage('vorstand-token', 'GET', '/zaehlungen')).status).toBe(200);
      expect((await t.anfrage('vorstand-token', 'POST', '/zaehlungen', {})).status).toBe(403);
    });

    it('rejects bookings on a group account and sub accounts below an account with lines', async () => {
      const t = await setup();
      await t.fach();
      const res = await t.buchen({
        datum: '2027-01-05',
        text: 'Safe',
        zeilen: [
          { kontoId: 'safe', betragCent: 100 },
          { kontoId: 'bank', betragCent: -100 },
        ],
      });
      expect(res.status).toBe(400);
      expect(await meldung(res)).toContain('Unterkonten');

      await t.umbuchung(100);
      const unter = await t.anfrage('admin-token', 'POST', '/konten', {
        name: 'Unter Bank',
        art: 'bank',
        parentId: 'bank',
      });
      expect(unter.status).toBe(409);
      expect(await meldung(unter)).toContain('hat schon Buchungen und kann keine Unterkonten');
    });

    it('refuses a Storno that would book on an account with sub accounts', async () => {
      const t = await setup();
      // a parent that has lines cannot get children, so the rule only bites through the fake's own
      // state: book on a Fach, then give the Fach a child by a direct store call.
      const f = await t.fach();
      const b = (await (await t.befuellen(f, [[100, 5]])).json()) as { id: string };
      t.finanzenFake.konten.set('kind', {
        id: 'kind',
        name: 'Kind',
        art: 'bargeld',
        parentId: f,
        stueckelung: true,
        steuersatzStandard: null,
        archiviert: false,
      });
      const res = await t.anfrage('admin-token', 'POST', `/buchungen/${b.id}/storno`, {
        datum: '2027-01-12',
        text: 'Irrtum',
      });
      expect(res.status).toBe(400);
      expect(await meldung(res)).toContain('Unterkonten');
    });

    it('blocks bookings that would make a balance or a count negative', async () => {
      const t = await setup();
      const f = await t.fach('Wechselgeld');
      const g = await t.fach('Kleingeld');
      await t.befuellen(f, [
        [200, 3],
        [100, 4],
      ]);
      const zuViel = await umbuchenFach(t, f, g, 200, 4);
      expect(zuViel.status).toBe(400);
      expect(await meldung(zuViel)).toContain(
        'Im Fach „Wechselgeld“ sind nur 3 × 2,00 € vorhanden.',
      );
      // saldo check on a Bargeld account without Stückelung
      const kasse = await t.anfrage('admin-token', 'POST', '/konten', {
        name: 'Kasse',
        art: 'bargeld',
      });
      const { id: kasseId } = (await kasse.json()) as { id: string };
      const minus = await t.buchen({
        datum: '2027-01-11',
        text: 'Minus',
        zeilen: [
          { kontoId: kasseId, betragCent: -100 },
          { kontoId: 'bank', betragCent: 100 },
        ],
      });
      expect(minus.status).toBe(400);
      expect(await meldung(minus)).toContain('sind nur 0,00 € vorhanden');
      // within the stock it works
      expect((await umbuchenFach(t, f, g, 200, 3)).status).toBe(201);
      // a reversal of the Anfangsbestand would now take 2 EUR coins that are gone
      const journal = await t.lesen<{ buchungen: { id: string; text: string }[] }>(
        'vorstand-token',
        '/buchungen',
      );
      const anfang = journal.buchungen.find((b) => b.text === 'Anfangsbestand')!;
      const storno = await t.anfrage('admin-token', 'POST', `/buchungen/${anfang.id}/storno`, {
        datum: '2027-01-12',
        text: 'Irrtum',
      });
      expect(storno.status).toBe(400);
      expect(await meldung(storno)).toContain('Im Fach „Wechselgeld“ gibt es keine 2,00 €.');
    });

    it('allows changing money inside one Fach (Wechseln)', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[500, 1]]);
      const res = await t.buchen({
        datum: '2027-01-11',
        text: 'Wechseln',
        quelleTyp: 'umbuchung',
        zeilen: [
          { kontoId: f, betragCent: -500, stueckelung: [{ nennwertCent: 500, anzahl: -1 }] },
          { kontoId: f, betragCent: 500, stueckelung: [{ nennwertCent: 100, anzahl: 5 }] },
        ],
      });
      expect(res.status).toBe(201);
      const b = await t.lesen<Bargeld>('vorstand-token', '/bargeld');
      expect(anzahl(b.faecher[0]!.bestand, 100)).toBe(5);
      expect(anzahl(b.faecher[0]!.bestand, 500)).toBe(0);
    });

    it('shows the stock of the Fächer with totals', async () => {
      const t = await setup();
      const f = await t.fach('Wechselgeld');
      const g = await t.fach('Barkasse');
      await t.befuellen(f, [
        [200, 3],
        [100, 4],
      ]);
      await t.befuellen(g, [[100, 2]]);
      const archiviert = await t.fach('Alt');
      await t.anfrage('admin-token', 'PUT', `/konten/${archiviert}/archiv`, { archiviert: true });
      const b = await t.lesen<Bargeld>('vorstand-token', '/bargeld');
      expect(b.faecher.map((x) => x.name)).toEqual(['Barkasse', 'Wechselgeld']);
      expect(b.faecher.map((x) => x.saldoCent)).toEqual([200, 1000]);
      expect(b.faecher[0]!.bestand).toHaveLength(13);
      expect(anzahl(b.summeBestand, 100)).toBe(6);
      expect(anzahl(b.summeBestand, 200)).toBe(3);
      expect(b.summeCent).toBe(1200);
      // the Safe shows the rolled-up balance
      const konten = await t.lesen<{ id: string; saldoCent: number; saldoGesamtCent: number }[]>(
        'vorstand-token',
        '/konten',
      );
      expect(konten.find((k) => k.id === 'safe')).toMatchObject({
        saldoCent: 0,
        saldoGesamtCent: 1200,
      });
    });

    it('stores a Zählung without difference as protocol and books nothing', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[100, 4]]);
      const res = await zaehlen(t, f, [[100, 4]]);
      expect(res.status).toBe(201);
      const z = (await res.json()) as {
        id: string;
        buchungId: string | null;
        differenzCent: number;
      };
      expect(z).toMatchObject({ buchungId: null, differenzCent: 0 });
      const journal = await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen');
      expect(journal.buchungen).toHaveLength(1);
      const detail = await t.lesen<{
        sollCent: number;
        istCent: number;
        buchung: unknown;
        gezaehltVon: { username: string; status: string } | null;
        posten: { nennwertCent: number; sollAnzahl: number; istAnzahl: number }[];
      }>('vorstand-token', `/zaehlungen/${z.id}`);
      expect(detail).toMatchObject({
        sollCent: 400,
        istCent: 400,
        buchung: null,
        gezaehltVon: { username: 'user-a' },
      });
      expect(detail.posten).toHaveLength(13);
      expect(detail.posten.find((p) => p.nennwertCent === 100)).toMatchObject({
        sollAnzahl: 4,
        istAnzahl: 4,
      });
    });

    it('books the net difference on Kassendifferenz', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [
        [200, 3],
        [100, 4],
      ]);
      const res = await zaehlen(t, f, [
        [200, 3],
        [100, 2],
      ]);
      expect(res.status).toBe(201);
      const z = (await res.json()) as {
        id: string;
        buchungId: string;
        buchungSeq: number;
        differenzCent: number;
      };
      expect(z.differenzCent).toBe(-200);
      expect(z.buchungSeq).toBe(2);
      const buchung = await t.lesen<{
        quelleTyp: string;
        quelleId: string;
        text: string;
        zeilen: { kontoId: string; betragCent: number; stueckelung: unknown[] }[];
      }>('vorstand-token', `/buchungen/${z.buchungId}`);
      expect(buchung).toMatchObject({ quelleTyp: 'zaehlung', quelleId: z.id });
      expect(buchung.text).toContain('Zählung Wechselgeld: Differenz');
      expect(buchung.zeilen.map((x) => [x.kontoId, x.betragCent])).toEqual([
        [f, -200],
        ['kassendifferenz', 200],
      ]);
      const b = await t.lesen<Bargeld>('vorstand-token', '/bargeld');
      expect(anzahl(b.faecher[0]!.bestand, 100)).toBe(2);
      const liste = await t.lesen<{
        zaehlungen: { id: string; kontoName: string; differenzCent: number }[];
      }>('vorstand-token', `/zaehlungen?kontoId=${f}`);
      expect(liste.zaehlungen).toMatchObject([
        { id: z.id, kontoName: 'Wechselgeld', differenzCent: -200 },
      ]);
      expect(
        (await t.lesen<{ zaehlungen: unknown[] }>('vorstand-token', '/zaehlungen?kontoId=nix'))
          .zaehlungen,
      ).toHaveLength(0);
    });

    it('books a surplus and a missing coin of another value as two Fach lines plus Kassendifferenz', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[200, 3]]);
      const res = await zaehlen(t, f, [
        [200, 2],
        [500, 1],
      ]);
      const z = (await res.json()) as { buchungId: string; differenzCent: number };
      expect(z.differenzCent).toBe(-200 + 500);
      const buchung = await t.lesen<{ zeilen: { kontoId: string; betragCent: number }[] }>(
        'vorstand-token',
        `/buchungen/${z.buchungId}`,
      );
      expect(buchung.zeilen.map((x) => [x.kontoId, x.betragCent])).toEqual([
        [f, 500],
        [f, -200],
        ['kassendifferenz', -300],
      ]);
    });

    it('books only the Stückelung when just the mix differs', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[500, 1]]);
      const res = await zaehlen(t, f, [[100, 5]]);
      const z = (await res.json()) as { buchungId: string; differenzCent: number };
      expect(z.differenzCent).toBe(0);
      const buchung = await t.lesen<{ zeilen: { kontoId: string; betragCent: number }[] }>(
        'vorstand-token',
        `/buchungen/${z.buchungId}`,
      );
      expect(buchung.zeilen.map((x) => [x.kontoId, x.betragCent])).toEqual([
        [f, 500],
        [f, -500],
      ]);
    });

    it('counts only once per idempotency key', async () => {
      const t = await setup();
      const f = await t.fach();
      await t.befuellen(f, [[100, 4]]);
      const key = crypto.randomUUID();
      const erste = await zaehlen(t, f, [[100, 3]], { idempotenzSchluessel: key });
      expect(erste.status).toBe(201);
      const e = (await erste.json()) as { id: string; buchungId: string };
      const zweite = await zaehlen(t, f, [[100, 3]], { idempotenzSchluessel: key });
      expect(zweite.status).toBe(200);
      expect(await zweite.json()).toMatchObject({
        id: e.id,
        buchungId: e.buchungId,
        wiederholt: true,
      });
      expect(
        (await t.lesen<{ buchungen: unknown[] }>('vorstand-token', '/buchungen')).buchungen,
      ).toHaveLength(2);
      expect(
        (await t.lesen<{ zaehlungen: unknown[] }>('vorstand-token', '/zaehlungen')).zaehlungen,
      ).toHaveLength(1);
    });

    it('rejects a Zählung of an unknown, archived or non-Fach account and invalid counts', async () => {
      const t = await setup();
      const f = await t.fach();
      expect((await zaehlen(t, 'nix', [])).status).toBe(400);
      expect((await zaehlen(t, 'bank', [])).status).toBe(400);
      expect((await zaehlen(t, 'safe', [])).status).toBe(400);
      expect((await zaehlen(t, f, [[100, -1]])).status).toBe(400);
      expect((await zaehlen(t, f, [[100, 1.5]])).status).toBe(400);
      expect((await zaehlen(t, f, [[3, 1]])).status).toBe(400);
      expect((await t.anfrage('admin-token', 'GET', '/zaehlungen/nix')).status).toBe(404);
      await t.anfrage('admin-token', 'PUT', `/konten/${f}/archiv`, { archiviert: true });
      expect((await zaehlen(t, f, [])).status).toBe(400);
    });
  });

  describe('Kassen', () => {
    type Fehler = { error?: string; message?: string };
    type Dto = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const meldung = async (res: Response) => {
      const b = (await res.json()) as Fehler;
      return b.error ?? b.message ?? '';
    };
    const ereignis = (beginn = '2027-01-05T18:00:00.000Z', abgesagt = false) => ({
      titel: 'Abend',
      kategorie: 'Bar',
      beginn,
      abgesagt,
    });
    const roh = (
      t: Awaited<ReturnType<typeof setup>>,
      token: string,
      method: string,
      pfad: string,
      body?: unknown,
    ) => t.app.request(pfad, json(token, method, body));
    const st = (...p: [number, number][]) =>
      p.map(([nennwertCent, anzahl]) => ({ nennwertCent, anzahl }));
    const kassenzaehlung = (
      t: Awaited<ReturnType<typeof setup>>,
      kontoId: string,
      eventId: string,
      ist: [number, number][],
      extra: Record<string, unknown> = {},
      token = 'member-token',
    ) =>
      roh(t, token, 'POST', '/api/kassen/zaehlungen', {
        idempotenzSchluessel: crypto.randomUUID(),
        kontoId,
        eventId,
        ist: st(...ist),
        ...extra,
      });
    const abrechnen = (
      t: Awaited<ReturnType<typeof setup>>,
      k: { kasse: string; erloes: string; ziel: string },
      ist: [number, number][],
      extra: Record<string, unknown> = {},
      token = 'admin-token',
    ) =>
      roh(t, token, 'POST', '/api/finanzen/kassenabrechnungen', {
        idempotenzSchluessel: crypto.randomUUID(),
        kontoId: k.kasse,
        datum: '2027-01-12',
        ist: st(...ist),
        erloesKontoId: k.erloes,
        zielFachId: k.ziel,
        transfers: [],
        events: [],
        ...extra,
      });
    /** Erlöskonto (19 %), Ziel-Fach "Zählbrett" and a Kasse with Grundbestand 30 x 1 EUR and 2 x 5 EUR, filled to it. */
    async function kasseSetup(
      grund: [number, number][] = [
        [100, 30],
        [500, 2],
      ],
    ) {
      const t = await setup();
      const erloes = (
        (await (
          await t.anfrage('admin-token', 'POST', '/konten', {
            name: 'Getränke',
            art: 'erloes',
            steuersatzStandard: 1900,
          })
        ).json()) as { id: string }
      ).id;
      const ziel = await t.fach('Zählbrett');
      const res = await roh(t, 'admin-token', 'POST', '/api/finanzen/kassen', {
        name: 'Bar',
        grundbestand: st(...grund),
        standardErloesKontoId: erloes,
        standardZielFachId: ziel,
      });
      expect(res.status).toBe(201);
      const kasse = ((await res.json()) as { kontoId: string }).kontoId;
      await t.befuellen(kasse, grund);
      t.finanzenFake.events.set('e1', ereignis('2027-01-05T18:00:00.000Z'));
      t.finanzenFake.events.set('e2', ereignis('2027-01-08T18:00:00.000Z'));
      const k = { kasse, erloes, ziel };
      const bestand = async (id: string) =>
        (
          await t.lesen<{
            faecher: { id: string; bestand: { nennwertCent: number; anzahl: number }[] }[];
          }>('admin-token', '/bargeld')
        ).faecher
          .find((f) => f.id === id)!
          .bestand.reduce<Record<number, number>>(
            (m, b) => ({ ...m, [b.nennwertCent]: b.anzahl }),
            {},
          );
      return { t, k, bestand };
    }

    it('requires the matching right on every Kassen route', async () => {
      const t = await setup();
      const routen: [string, string, string[]][] = [
        ['GET', '/api/finanzen/kassen', ['member-token']],
        ['POST', '/api/finanzen/kassen', ['member-token', 'vorstand-token']],
        ['PUT', '/api/finanzen/kassen/x', ['member-token', 'vorstand-token']],
        ['GET', '/api/finanzen/kassen/x/abrechnung', ['member-token']],
        ['POST', '/api/finanzen/kassenabrechnungen', ['member-token', 'vorstand-token']],
        ['GET', '/api/finanzen/kassenabrechnungen', ['member-token']],
        ['GET', '/api/finanzen/kassenabrechnungen/x', ['member-token']],
      ];
      for (const [method, pfad, tokens] of routen)
        for (const token of tokens) {
          const res = await roh(t, token, method, pfad, method === 'GET' ? undefined : {});
          expect(res.status, `${method} ${pfad} ${token}`).toBe(403);
        }
      expect((await roh(t, 'vorstand-token', 'GET', '/api/finanzen/kassen')).status).toBe(200);
      expect(
        (await roh(t, 'vorstand-token', 'GET', '/api/finanzen/kassen/nix/abrechnung')).status,
      ).toBe(404);
    });

    it('creates a Kasse as a Fach and shows stock and Grundbestand', async () => {
      const { t, k } = await kasseSetup();
      const liste = (await (
        await roh(t, 'vorstand-token', 'GET', '/api/finanzen/kassen')
      ).json()) as Dto[];
      expect(liste).toHaveLength(1);
      expect(liste[0]).toMatchObject({
        kontoId: k.kasse,
        name: 'Bar',
        saldoCent: 3000 + 1000,
        standardErloesKonto: { id: k.erloes, name: 'Getränke' },
        standardZielFach: { id: k.ziel, name: 'Zählbrett' },
        letzteAbrechnung: null,
        offeneZaehlungen: 0,
      });
      expect(liste[0]!.grundbestand.find((g: Dto) => g.nennwertCent === 100).anzahl).toBe(30);
      expect(liste[0]!.bestand).toHaveLength(13);
      const konten = await t.lesen<
        { id: string; parentId: string | null; stueckelung: boolean; art: string }[]
      >('vorstand-token', '/konten');
      expect(konten.find((x) => x.id === k.kasse)).toMatchObject({
        parentId: 'safe',
        stueckelung: true,
        art: 'bargeld',
      });
    });

    it('validates Erlöskonto and Ziel-Fach when creating and changing a Kasse', async () => {
      const { t, k } = await kasseSetup();
      const anlegen = (extra: Record<string, unknown>) =>
        roh(t, 'admin-token', 'POST', '/api/finanzen/kassen', {
          name: 'Zweite',
          grundbestand: [],
          standardErloesKontoId: k.erloes,
          standardZielFachId: k.ziel,
          ...extra,
        });
      expect((await anlegen({ standardErloesKontoId: 'bank' })).status).toBe(400);
      expect((await anlegen({ standardErloesKontoId: 'nix' })).status).toBe(400);
      expect((await anlegen({ standardZielFachId: 'bank' })).status).toBe(400);
      expect((await anlegen({ standardZielFachId: 'safe' })).status).toBe(400);
      expect((await anlegen({ name: '' })).status).toBe(400);
      expect((await anlegen({ grundbestand: [{ nennwertCent: 3, anzahl: 1 }] })).status).toBe(400);
      expect((await anlegen({})).status).toBe(201);

      const aendern = (kontoId: string, body: Record<string, unknown>) =>
        roh(t, 'admin-token', 'PUT', `/api/finanzen/kassen/${kontoId}`, {
          grundbestand: st([100, 40]),
          standardErloesKontoId: k.erloes,
          standardZielFachId: k.ziel,
          ...body,
        });
      expect(await meldung(await aendern(k.kasse, { standardZielFachId: k.kasse }))).toContain(
        'anderes Fach als die Kasse',
      );
      expect((await aendern('nix', {})).status).toBe(404);
      expect((await aendern(k.kasse, {})).status).toBe(200);
      const liste = (await (
        await roh(t, 'admin-token', 'GET', '/api/finanzen/kassen')
      ).json()) as Dto[];
      const bar = liste.find((x) => x.kontoId === k.kasse)!;
      expect(bar.grundbestand.find((g: Dto) => g.nennwertCent === 100).anzahl).toBe(40);
      expect(bar.grundbestand.find((g: Dto) => g.nennwertCent === 500).anzahl).toBe(0);
    });

    it('lets members with kasse:zaehlen count at an event without seeing stock', async () => {
      const { t, k } = await kasseSetup();
      const kurz = await roh(t, 'member-token', 'GET', '/api/kassen');
      expect(kurz.status).toBe(200);
      expect(await kurz.json()).toEqual([{ kontoId: k.kasse, name: 'Bar' }]);
      const res = await kassenzaehlung(t, k.kasse, 'e1', [
        [100, 12],
        [500, 1],
      ]);
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ summeCent: 1700 });
      const liste = (await (
        await roh(t, 'member-token', 'GET', '/api/kassen/zaehlungen?eventId=e1')
      ).json()) as Dto[];
      expect(liste).toHaveLength(1);
      expect(liste[0]).toMatchObject({
        kontoName: 'Bar',
        summeCent: 1700,
        ersetzt: false,
        gezaehltVon: { sub: 'm2', username: 'user-m2' },
      });
      // A count books nothing.
      expect(
        (await t.lesen<{ buchungen: unknown[] }>('admin-token', '/buchungen')).buchungen,
      ).toHaveLength(1);
    });

    it('counts only at existing, not cancelled events, is idempotent and the newest count wins', async () => {
      const { t, k } = await kasseSetup();
      t.finanzenFake.events.set('weg', ereignis('2027-01-09T18:00:00.000Z', true));
      expect((await kassenzaehlung(t, k.kasse, 'nix', [])).status).toBe(400);
      const abgesagt = await kassenzaehlung(t, k.kasse, 'weg', []);
      expect(abgesagt.status).toBe(400);
      expect(await meldung(abgesagt)).toBe('Das Event ist abgesagt.');
      expect((await kassenzaehlung(t, 'bank', 'e1', [])).status).toBe(400);
      expect((await kassenzaehlung(t, k.kasse, 'e1', [[100, -1]])).status).toBe(400);

      const key = crypto.randomUUID();
      const erste = await kassenzaehlung(t, k.kasse, 'e1', [[100, 5]], {
        idempotenzSchluessel: key,
      });
      const zweite = await kassenzaehlung(t, k.kasse, 'e1', [[100, 5]], {
        idempotenzSchluessel: key,
      });
      expect(zweite.status).toBe(200);
      expect(await zweite.json()).toMatchObject({
        id: ((await erste.json()) as Dto).id,
        wiederholt: true,
      });
      await kassenzaehlung(t, k.kasse, 'e1', [[100, 7]]);
      const liste = (await (
        await roh(t, 'member-token', 'GET', '/api/kassen/zaehlungen?eventId=e1')
      ).json()) as Dto[];
      expect(liste.map((z) => [z.summeCent, z.ersetzt])).toEqual([
        [700, false],
        [500, true],
      ]);
      expect((await roh(t, 'member-token', 'GET', '/api/kassen/zaehlungen')).status).toBe(400);
    });

    it('settles a Kasse with one booking: Kasse, Erlös with tax, Ziel-Fach; the Grundbestand stays', async () => {
      const { t, k, bestand } = await kasseSetup();
      await kassenzaehlung(t, k.kasse, 'e1', [
        [100, 30],
        [500, 2],
        [5000, 1],
      ]);
      await kassenzaehlung(t, k.kasse, 'e2', [
        [100, 30],
        [500, 2],
        [5000, 1],
        [2000, 2],
      ]);
      const vorschau = (await (
        await roh(t, 'vorstand-token', 'GET', `/api/finanzen/kassen/${k.kasse}/abrechnung`)
      ).json()) as Dto;
      expect(vorschau.kasse.offeneZaehlungen).toBe(2);
      expect(vorschau.zaehlungen.map((z: Dto) => [z.eventId, z.summeCent, z.eventTitel])).toEqual([
        ['e1', 4000 + 5000, 'Abend'],
        ['e2', 4000 + 5000 + 4000, 'Abend'],
      ]);
      expect(vorschau.zaehlungen[0].gezaehltVon).toMatchObject({ username: 'user-m2' });

      // Finanzer:in counts 100 EUR more (1 x 50 + 2 x 20 + 1 x 10); events explain 50 + 30; the Zählbrett gets the surplus.
      const res = await abrechnen(
        t,
        k,
        [
          [100, 30],
          [500, 2],
          [5000, 1],
          [2000, 2],
          [1000, 1],
        ],
        {
          transfers: [
            { fachId: k.ziel, nennwertCent: 5000, anzahl: 1 },
            { fachId: k.ziel, nennwertCent: 2000, anzahl: 2 },
            { fachId: k.ziel, nennwertCent: 1000, anzahl: 1 },
          ],
          events: [
            { eventId: 'e1', zaehlungId: vorschau.zaehlungen[0].id, betragCent: 5000 },
            { eventId: 'e2', zaehlungId: vorschau.zaehlungen[1].id, betragCent: 3000 },
          ],
          // Whatever the client claims is ignored.
          einnahmeCent: 1,
          fehlerCent: 5,
        },
      );
      expect(res.status).toBe(201);
      const ergebnis = (await res.json()) as Dto;
      expect(ergebnis).toMatchObject({ einnahmeCent: 10000, fehlerCent: 2000 });
      expect(ergebnis.buchungSeq).toBeGreaterThan(0);

      const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${ergebnis.buchungId}`);
      expect(buchung).toMatchObject({
        quelleTyp: 'kassenabrechnung',
        quelleId: ergebnis.id,
        eventId: null,
      });
      expect(buchung.text).toBe('Kassenabrechnung Bar: Einnahme 100,00 €');
      const summe = buchung.zeilen.reduce((s: number, z: Dto) => s + z.betragCent, 0);
      expect(summe).toBe(0);
      const erloes = buchung.zeilen.find((z: Dto) => z.kontoId === k.erloes);
      expect(erloes).toMatchObject({
        betragCent: -10000,
        steuerArt: 'ust',
        steuersatz: 1900,
        nettoCent: -8403,
        steuerCent: -1597,
      });
      expect(
        buchung.zeilen
          .filter((z: Dto) => z.kontoId === k.ziel)
          .reduce((s: number, z: Dto) => s + z.betragCent, 0),
      ).toBe(10000);

      // The Kasse goes out as it was, the surplus is in the Zählbrett, the Grundbestand did not change.
      expect(await bestand(k.kasse)).toMatchObject({ 100: 30, 500: 2, 5000: 0, 2000: 0, 1000: 0 });
      expect(await bestand(k.ziel)).toMatchObject({ 5000: 1, 2000: 2, 1000: 1 });
      const kasse = (
        (await (await roh(t, 'admin-token', 'GET', '/api/finanzen/kassen')).json()) as Dto[]
      )[0]!;
      expect(kasse.grundbestand.find((g: Dto) => g.nennwertCent === 100).anzahl).toBe(30);
      expect(kasse.letzteAbrechnung).toMatchObject({ id: ergebnis.id, datum: '2027-01-12' });
      expect(kasse.offeneZaehlungen).toBe(0);

      const detail = (await (
        await roh(t, 'vorstand-token', 'GET', `/api/finanzen/kassenabrechnungen/${ergebnis.id}`)
      ).json()) as Dto;
      expect(detail).toMatchObject({
        kontoName: 'Bar',
        sollCent: 4000,
        istCent: 14000,
        einnahmeCent: 10000,
        fehlerCent: 2000,
        transferCent: 10000,
        storniert: false,
        erstelltVon: { username: 'user-a' },
        erloesKonto: { name: 'Getränke' },
        zielFach: { name: 'Zählbrett' },
      });
      expect(detail.events.map((e: Dto) => [e.eventId, e.betragCent])).toEqual([
        ['e1', 5000],
        ['e2', 3000],
      ]);
      expect(detail.posten).toHaveLength(13);
      const liste = (await (
        await roh(t, 'vorstand-token', 'GET', '/api/finanzen/kassenabrechnungen?kontoId=' + k.kasse)
      ).json()) as Dto;
      expect(liste.abrechnungen).toHaveLength(1);
      expect(liste.gekappt).toBe(false);
    });

    it('books nothing when the count equals the stock and nothing is moved', async () => {
      const { t, k } = await kasseSetup();
      const res = await abrechnen(t, k, [
        [100, 30],
        [500, 2],
      ]);
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        buchungId: null,
        buchungSeq: null,
        einnahmeCent: 0,
      });
      expect(
        (await t.lesen<{ buchungen: unknown[] }>('admin-token', '/buchungen')).buchungen,
      ).toHaveLength(1);
    });

    it('books a negative income as a debit on the Erlöskonto', async () => {
      const { t, k } = await kasseSetup();
      const res = await abrechnen(
        t,
        k,
        [
          [100, 20],
          [500, 2],
        ],
        {
          transfers: [{ fachId: k.ziel, nennwertCent: 100, anzahl: 0 + 10 }],
        },
      );
      expect(res.status).toBe(201);
      const e = (await res.json()) as Dto;
      expect(e.einnahmeCent).toBe(-1000);
      const b = await t.lesen<Dto>('admin-token', `/buchungen/${e.buchungId}`);
      expect(b.zeilen.find((z: Dto) => z.kontoId === k.erloes).betragCent).toBe(1000);
    });

    it('is idempotent per key', async () => {
      const { t, k } = await kasseSetup();
      const key = crypto.randomUUID();
      const body = { idempotenzSchluessel: key };
      const erste = await abrechnen(
        t,
        k,
        [
          [100, 30],
          [500, 2],
          [200, 5],
        ],
        body,
      );
      const zweite = await abrechnen(
        t,
        k,
        [
          [100, 30],
          [500, 2],
          [200, 5],
        ],
        body,
      );
      expect(erste.status).toBe(201);
      expect(zweite.status).toBe(200);
      expect(await zweite.json()).toMatchObject({
        id: ((await erste.json()) as Dto).id,
        wiederholt: true,
      });
      expect(
        (await t.lesen<{ buchungen: unknown[] }>('admin-token', '/buchungen')).buchungen,
      ).toHaveLength(2);
    });

    it('refuses invalid Abrechnungen with German messages', async () => {
      const { t, k } = await kasseSetup();
      const meld = async (res: Response) => {
        expect(res.status).toBe(400);
        return meldung(res);
      };
      expect(await meld(await abrechnen(t, { ...k, kasse: 'nix' }, []))).toContain(
        'Die Kasse gibt es nicht',
      );
      expect(await meld(await abrechnen(t, { ...k, erloes: 'bank' }, []))).toContain(
        'kein Erlöskonto',
      );
      expect(await meld(await abrechnen(t, { ...k, ziel: k.kasse }, []))).toContain(
        'anderes Fach als die Kasse',
      );
      expect(
        await meld(
          await abrechnen(t, k, [[100, 30]], {
            events: [{ eventId: 'nix', betragCent: 1 }],
          }),
        ),
      ).toContain('Event');
      expect(
        await meld(
          await abrechnen(t, k, [[100, 30]], {
            transfers: [{ fachId: k.ziel, nennwertCent: 5000, anzahl: -1 }],
          }),
        ),
      ).toContain('Im Fach „Zählbrett“ gibt es keine 50,00 €');
      // Nachschub only with a negative count.
      const tresor = await t.fach('Tresor');
      await t.befuellen(tresor, [[100, 100]]);
      expect(
        await meld(
          await abrechnen(
            t,
            k,
            [
              [100, 30],
              [500, 2],
            ],
            {
              transfers: [{ fachId: tresor, nennwertCent: 100, anzahl: 25 }],
            },
          ),
        ),
      ).toContain('negativen Anzahl');
      expect((await abrechnen(t, k, [[100, 30]], { datum: 'gestern' })).status).toBe(400);
    });

    it('fetches coin rolls into the Ziel-Fach and refills the Kasse from it (stock rule on every Fach)', async () => {
      // Grundbestand 30 x 1 EUR, counted 10, the Zählbrett has 10, the Tresor 100.
      const { t, k, bestand } = await kasseSetup([[100, 10]]);
      await roh(t, 'admin-token', 'PUT', `/api/finanzen/kassen/${k.kasse}`, {
        grundbestand: st([100, 30]),
        standardErloesKontoId: k.erloes,
        standardZielFachId: k.ziel,
      });
      await t.befuellen(k.ziel, [[100, 10]]);
      const tresor = await t.fach('Tresor');
      await t.befuellen(tresor, [[100, 100]]);

      const zuViel = await abrechnen(t, k, [[100, 10]], {
        transfers: [
          { fachId: k.ziel, nennwertCent: 100, anzahl: -20 },
          { fachId: tresor, nennwertCent: 100, anzahl: -5 },
        ],
      });
      expect(zuViel.status).toBe(400);
      expect(await meldung(zuViel)).toBe('Im Fach „Zählbrett“ sind nur 10 × 1,00 € vorhanden.');

      const res = await abrechnen(t, k, [[100, 10]], {
        transfers: [
          { fachId: k.ziel, nennwertCent: 100, anzahl: -20 },
          { fachId: tresor, nennwertCent: 100, anzahl: -25 },
        ],
      });
      expect(res.status).toBe(201);
      expect(await bestand(k.kasse)).toMatchObject({ 100: 30 });
      expect(await bestand(k.ziel)).toMatchObject({ 100: 15 });
      expect(await bestand(tresor)).toMatchObject({ 100: 75 });
      const e = (await res.json()) as Dto;
      const detail = await t.lesen<Dto>('admin-token', `/kassenabrechnungen/${e.id}`);
      expect(detail.transfers).toHaveLength(2);
      expect(detail.transferCent).toBe(-2000);
      // The Nachschub Fach itself must have enough, too.
      const leer = await abrechnen(t, k, [[100, 30]], {
        transfers: [{ fachId: tresor, nennwertCent: 100, anzahl: -200 }],
      });
      expect(leer.status).toBe(400);
      expect(await meldung(leer)).toBe('Im Fach „Tresor“ sind nur 75 × 1,00 € vorhanden.');
    });

    it('may refill with less this time: the Grundbestand stays, the Abrechnung records the stock after', async () => {
      const { t, k, bestand } = await kasseSetup([[100, 10]]);
      await roh(t, 'admin-token', 'PUT', `/api/finanzen/kassen/${k.kasse}`, {
        grundbestand: st([100, 30]),
        standardErloesKontoId: k.erloes,
        standardZielFachId: k.ziel,
      });
      await t.befuellen(k.ziel, [[100, 10]]);
      const res = await abrechnen(t, k, [[100, 10]], {
        transfers: [{ fachId: k.ziel, nennwertCent: 100, anzahl: -10 }],
      });
      expect(res.status).toBe(201);
      expect(await bestand(k.kasse)).toMatchObject({ 100: 20 });
      const e = (await res.json()) as Dto;
      const detail = await t.lesen<Dto>('admin-token', `/kassenabrechnungen/${e.id}`);
      expect(detail.posten.find((p: Dto) => p.nennwertCent === 100)).toMatchObject({
        grundbestand: 30,
        danach: 20,
      });
      const kasse = (
        (await (await roh(t, 'admin-token', 'GET', '/api/finanzen/kassen')).json()) as Dto[]
      )[0]!;
      expect(kasse.grundbestand.find((g: Dto) => g.nennwertCent === 100).anzahl).toBe(30);
    });

    it('a Storno of the booking makes the Dienst-Zählungen open again', async () => {
      const { t, k } = await kasseSetup();
      await kassenzaehlung(t, k.kasse, 'e1', [
        [100, 30],
        [500, 2],
        [5000, 1],
      ]);
      const vor = async () =>
        (await (
          await roh(t, 'admin-token', 'GET', `/api/finanzen/kassen/${k.kasse}/abrechnung`)
        ).json()) as Dto;
      expect((await vor()).zaehlungen).toHaveLength(1);
      await new Promise((r) => setTimeout(r, 5));
      const res = await abrechnen(
        t,
        k,
        [
          [100, 30],
          [500, 2],
          [5000, 1],
        ],
        {
          events: [{ eventId: 'e1', betragCent: 5000 }],
        },
      );
      const e = (await res.json()) as Dto;
      expect((await vor()).zaehlungen).toHaveLength(0);
      const storno = await t.anfrage('admin-token', 'POST', `/buchungen/${e.buchungId}/storno`, {
        datum: '2027-01-13',
        text: 'Falsch gezählt',
      });
      expect(storno.status).toBe(201);
      const danach = await vor();
      expect(danach.zaehlungen).toHaveLength(1);
      expect(danach.kasse.letzteAbrechnung).toBeNull();
      const liste = (await (
        await roh(t, 'admin-token', 'GET', '/api/finanzen/kassenabrechnungen')
      ).json()) as Dto;
      expect(liste.abrechnungen[0].storniert).toBe(true);
      const detail = await t.lesen<Dto>('admin-token', `/kassenabrechnungen/${e.id}`);
      expect(detail.storniert).toBe(true);
      expect((await t.anfrage('admin-token', 'GET', '/kassenabrechnungen/nix')).status).toBe(404);
    });
  });
});
