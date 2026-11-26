import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { kanonisch, kanonischJson } from '@c4/shared';
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
      'auslagen',
      'bank',
      'erloese_offen',
      'eroeffnung',
      'forderungen',
      'geldtransit',
      'kassendifferenz',
      'pfand',
      'safe',
      'sumup',
    ]);
    expect(konten.every((k) => k.saldoCent === 0)).toBe(true);

    const neu = await t.anfrage('admin-token', 'POST', '/konten', {
      name: 'Getränke',
      art: 'erloes',
      steuersatzArt: 'regel',
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
      steuersatzArt: 'regel',
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
    expect(
      (await aendern({ art: 'bank', name: 'Bank neu', steuersatzArt: 'ermaessigt' })).status,
    ).toBe(200);
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

  describe('chain check against the archive', () => {
    type Kette = {
      ok: boolean;
      fehler: { seq: number; art: string; schluessel?: string }[];
      archiv: { exporte: number; anker: number; nichtExportiert: number; eingerichtet: boolean };
    };
    const exportZeilen = (t: Awaited<ReturnType<typeof setup>>, bis: number) =>
      t.finanzenFake.buchungen
        .filter((b) => b.seq <= bis)
        .map(
          (b) =>
            kanonischJson({
              hash: b.hash,
              prev_hash: b.prevHash,
              buchung: JSON.parse(kanonisch(b)),
            }) + '\n',
        )
        .join('');

    it('accepts a matching export and counts what is not exported yet', async () => {
      const t = await setup();
      await t.umbuchung(500);
      await t.umbuchung(300);
      const b1 = t.finanzenFake.buchungen[0]!;
      t.archivObjekte.set('export/2027-01-07.jsonl', [exportZeilen(t, 1)]);
      t.archivObjekte.set('anker/2027-01-07.json', [
        JSON.stringify({ bis_seq: 1, kopf_hash: b1.hash, erstellt_am: 'x' }),
      ]);
      const kette = await t.lesen<Kette>('reader-token', '/kette');
      expect(kette).toMatchObject({
        ok: true,
        fehler: [],
        archiv: { exporte: 1, anker: 1, nichtExportiert: 1, eingerichtet: true },
      });
    });

    it('finds a manipulated line, a divergent anchor and a second version', async () => {
      const t = await setup();
      await t.umbuchung(500);
      const b1 = t.finanzenFake.buchungen[0]!;
      const zeile = exportZeilen(t, 1);
      t.archivObjekte.set('export/a.jsonl', [zeile.replace('"text":"', '"text":"X')]);
      t.archivObjekte.set('anker/a.json', [
        JSON.stringify({ bis_seq: 1, kopf_hash: 'f'.repeat(64) }),
        JSON.stringify({ bis_seq: 1, kopf_hash: b1.hash }),
      ]);
      const kette = await t.lesen<Kette>('reader-token', '/kette');
      expect(kette.ok).toBe(false);
      expect(kette.fehler).toContainEqual({
        seq: 1,
        art: 'archiv_abweichung',
        schluessel: 'export/a.jsonl',
      });
      expect(kette.fehler).toContainEqual({ seq: 1, art: 'anker', schluessel: 'anker/a.json' });
      expect(kette.fehler).toContainEqual({
        seq: 0,
        art: 'archiv_ueberschrieben',
        schluessel: 'anker/a.json',
      });
    });

    it('finds an archive entry that is missing in the database', async () => {
      const t = await setup();
      await t.umbuchung(500);
      await t.umbuchung(300);
      t.archivObjekte.set('export/a.jsonl', [exportZeilen(t, 2)]);
      t.finanzenFake.buchungen.pop();
      t.finanzenFake.zaehler.wert = 1;
      const kette = await t.lesen<Kette>('reader-token', '/kette');
      expect(kette.fehler).toContainEqual({
        seq: 2,
        art: 'archiv_fehlt_in_db',
        schluessel: 'export/a.jsonl',
      });
    });

    it('checks the checksum of Beleg files', async () => {
      const t = await setup();
      await t.umbuchung(500);
      const sha = 'cd'.repeat(32);
      const schluessel = `belege/${sha}.pdf`;
      t.finanzenFake.buchungen[0]!.belege = [{ sha256: sha }];
      t.finanzenFake.belegDateien.push({ sha256: sha, schluessel });
      const gut = await t.lesen<Kette>('reader-token', '/kette');
      expect(gut.fehler.filter((f) => f.art === 'beleg_datei')).toEqual([]);
      t.archivPruefsummen.set(schluessel, 'AAAA');
      expect((await t.lesen<Kette>('reader-token', '/kette')).fehler).toContainEqual({
        seq: 1,
        art: 'beleg_datei',
      });
      t.archivPruefsummen.set(schluessel, null);
      expect((await t.lesen<Kette>('reader-token', '/kette')).fehler).toContainEqual({
        seq: 1,
        art: 'beleg_datei',
      });
    });

    it('only checks the database without a bucket', async () => {
      const t = await setup();
      await t.umbuchung(500);
      (t.finanzarchiv as { eingerichtet: boolean }).eingerichtet = false;
      const kette = await t.lesen<Kette>('reader-token', '/kette');
      expect(kette).toMatchObject({ ok: true, archiv: { eingerichtet: false } });
    });
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
        steuersatzArt: null,
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
            steuersatzArt: 'regel',
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
      // Rename like in the Kontenplan: same validation.
      expect((await aendern(k.kasse, { name: '' })).status).toBe(400);
      expect((await aendern(k.kasse, { name: 'x'.repeat(300) })).status).toBe(400);
      expect((await aendern(k.kasse, { name: '  Festkasse ' })).status).toBe(200);
      const namen = (await (
        await roh(t, 'admin-token', 'GET', '/api/finanzen/kassen')
      ).json()) as Dto[];
      expect(namen.find((x) => x.kontoId === k.kasse)!.name).toBe('Festkasse');
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
      const liste = (
        (await (
          await roh(t, 'member-token', 'GET', '/api/kassen/zaehlungen?eventId=e1')
        ).json()) as Dto
      ).zaehlungen as Dto[];
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
      const liste = (
        (await (
          await roh(t, 'member-token', 'GET', '/api/kassen/zaehlungen?eventId=e1')
        ).json()) as Dto
      ).zaehlungen as Dto[];
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

    const eventKassen = async (
      t: Awaited<ReturnType<typeof setup>>,
      id = 'e1',
      token = 'member-token',
    ) => (await (await roh(t, token, 'GET', `/api/kassen/zaehlungen?eventId=${id}`)).json()) as Dto;
    const festlegen = (
      t: Awaited<ReturnType<typeof setup>>,
      id: string,
      kontoIds: string[],
      token = 'admin-token',
    ) => roh(t, token, 'PUT', `/api/finanzen/events/${id}/kassen`, { kontoIds });

    it('uses the Kategorie default until the Kassen of an event are set, and resets to it', async () => {
      const { t, k } = await kasseSetup();
      // Without a default nothing is assigned.
      expect((await eventKassen(t)).kassen).toEqual([]);
      const zweite = (await (
        await roh(t, 'admin-token', 'POST', '/api/finanzen/kassen', {
          name: 'Zweite',
          grundbestand: [],
          standardErloesKontoId: k.erloes,
          standardZielFachId: k.ziel,
        })
      ).json()) as { kontoId: string };
      const aendern = (kontoId: string, kat: string[]) =>
        roh(t, 'admin-token', 'PUT', `/api/finanzen/kassen/${kontoId}`, {
          grundbestand: [],
          standardErloesKontoId: k.erloes,
          standardZielFachId: k.ziel,
          standardKategorieIds: kat,
        });
      expect((await aendern(k.kasse, ['nix'])).status).toBe(400);
      expect((await aendern(k.kasse, ['kat'])).status).toBe(200);
      const liste = (await (
        await roh(t, 'admin-token', 'GET', '/api/finanzen/kassen')
      ).json()) as Dto[];
      expect(liste.find((x) => x.kontoId === k.kasse)!.standardKategorieIds).toEqual(['kat']);
      // Dynamic: the default reaches existing events.
      let e = await eventKassen(t);
      expect(e).toMatchObject({ angepasst: false, summeCent: 0, unvollstaendig: true });
      expect(e.kassen).toEqual([
        {
          kontoId: k.kasse,
          name: 'Bar',
          zugewiesen: true,
          gezaehlt: false,
          einnahmeCent: null,
          status: null,
        },
      ]);
      // Adjusted: the own list applies, the default no longer does.
      expect((await festlegen(t, 'e1', [zweite.kontoId])).status).toBe(200);
      e = await eventKassen(t);
      expect(e.angepasst).toBe(true);
      expect(e.kassen.map((x: Dto) => x.name)).toEqual(['Zweite']);
      expect(await eventKassen(t, 'e2')).toMatchObject({ angepasst: false });
      // An explicitly empty list is an adjustment, too.
      await festlegen(t, 'e1', []);
      expect(await eventKassen(t)).toMatchObject({
        angepasst: true,
        kassen: [],
        unvollstaendig: false,
      });
      // Reset.
      expect((await roh(t, 'admin-token', 'DELETE', '/api/finanzen/events/e1/kassen')).status).toBe(
        200,
      );
      e = await eventKassen(t);
      expect(e.angepasst).toBe(false);
      expect(e.kassen.map((x: Dto) => x.name)).toEqual(['Bar']);
      expect((await festlegen(t, 'nix', [])).status).toBe(404);
      expect((await festlegen(t, 'e1', ['bank'])).status).toBe(400);
    });

    it('requires finanzen:buchen to set the Kassen of an event', async () => {
      const { t } = await kasseSetup();
      for (const token of ['member-token', 'vorstand-token']) {
        expect((await festlegen(t, 'e1', [], token)).status, token).toBe(403);
        expect(
          (await roh(t, token, 'DELETE', '/api/finanzen/events/e1/kassen')).status,
          token,
        ).toBe(403);
      }
      expect(
        (await roh(t, 'member-token', 'GET', '/api/kassen/zaehlungen?eventId=nix')).status,
      ).toBe(404);
    });

    it('hides archived Kassen and counts others that are not assigned', async () => {
      const { t, k } = await kasseSetup();
      await roh(t, 'admin-token', 'PUT', `/api/finanzen/kassen/${k.kasse}`, {
        grundbestand: [],
        standardErloesKontoId: k.erloes,
        standardZielFachId: k.ziel,
        standardKategorieIds: ['kat'],
      });
      // Not assigned (explicit empty list) but counted: shows up, preliminary.
      await festlegen(t, 'e1', []);
      await kassenzaehlung(t, k.kasse, 'e1', [
        [100, 30],
        [500, 2],
        [5000, 1],
      ]);
      let e = await eventKassen(t);
      expect(e.kassen).toEqual([
        {
          kontoId: k.kasse,
          name: 'Bar',
          zugewiesen: false,
          gezaehlt: true,
          einnahmeCent: 5000,
          status: 'vorlaeufig',
        },
      ]);
      expect(e).toMatchObject({ summeCent: 5000, unvollstaendig: false });
      await t.anfrage('admin-token', 'PUT', `/konten/${k.kasse}/archiv`, { archiviert: true });
      e = await eventKassen(t);
      expect(e.kassen).toEqual([]);
      expect(e.zaehlungen).toEqual([]);
    });

    it('shows proposal income per Kasse as preliminary, then the booked amount, and the sum', async () => {
      const { t, k } = await kasseSetup();
      await roh(t, 'admin-token', 'PUT', `/api/finanzen/kassen/${k.kasse}`, {
        grundbestand: st([100, 30], [500, 2]),
        standardErloesKontoId: k.erloes,
        standardZielFachId: k.ziel,
        standardKategorieIds: ['kat'],
      });
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
      // Soll 40 EUR: e1 = 90 - 40, e2 = 130 - 90, like the proposal of the Abrechnung.
      const e1 = await eventKassen(t, 'e1');
      expect(e1.kassen[0]).toMatchObject({
        einnahmeCent: 5000,
        status: 'vorlaeufig',
        gezaehlt: true,
      });
      expect(e1).toMatchObject({ summeCent: 5000, unvollstaendig: false });
      expect((await eventKassen(t, 'e2')).kassen[0]).toMatchObject({
        einnahmeCent: 4000,
        status: 'vorlaeufig',
      });
      const vor = (await (
        await roh(t, 'admin-token', 'GET', `/api/finanzen/kassen/${k.kasse}/abrechnung`)
      ).json()) as Dto;
      await new Promise((r) => setTimeout(r, 5));
      // Booked with a different amount for e1: that amount counts now.
      const res = await abrechnen(
        t,
        k,
        [
          [100, 30],
          [500, 2],
          [5000, 1],
          [2000, 2],
        ],
        {
          transfers: [
            { fachId: k.ziel, nennwertCent: 5000, anzahl: 1 },
            { fachId: k.ziel, nennwertCent: 2000, anzahl: 2 },
          ],
          events: [
            { eventId: 'e1', zaehlungId: vor.zaehlungen[0].id, betragCent: 4500 },
            { eventId: 'e2', zaehlungId: vor.zaehlungen[1].id, betragCent: 4000 },
          ],
        },
      );
      const ergebnis = (await res.json()) as Dto;
      expect((await eventKassen(t, 'e1')).kassen[0]).toMatchObject({
        einnahmeCent: 4500,
        status: 'abgerechnet',
      });
      // Storno: back to the proposal.
      await t.anfrage('admin-token', 'POST', `/buchungen/${ergebnis.buchungId}/storno`, {
        datum: '2027-01-13',
        text: 'Falsch',
      });
      expect((await eventKassen(t, 'e1')).kassen[0]).toMatchObject({
        einnahmeCent: 5000,
        status: 'vorlaeufig',
      });
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

  describe('Belege', () => {
    type Dto = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const sha = 'a'.repeat(64);
    const datei = (hash = sha) => ({
      sha256: hash,
      schluessel: `belege/${hash}.pdf`,
      typ: 'application/pdf',
      name: 'rechnung.pdf',
    });
    afterEach(() => vi.useRealTimers());
    const jetzt = (iso: string) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(iso));
    };

    /** Aufwand category, Rechnungssteller and 1000 EUR on the Bank. */
    async function belegSetup() {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      const post = async (pfad: string, body: unknown) =>
        (await (await t.roh('admin-token', 'POST', pfad, body)).json()) as Dto;
      const kat = (await post('/konten', { name: 'Material', art: 'aufwand' })).id as string;
      const steller = (await post('/rechnungssteller', { name: 'Metro' })).id as string;
      await t.buchen({
        datum: '2027-01-02',
        text: 'Startguthaben',
        quelleTyp: 'umbuchung',
        zeilen: [
          { kontoId: 'eroeffnung', betragCent: -100000 },
          { kontoId: 'bank', betragCent: 100000 },
        ],
      });
      const daten = (extra: Dto = {}) => ({
        rechnungsstellerId: steller,
        belegdatum: '2027-01-05',
        belegsummeCent: 1190,
        posten: [
          {
            kategorieId: kat,
            text: 'Cola',
            anzahlMilli: 1000,
            einzelpreisCent: 1190,
            steuersatz: 1900,
          },
        ],
        zahlweg: 'bank',
        bezahldatum: '2027-01-06',
        datei: datei(),
        ...extra,
      });
      const entwurf = async (extra: Dto = {}) => {
        const res = await t.roh('admin-token', 'POST', '/beleg-entwuerfe', { daten: daten(extra) });
        expect(res.status).toBe(201);
        return ((await res.json()) as Dto).id as string;
      };
      const buchenE = (id: string, extra: Dto = {}, token = 'admin-token') =>
        t.roh(token, 'POST', `/beleg-entwuerfe/${id}/buchen`, {
          idempotenzSchluessel: crypto.randomUUID(),
          ...extra,
        });
      /** Drafts and books a Beleg; returns the result. */
      const gebucht = async (extra: Dto = {}) => {
        const id = await entwurf(extra);
        const w = (await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${id}`)).warnungen as Dto[];
        const res = await buchenE(id, { bestaetigt: w.map((x) => x.code) });
        expect(res.status, await res.clone().text()).toBe(201);
        return (await res.json()) as Dto;
      };
      return { ...t, kat, steller, daten, entwurf, buchenE, gebucht };
    }

    it('creates, reads, changes and deletes drafts', async () => {
      const t = await belegSetup();
      const id = await t.entwurf();
      const e = await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${id}`);
      expect(e.daten.posten).toHaveLength(1);
      expect(e.dateiUrl).toBe(`https://s3.example/finanzarchiv/belege/${sha}.pdf`);
      expect(e.warnungen).toEqual([]);
      // An empty draft is fine; only booking needs the required fields.
      const leer = await t.roh('admin-token', 'PUT', `/beleg-entwuerfe/${id}`, { daten: {} });
      expect(leer.status).toBe(200);
      const liste = await t.lesen<Dto>('admin-token', '/belege');
      expect(liste.belege).toMatchObject([
        { id, status: 'entwurf', nummer: null, hatDatei: false },
      ]);
      expect((await t.roh('admin-token', 'DELETE', `/beleg-entwuerfe/${id}`)).status).toBe(200);
      expect((await t.roh('admin-token', 'GET', `/beleg-entwuerfe/${id}`)).status).toBe(404);
      expect(
        (await t.roh('admin-token', 'PUT', `/beleg-entwuerfe/${id}`, { daten: {} })).status,
      ).toBe(404);
      expect((await t.roh('admin-token', 'DELETE', `/beleg-entwuerfe/${id}`)).status).toBe(404);
    });

    it('books a draft with a gapless number, the Vorsteuer fields and a valid hash chain', async () => {
      const t = await belegSetup();
      const id = await t.entwurf();
      const erst = await t.buchenE(id);
      expect(erst.status).toBe(201);
      const res = (await erst.json()) as Dto;
      expect(res.nummer).toBe('B-2027-0001');
      const zweiter = await t.gebucht();
      expect(zweiter.nummer).toBe('B-2027-0002');
      expect((await t.roh('admin-token', 'GET', `/beleg-entwuerfe/${id}`)).status).toBe(404);
      const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${res.buchungId}`);
      expect(buchung).toMatchObject({
        quelleTyp: 'beleg',
        datum: '2027-01-06',
        text: 'Beleg B-2027-0001: Metro',
      });
      expect(buchung.zeilen).toMatchObject([
        {
          kontoId: t.kat,
          betragCent: 1190,
          nettoCent: 1000,
          steuerCent: 190,
          steuersatz: 1900,
          steuerArt: 'vorsteuer',
        },
        { kontoId: 'bank', betragCent: -1190 },
      ]);
      const detail = await t.lesen<Dto>('admin-token', `/belege/${res.id}`);
      expect(detail).toMatchObject({
        nummer: 'B-2027-0001',
        summeCent: 1190,
        rechnungssteller: 'Metro',
        storniert: false,
      });
      expect(detail.datei.url).toContain(`belege/${sha}.pdf`);
      const kette = await t.lesen<Dto>('admin-token', '/kette');
      expect(kette).toMatchObject({ ok: true, fehler: [] });
    });

    it('starts the numbering again in a new year and does not use up a number on a failure', async () => {
      const t = await belegSetup();
      expect((await t.gebucht()).nummer).toBe('B-2027-0001');
      const kaputt = await t.buchenE(await t.entwurf({ posten: [] }));
      expect(kaputt.status).toBe(400);
      expect((await t.gebucht({ datei: datei('b'.repeat(64)) })).nummer).toBe('B-2027-0002');
      jetzt('2028-01-02T10:00:00Z');
      expect((await t.gebucht({ datei: datei('c'.repeat(64)) })).nummer).toBe('B-2028-0001');
    });

    it('is idempotent per key', async () => {
      const t = await belegSetup();
      const id = await t.entwurf();
      const key = crypto.randomUUID();
      const erst = await t.buchenE(id, { idempotenzSchluessel: key });
      expect(erst.status).toBe(201);
      const nochmal = await t.buchenE(id, { idempotenzSchluessel: key });
      expect(nochmal.status).toBe(200);
      expect(await nochmal.json()).toMatchObject({
        ...((await erst.json()) as Dto),
        wiederholt: true,
      });
      expect(((await t.lesen<Dto>('admin-token', '/belege')) as Dto).belege).toHaveLength(1);
    });

    it('needs finanzen:buchen to write and finanzen:lesen to read', async () => {
      const t = await belegSetup();
      const id = await t.entwurf();
      for (const [method, pfad] of [
        ['POST', '/rechnungssteller'],
        ['PATCH', '/rechnungssteller/x'],
        ['POST', '/beleg-entwuerfe'],
        ['PUT', `/beleg-entwuerfe/${id}`],
        ['DELETE', `/beleg-entwuerfe/${id}`],
        ['POST', `/beleg-entwuerfe/${id}/buchen`],
        ['POST', '/belege/x/kopieren'],
        ['POST', '/beleg-dateien/upload'],
        ['POST', '/erstattungen'],
      ]) {
        for (const token of ['member-token', 'reader-token', 'vorstand-token']) {
          const res = await t.roh(token, method!, pfad!, {});
          expect(res.status, `${method} ${pfad} ${token}`).toBe(403);
        }
      }
      for (const pfad of ['/rechnungssteller', '/belege', `/beleg-entwuerfe/${id}`, '/auslagen']) {
        expect((await t.roh('vorstand-token', 'GET', pfad)).status, pfad).toBe(200);
        expect((await t.roh('member-token', 'GET', pfad)).status, pfad).toBe(403);
      }
    });

    it('rejects incomplete drafts with German messages', async () => {
      const t = await belegSetup();
      const id = await t.entwurf({
        rechnungsstellerId: null,
        belegdatum: null,
        datei: null,
        zahlweg: null,
      });
      const res = await t.buchenE(id);
      expect(res.status).toBe(400);
      const text = ((await res.json()) as Dto).error as string;
      for (const teil of ['Rechnungssteller', 'Belegdatum', 'Eigenbeleg', 'Zahlweg'])
        expect(text).toContain(teil);
      // An Eigenbeleg needs a reason, not a file.
      const ohneDatei = await t.buchenE(
        await t.entwurf({ datei: null, eigenbelegBegruendung: 'Beleg verloren' }),
      );
      expect(ohneDatei.status).toBe(201);
      const kat = await t.entwurf({
        posten: [
          {
            kategorieId: 'safe',
            text: 'Deko',
            anzahlMilli: 1000,
            einzelpreisCent: 100,
            steuersatz: 0,
          },
        ],
      });
      expect(((await (await t.buchenE(kat)).json()) as Dto).error).toContain(
        'keine Aufwandskategorie',
      );
    });

    it('warns about items with price 0', async () => {
      const t = await belegSetup();
      const id = await t.entwurf({
        belegsummeCent: 100,
        posten: [
          {
            kategorieId: t.kat,
            text: 'Deko',
            anzahlMilli: 1000,
            einzelpreisCent: 100,
            steuersatz: 0,
          },
          {
            kategorieId: t.kat,
            text: 'Sterni',
            anzahlMilli: 1000,
            einzelpreisCent: 0,
            steuersatz: 0,
          },
        ],
      });
      const w = (await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${id}`)).warnungen as Dto[];
      expect(w.find((x) => x.code === 'preis_null')?.text).toBe(
        'Posten mit Preis 0: Kategorien 2 (Sterni).',
      );
    });

    it('asks to confirm warnings before booking', async () => {
      const t = await belegSetup();
      const teuer = {
        belegsummeCent: 60000,
        posten: [
          {
            kategorieId: t.kat,
            text: 'Deko',
            anzahlMilli: 1000,
            einzelpreisCent: 60000,
            steuersatz: 0,
          },
        ],
      };
      const id = await t.entwurf(teuer);
      const w = (await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${id}`)).warnungen as Dto[];
      expect(w.map((x) => x.code)).toContain('hoher_betrag');
      const offen = await t.buchenE(id);
      expect(offen.status).toBe(409);
      expect(((await offen.json()) as Dto).warnungen.map((x: Dto) => x.code)).toContain(
        'hoher_betrag',
      );
      const ok = await t.buchenE(id, { bestaetigt: w.map((x) => x.code) });
      expect(ok.status).toBe(201);
      // The same file again is reported.
      const nochmal = await t.entwurf();
      expect(
        ((await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${nochmal}`)).warnungen as Dto[]).map(
          (x) => x.code,
        ),
      ).toContain('datei_doppelt');
      // A Bezahldatum in the future too.
      const spaet = await t.entwurf({ bezahldatum: '2027-12-01', datei: datei('d'.repeat(64)) });
      expect(
        ((await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${spaet}`)).warnungen as Dto[]).map(
          (x) => x.code,
        ),
      ).toContain('zukunft');
      // A Belegdatum older than two months is warned about (booking asks for confirmation).
      const alt = await t.entwurf({ belegdatum: '2026-12-31', datei: datei('e'.repeat(64)) });
      expect(
        ((await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${alt}`)).warnungen as Dto[]).map(
          (x) => x.code,
        ),
      ).toContain('belegdatum_alt');
      // A Belegdatum in the future cannot be booked at all.
      const zukunft = await t.entwurf({ belegdatum: '2027-03-02', datei: datei('f'.repeat(64)) });
      const abgelehnt = await t.buchenE(zukunft);
      expect(abgelehnt.status).toBe(400);
      expect(JSON.stringify(await abgelehnt.json())).toContain('nicht in der Zukunft');
    });

    it('books an Eigenbeleg without Vorsteuer (whole amount is expense)', async () => {
      const t = await belegSetup();
      const res = await t.gebucht({ datei: null, eigenbelegBegruendung: 'Beleg verloren' });
      const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${res.buchungId}`);
      expect(buchung.zeilen).toMatchObject([
        { kontoId: t.kat, betragCent: 1190, nettoCent: null, steuerCent: null, steuerArt: 'keine' },
        { kontoId: 'bank', betragCent: -1190, steuerArt: 'keine' },
      ]);
      const detail = await t.lesen<Dto>('admin-token', `/belege/${res.id}`);
      expect(detail.jeSteuersatz).toMatchObject([
        { satz: 1900, netto: 1190, steuer: 0, brutto: 1190 },
      ]);
    });

    it('books a Gesamtpreis line exactly and stores the rounded unit price', async () => {
      const t = await belegSetup();
      const res = await t.gebucht({
        belegsummeCent: 799,
        posten: [
          {
            kategorieId: t.kat,
            text: 'Steaks',
            anzahlMilli: 8000,
            einzelpreisCent: 0,
            gesamtCent: 799,
            steuersatz: 700,
          },
        ],
      });
      const detail = await t.lesen<Dto>('admin-token', `/belege/${res.id}`);
      expect(detail.summeCent).toBe(799);
      expect(detail.posten).toMatchObject([
        { betragCent: 799, gesamtCent: 799, einzelpreisCent: 100, anzahlMilli: 8000 },
      ]);
      const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${res.buchungId}`);
      expect(buchung.zeilen[0]).toMatchObject({ kontoId: t.kat, betragCent: 799 });
      const artikel = await t.lesen<Dto[]>('vorstand-token', '/artikel');
      expect(artikel).toMatchObject([{ name: 'Steaks', steuersatzArt: 'ermaessigt' }]);
    });

    it('checks tax rates against the period of the Belegdatum (Covid) and the Artikel Art', async () => {
      const t = await belegSetup();
      const covid = { belegdatum: '2020-08-15', bezahldatum: '2027-01-06' };
      const posten = (satz: number) => [
        {
          kategorieId: t.kat,
          text: 'Cola',
          anzahlMilli: 1000,
          einzelpreisCent: 1190,
          steuersatz: satz,
        },
      ];
      const falsch = await t.buchenE(await t.entwurf({ ...covid, posten: posten(1900) }));
      expect(falsch.status).toBe(400);
      expect(JSON.stringify(await falsch.json())).toContain('gilt am Belegdatum nicht');
      const alt = (await t.lesen<Dto[]>('admin-token', '/steuersatz-zeitraeume')).length;
      expect(alt).toBe(3);
      const w = await t.gebucht({ ...covid, posten: posten(1600) });
      expect(w.nummer).toBe('B-2027-0001');
      const artikel = await t.lesen<Dto[]>('vorstand-token', '/artikel');
      expect(artikel).toMatchObject([{ name: 'Cola', steuersatzArt: 'regel' }]);
    });

    it('lists, adds and deletes tax rate periods', async () => {
      const t = await belegSetup();
      const liste = await t.lesen<Dto[]>('vorstand-token', '/steuersatz-zeitraeume');
      expect(liste.map((z) => [z.ab, z.regel, z.ermaessigt])).toEqual([
        ['2007-01-01', 1900, 700],
        ['2020-07-01', 1600, 500],
        ['2021-01-01', 1900, 700],
      ]);
      expect((await t.roh('member-token', 'GET', '/steuersatz-zeitraeume')).status).toBe(403);
      const neu = { ab: '2030-01-01', regel: 2000, ermaessigt: 800 };
      expect((await t.roh('vorstand-token', 'POST', '/steuersatz-zeitraeume', neu)).status).toBe(
        403,
      );
      const angelegt = await t.roh('admin-token', 'POST', '/steuersatz-zeitraeume', neu);
      expect(angelegt.status).toBe(201);
      const id = ((await angelegt.json()) as Dto).id as string;
      expect((await t.roh('admin-token', 'POST', '/steuersatz-zeitraeume', neu)).status).toBe(400);
      expect(
        (
          await t.roh('admin-token', 'POST', '/steuersatz-zeitraeume', {
            ...neu,
            ab: '2031-01-01',
            ermaessigt: 2000,
          })
        ).status,
      ).toBe(400);
      // Members get the periods with the choices of their submission form.
      const auswahl = await t.lesen<Dto>('member-token', '/einreichungen/auswahl');
      expect(auswahl.steuersatzZeitraeume).toHaveLength(4);
      // A rate of the new period is not valid before it starts.
      const zu = await t.roh('member-token', 'POST', '/einreichungen', {
        datei: datei('9'.repeat(64)),
        belegdatum: '2027-01-05',
        betragCent: 100,
        posten: [
          {
            kategorieId: t.kat,
            text: 'Deko',
            anzahlMilli: 1000,
            einzelpreisCent: 100,
            steuersatz: 2000,
          },
        ],
      });
      expect(zu.status).toBe(400);
      expect((await t.roh('admin-token', 'DELETE', `/steuersatz-zeitraeume/${id}`)).status).toBe(
        200,
      );
      expect((await t.roh('admin-token', 'DELETE', `/steuersatz-zeitraeume/${id}`)).status).toBe(
        404,
      );
      // A period with a booked Beleg cannot be deleted (the Beleg of 2027-01-05 is in the last one).
      await t.gebucht();
      const letzte = (await t.lesen<Dto[]>('vorstand-token', '/steuersatz-zeitraeume')).find(
        (z) => z.ab === '2021-01-01',
      )!;
      expect(letzte.loeschbar).toBe(false);
      expect(
        (await t.roh('admin-token', 'DELETE', `/steuersatz-zeitraeume/${letzte.id}`)).status,
      ).toBe(400);
      const covid = (await t.lesen<Dto[]>('vorstand-token', '/steuersatz-zeitraeume')).find(
        (z) => z.ab === '2020-07-01',
      )!;
      expect(covid.loeschbar).toBe(true);
      expect(
        (await t.roh('admin-token', 'DELETE', `/steuersatz-zeitraeume/${covid.id}`)).status,
      ).toBe(200);
    });

    it('books cash payment out of a Fach with denominations and checks the sum', async () => {
      const t = await belegSetup();
      const fach = await t.fach();
      await t.befuellen(fach, [
        [2000, 2],
        [500, 1],
      ]);
      const bar = (stueckelung: Dto[]) => ({
        zahlweg: 'bar',
        fachId: fach,
        belegsummeCent: 1200,
        posten: [
          {
            kategorieId: t.kat,
            text: 'Deko',
            anzahlMilli: 1000,
            einzelpreisCent: 1200,
            steuersatz: 0,
          },
        ],
        stueckelung,
      });
      const falsch = await t.buchenE(await t.entwurf(bar([{ nennwertCent: 2000, anzahl: -1 }])));
      expect(falsch.status).toBe(400);
      const richtig = await t.buchenE(
        await t.entwurf(
          bar([
            { nennwertCent: 2000, anzahl: -1 },
            { nennwertCent: 500, anzahl: 1 },
            { nennwertCent: 200, anzahl: 1 },
            { nennwertCent: 100, anzahl: 1 },
          ]),
        ),
      );
      expect(richtig.status).toBe(201);
      const fachDto = (await t.lesen<Dto>('admin-token', '/bargeld')).faecher.find(
        (f: Dto) => f.id === fach,
      );
      expect(fachDto.saldoCent).toBe(4500 - 1200);
    });

    it('books Auslagen and reimburses them collectively, once', async () => {
      const t = await belegSetup();
      const auslage = (extra: Dto = {}) => ({
        zahlweg: 'auslage',
        mitgliedId: 'm2',
        bezahldatum: null,
        ...extra,
      });
      const b1 = await t.gebucht(auslage({ datei: datei('1'.repeat(64)) }));
      const b2 = await t.gebucht(
        auslage({ datei: datei('2'.repeat(64)), belegdatum: '2027-01-07' }),
      );
      const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${b1.buchungId}`);
      expect(buchung.datum).toBe('2027-01-05');
      expect(buchung.zeilen.at(-1)).toMatchObject({ kontoId: 'auslagen', betragCent: -1190 });
      const offen = await t.lesen<Dto>('admin-token', '/auslagen');
      expect(offen.mitglieder).toHaveLength(1);
      expect(offen.mitglieder[0]).toMatchObject({ mitgliedId: 'm2', summeCent: 2380 });
      expect(offen.mitglieder[0].mitglied.username).toBe('user-m2');
      expect((await t.lesen<Dto>('admin-token', `/belege/${b1.id}`)).bezahldatum).toBeNull();

      const erstatten = (belegIds: string[], extra: Dto = {}) =>
        t.roh('admin-token', 'POST', '/erstattungen', {
          idempotenzSchluessel: crypto.randomUUID(),
          mitgliedId: 'm2',
          belegIds,
          datum: '2027-02-01',
          zahlweg: 'bank',
          ...extra,
        });
      const res = await erstatten([b1.id, b2.id]);
      expect(res.status).toBe(201);
      const erstattung = (await res.json()) as Dto;
      expect(erstattung.summeCent).toBe(2380);
      const eb = await t.lesen<Dto>('admin-token', `/buchungen/${erstattung.buchungId}`);
      expect(eb).toMatchObject({ quelleTyp: 'erstattung', datum: '2027-02-01' });
      expect(eb.zeilen).toMatchObject([
        { kontoId: 'auslagen', betragCent: 2380 },
        { kontoId: 'bank', betragCent: -2380 },
      ]);
      expect((await t.lesen<Dto>('admin-token', '/auslagen')).mitglieder).toEqual([]);
      const detail = await t.lesen<Dto>('admin-token', `/belege/${b1.id}`);
      expect(detail.bezahldatum).toBe('2027-02-01');
      expect(detail.erstattung.id).toBe(erstattung.id);

      // A second Erstattung of the same Belege is refused ...
      const doppelt = await erstatten([b1.id]);
      expect(doppelt.status).toBe(400);
      // ... until the Erstattung is reversed: then the Belege are open again.
      const storno = await t.anfrage(
        'admin-token',
        'POST',
        `/buchungen/${erstattung.buchungId}/storno`,
        {
          datum: '2027-02-02',
          text: 'Falsch',
        },
      );
      expect(storno.status).toBe(201);
      expect((await t.lesen<Dto>('admin-token', '/auslagen')).mitglieder[0].summeCent).toBe(2380);
      expect((await t.lesen<Dto>('admin-token', `/belege/${b1.id}`)).bezahldatum).toBeNull();
      expect((await erstatten([b1.id])).status).toBe(201);
      // A reversed Beleg is no longer open.
      await t.anfrage('admin-token', 'POST', `/buchungen/${b2.buchungId}/storno`, {
        datum: '2027-02-03',
        text: 'Falsch',
      });
      expect((await t.lesen<Dto>('admin-token', '/auslagen')).mitglieder).toEqual([]);
      expect((await erstatten([b2.id])).status).toBe(400);
      const liste = (await t.lesen<Dto>('admin-token', '/belege')).belege as Dto[];
      expect(liste.find((b) => b.id === b2.id)?.status).toBe('storniert');
    });

    it('reimburses in cash from a Fach and replays an Erstattung with the same key', async () => {
      const t = await belegSetup();
      const fach = await t.fach();
      await t.befuellen(fach, [[2000, 1]]);
      const b = await t.gebucht({
        zahlweg: 'auslage',
        mitgliedId: 'm2',
        bezahldatum: null,
        belegsummeCent: 1500,
        posten: [
          {
            kategorieId: t.kat,
            text: 'Deko',
            anzahlMilli: 1000,
            einzelpreisCent: 1500,
            steuersatz: 0,
          },
        ],
      });
      const body = {
        idempotenzSchluessel: crypto.randomUUID(),
        mitgliedId: 'm2',
        belegIds: [b.id],
        datum: '2027-02-01',
        zahlweg: 'bar',
        fachId: fach,
        stueckelung: [
          { nennwertCent: 2000, anzahl: -1 },
          { nennwertCent: 500, anzahl: 1 },
        ],
      };
      const erst = await t.roh('admin-token', 'POST', '/erstattungen', body);
      expect(erst.status).toBe(201);
      const nochmal = await t.roh('admin-token', 'POST', '/erstattungen', body);
      expect(nochmal.status).toBe(200);
      expect(((await nochmal.json()) as Dto).wiederholt).toBe(true);
      const fachDto = (await t.lesen<Dto>('admin-token', '/bargeld')).faecher.find(
        (f: Dto) => f.id === fach,
      );
      expect(fachDto.saldoCent).toBe(500);
      const ohneFach = await t.roh('admin-token', 'POST', '/erstattungen', {
        ...body,
        idempotenzSchluessel: crypto.randomUUID(),
        fachId: null,
      });
      expect(ohneFach.status).toBe(400);
    });

    it('books a Beleg with a negative sum (Leergut return) for every Zahlweg', async () => {
      const t = await belegSetup();
      const leergut = {
        art: 'leergut',
        text: 'Kästen zurück',
        anzahlMilli: 1000,
        einzelpreisCent: 310,
        steuersatz: 0,
      };
      const negativ = (extra: Dto = {}) => ({
        belegsummeCent: -310,
        posten: [leergut],
        ...extra,
      });
      // Bank: incoming money.
      const bank = await t.gebucht(negativ());
      const bb = await t.lesen<Dto>('admin-token', `/buchungen/${bank.buchungId}`);
      expect(bb.zeilen).toMatchObject([
        { kontoId: 'pfand', betragCent: -310 },
        { kontoId: 'bank', betragCent: 310 },
      ]);
      const detail = await t.lesen<Dto>('admin-token', `/belege/${bank.id}`);
      expect(detail).toMatchObject({ summeCent: -310 });
      expect(detail.posten).toMatchObject([
        { art: 'leergut', betragCent: -310, einzelpreisCent: 310 },
      ]);
      // The sum of the Posten must equal the Belegsumme, also when negative.
      const falsch = await t.buchenE(
        await t.entwurf(negativ({ belegsummeCent: 310, datei: datei('8'.repeat(64)) })),
      );
      expect(falsch.status).toBe(400);
      expect(((await falsch.json()) as Dto).error).toContain('Die Posten ergeben');
      // Bar: cash into the Fach with positive denominations.
      const fach = await t.fach();
      const bar = await t.gebucht(
        negativ({
          datei: datei('9'.repeat(64)),
          zahlweg: 'bar',
          fachId: fach,
          stueckelung: [
            { nennwertCent: 200, anzahl: 1 },
            { nennwertCent: 100, anzahl: 1 },
            { nennwertCent: 10, anzahl: 1 },
          ],
        }),
      );
      expect(bar.id).toBeTruthy();
      const fachDto = (await t.lesen<Dto>('admin-token', '/bargeld')).faecher.find(
        (f: Dto) => f.id === fach,
      );
      expect(fachDto.saldoCent).toBe(310);
      // Auslage: the member owes the club; the Erstattung is a payment into the Kasse.
      const auslage = await t.gebucht(
        negativ({
          datei: datei('a1'.repeat(32)),
          zahlweg: 'auslage',
          mitgliedId: 'm2',
          bezahldatum: null,
        }),
      );
      expect((await t.lesen<Dto>('admin-token', '/auslagen')).mitglieder[0].summeCent).toBe(-310);
      const erst = await t.roh('admin-token', 'POST', '/erstattungen', {
        idempotenzSchluessel: crypto.randomUUID(),
        mitgliedId: 'm2',
        belegIds: [auslage.id],
        datum: '2027-02-01',
        zahlweg: 'bank',
      });
      expect(erst.status, await erst.clone().text()).toBe(201);
      const eb = await t.lesen<Dto>(
        'admin-token',
        `/buchungen/${((await erst.json()) as Dto).buchungId}`,
      );
      expect(eb.zeilen).toMatchObject([
        { kontoId: 'auslagen', betragCent: -310 },
        { kontoId: 'bank', betragCent: 310 },
      ]);
    });

    it('books a Beleg that adds up to 0 for Bar, Bank and Auslage without a counter line', async () => {
      const t = await belegSetup();
      const fach = await t.fach();
      const nullSumme = (hash: string, extra: Dto = {}) => ({
        belegsummeCent: 0,
        datei: datei(hash.repeat(64)),
        posten: [
          {
            kategorieId: t.kat,
            text: 'Deko',
            anzahlMilli: 1000,
            einzelpreisCent: 310,
            steuersatz: 0,
          },
          {
            art: 'leergut',
            text: 'Kästen',
            anzahlMilli: 1000,
            einzelpreisCent: 310,
            steuersatz: 0,
          },
        ],
        ...extra,
      });
      const bank = await t.gebucht(nullSumme('d'));
      const bar = await t.gebucht(nullSumme('e', { zahlweg: 'bar', fachId: fach }));
      const auslage = await t.gebucht(
        nullSumme('f', { zahlweg: 'auslage', mitgliedId: 'm2', bezahldatum: null }),
      );
      for (const b of [bank, bar, auslage]) {
        const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${b.buchungId}`);
        expect(buchung.zeilen).toHaveLength(2);
        expect(buchung.zeilen.map((z: Dto) => z.kontoId)).toEqual([t.kat, 'pfand']);
        expect((await t.lesen<Dto>('admin-token', `/belege/${b.id}`)).summeCent).toBe(0);
      }
      // Nothing is owed: the Auslage of 0 is not open.
      expect((await t.lesen<Dto>('admin-token', '/auslagen')).mitglieder).toEqual([]);
      expect((await t.lesen<Dto>('admin-token', '/kette')).ok).toBe(true);
    });

    it('rejects an Erstattung with the sum 0', async () => {
      const t = await belegSetup();
      const kat = (text: string, einzelpreisCent: number) => ({
        kategorieId: t.kat,
        text,
        anzahlMilli: 1000,
        einzelpreisCent,
        steuersatz: 0,
      });
      const auslage = (summe: number, hash: string) =>
        t.gebucht({
          zahlweg: 'auslage',
          mitgliedId: 'm2',
          bezahldatum: null,
          belegsummeCent: summe,
          datei: datei(hash.repeat(64)),
          posten:
            summe > 0
              ? [kat('Deko', summe)]
              : [
                  {
                    art: 'leergut',
                    text: 'Kästen',
                    anzahlMilli: 1000,
                    einzelpreisCent: -summe,
                    steuersatz: 0,
                  },
                ],
        });
      const b = await auslage(500, 'b');
      const b2 = await auslage(-500, 'c');
      const res = await t.roh('admin-token', 'POST', '/erstattungen', {
        idempotenzSchluessel: crypto.randomUUID(),
        mitgliedId: 'm2',
        belegIds: [b.id, b2.id],
        datum: '2027-02-01',
        zahlweg: 'bank',
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as Dto).error).toContain('darf nicht 0 sein');
    });

    it('manages Rechnungssteller and copies a booked Beleg to a new draft', async () => {
      const t = await belegSetup();
      expect(
        (await t.roh('admin-token', 'POST', '/rechnungssteller', { name: ' metro ' })).status,
      ).toBe(400);
      const neu = (await (
        await t.roh('admin-token', 'POST', '/rechnungssteller', { name: 'Edeka' })
      ).json()) as Dto;
      expect(
        (await t.roh('admin-token', 'PATCH', `/rechnungssteller/${neu.id}`, { name: 'METRO' }))
          .status,
      ).toBe(400);
      expect(
        (await t.roh('admin-token', 'PATCH', `/rechnungssteller/${neu.id}`, { archiviert: true }))
          .status,
      ).toBe(200);
      expect((await t.lesen<Dto[]>('admin-token', '/rechnungssteller')).map((r) => r.name)).toEqual(
        ['Metro'],
      );
      expect(
        (await t.lesen<Dto[]>('admin-token', '/rechnungssteller?archiviert=1')).map((r) => r.name),
      ).toEqual(['Edeka', 'Metro']);
      expect(
        (await t.roh('admin-token', 'PATCH', '/rechnungssteller/nix', { archiviert: true })).status,
      ).toBe(404);
      const b = await t.gebucht();
      expect(
        (await t.lesen<Dto[]>('admin-token', '/rechnungssteller'))[0]!.zuletztAm,
      ).not.toBeNull();
      const kopie = (await (
        await t.roh('admin-token', 'POST', `/belege/${b.id}/kopieren`)
      ).json()) as Dto;
      const e = await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${kopie.id}`);
      expect(e.daten).toMatchObject({
        rechnungsstellerId: t.steller,
        zahlweg: 'bank',
        datei: datei(),
      });
      expect(e.daten.posten[0].einzelpreisCent).toBe(1190);
      expect((await t.roh('admin-token', 'POST', '/belege/nix/kopieren')).status).toBe(404);
    });

    it('filters the Beleg list and prepares an upload with a duplicate hint', async () => {
      const t = await belegSetup();
      const b = await t.gebucht();
      const liste = async (q: string) =>
        (await t.lesen<Dto>('admin-token', `/belege${q}`)).belege as Dto[];
      expect(await liste('?status=gebucht')).toHaveLength(1);
      expect(await liste('?status=entwurf')).toHaveLength(0);
      expect(await liste('?zahlweg=bar')).toHaveLength(0);
      expect(await liste('?von=2027-01-06')).toHaveLength(0);
      expect(await liste(`?rechnungsstellerId=${t.steller}&bis=2027-01-05`)).toHaveLength(1);
      const body = { sha256: sha, groesse: 1000, typ: 'application/pdf', name: 'a.pdf' };
      const up = (await (
        await t.roh('admin-token', 'POST', '/beleg-dateien/upload', body)
      ).json()) as Dto;
      expect(up).toMatchObject({
        schluessel: `belege/${sha}.pdf`,
        checksumSha256: Buffer.from(sha, 'hex').toString('base64'),
        schonGebucht: { id: b.id, nummer: 'B-2027-0001' },
      });
      expect(up.uploadUrl).toContain('size=1000');
      const frei = (await (
        await t.roh('admin-token', 'POST', '/beleg-dateien/upload', {
          ...body,
          sha256: 'e'.repeat(64),
        })
      ).json()) as Dto;
      expect(frei.schonGebucht).toBeNull();
      for (const kaputt of [
        { ...body, typ: 'text/plain' },
        { ...body, groesse: 21 * 1024 * 1024 },
        { ...body, sha256: 'XYZ' },
      ])
        expect((await t.roh('admin-token', 'POST', '/beleg-dateien/upload', kaputt)).status).toBe(
          400,
        );
    });

    describe('Ware, Pfand und Leergut', () => {
      /** Seeds one Ware with a Gebinde (Kasten, 1,50 EUR Pfand), and a Warengruppe with Kategorie. */
      async function wareSetup() {
        const t = await belegSetup();
        const l = t.finanzenFake.lager;
        l.warengruppen.set('wg', {
          id: 'wg',
          name: 'Getränke',
          parentId: null,
          archiviert: false,
          kategorieId: t.kat,
        });
        l.gebinde.set('g1', {
          id: 'g1',
          menge: 20,
          einheit: 'stk',
          verpackungseinheit: 'kasten',
          pfandCent: 150,
          unterGebindeId: null,
          unterAnzahl: null,
          archiviert: false,
        });
        const wareAnlegen = (id: string) =>
          l.waren.set(id, {
            id,
            name: `Ware ${id}`,
            warengruppeId: 'wg',
            archiviert: false,
            gebindeIds: ['g1'],
          });
        wareAnlegen('w1');
        wareAnlegen('w2');
        const ware = (extra: Dto = {}) => ({
          art: 'ware',
          wareId: 'w1',
          gebindeId: 'g1',
          kategorieId: t.kat,
          anzahlMilli: 2000,
          einzelpreisCent: 1190,
          steuersatz: 1900,
          pfandCent: 150,
          ...extra,
        });
        const leergut = (extra: Dto = {}) => ({
          art: 'leergut',
          text: 'Kästen zurück',
          anzahlMilli: 1000,
          einzelpreisCent: 150,
          steuersatz: 1900,
          ...extra,
        });
        return { ...t, l, ware, leergut, wareAnlegen };
      }

      it('books Ware, Pfand and Leergut to the category and the Pfand account', async () => {
        const t = await wareSetup();
        const res = await t.gebucht({ belegsummeCent: 2530, posten: [t.ware(), t.leergut()] });
        const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${res.buchungId}`);
        // 2 x 11,90 Ware; 2 x 1,50 Pfand minus 1 x 1,50 Leergut = 1,50 on Pfand.
        expect(buchung.zeilen).toMatchObject([
          { kontoId: t.kat, betragCent: 2380, steuersatz: 1900 },
          { kontoId: 'pfand', betragCent: 150, steuersatz: 1900, steuerArt: 'vorsteuer' },
          { kontoId: 'bank', betragCent: -2530 },
        ]);
        const detail = await t.lesen<Dto>('admin-token', `/belege/${res.id}`);
        expect(detail.summeCent).toBe(2530);
        expect(detail.posten).toMatchObject([
          {
            art: 'ware',
            wareId: 'w1',
            wareName: 'Ware w1',
            text: 'Ware w1',
            pfandCent: 150,
            pfandBetragCent: 300,
            betragCent: 2380,
          },
          { art: 'leergut', kategorieId: 'pfand', text: 'Kästen zurück', betragCent: -150 },
        ]);
        const kette = await t.lesen<Dto>('admin-token', '/kette');
        expect(kette.ok).toBe(true);
      });

      it('rejects unknown, archived or foreign Ware and Gebinde', async () => {
        const t = await wareSetup();
        t.l.waren.get('w1')!.archiviert = true;
        t.l.gebinde.set('g2', { ...t.l.gebinde.get('g1')!, id: 'g2' });
        const buchen = async (posten: Dto[]) => {
          const id = await t.entwurf({ posten });
          const res = await t.buchenE(id);
          expect(res.status).toBe(400);
          return ((await res.json()) as Dto).error as string;
        };
        expect(await buchen([t.ware()])).toContain('archiviert');
        expect(await buchen([t.ware({ wareId: 'nope' })])).toContain('Die Ware gibt es nicht');
        expect(await buchen([t.ware({ wareId: 'w2', gebindeId: 'g2' })])).toContain(
          'gehört nicht zur Ware',
        );
        expect(await buchen([t.ware({ kategorieId: null })])).toContain('Kategorie');
      });

      it('lets members submit Ware items, fills the Kategorie and validates Ware and Gebinde', async () => {
        const t = await wareSetup();
        t.l.warengruppen.set('ohne', {
          id: 'ohne',
          name: 'Ohne',
          parentId: null,
          archiviert: false,
          kategorieId: null,
        });
        t.wareAnlegen('w3');
        t.l.waren.get('w3')!.warengruppeId = 'ohne';
        t.l.waren.get('w2')!.archiviert = true;
        const senden = (posten: Dto[]) =>
          t.roh('member-token', 'POST', '/einreichungen', {
            datei: datei('4'.repeat(64)),
            belegdatum: '2027-01-05',
            betragCent: 2380,
            posten,
          });
        const memberWare: Dto = { ...t.ware() };
        delete memberWare.kategorieId;
        const res = await senden([memberWare, { ...memberWare, wareId: 'w3' }]);
        expect(res.status, await res.clone().text()).toBe(201);
        const id = ((await res.json()) as Dto).id as string;
        const e = (await t.lesen<Dto>('member-token', `/einreichungen/${id}`)) as Dto;
        expect(e.posten).toMatchObject([
          { ware: 'Ware w1', anzahlMilli: 2000, kategorie: expect.any(String) },
          { ware: 'Ware w3', anzahlMilli: 2000, kategorie: null },
        ]);
        expect(e.posten[0].gebinde).toContain('Kasten');
        const fehler = async (extra: Dto) => {
          const r = await senden([{ ...memberWare, ...extra }]);
          expect(r.status).toBe(400);
          return ((await r.json()) as Dto).error as string;
        };
        expect(await fehler({ wareId: 'nope' })).toContain('Die Ware gibt es nicht');
        expect(await fehler({ wareId: 'w2' })).toContain('archiviert');
        expect(await fehler({ gebindeId: 'g9' })).toContain('gehört nicht zur Ware');
        const auswahl = await t.lesen<Dto>('member-token', '/einreichungen/auswahl');
        expect(auswahl.waren.map((w: Dto) => w.id)).toEqual(['w1', 'w3']);
      });

      it('suggests Kategorien per Artikel from booked Kategorie items, not from Ware items', async () => {
        const t = await wareSetup();
        const kat = (text: string) => ({
          kategorieId: t.kat,
          text,
          anzahlMilli: 1000,
          einzelpreisCent: 100,
          steuersatz: 0,
        });
        await t.gebucht({ belegsummeCent: 2880, posten: [kat('Deko'), kat('deko '), t.ware()] });
        await t.gebucht({ belegsummeCent: 100, posten: [kat('Kerzen')] });
        const erwartet = [
          {
            artikel: 'Deko',
            steuersatzArt: 'keine',
            kategorien: [{ kategorieId: t.kat, anzahl: 2 }],
          },
          {
            artikel: 'Kerzen',
            steuersatzArt: 'keine',
            kategorien: [{ kategorieId: t.kat, anzahl: 1 }],
          },
        ];
        expect(await t.lesen<Dto>('vorstand-token', '/artikel-vorschlaege')).toEqual(erwartet);
        expect(
          (await t.lesen<Dto>('member-token', '/einreichungen/auswahl')).artikelVorschlaege,
        ).toEqual(erwartet);
        expect((await t.roh('member-token', 'GET', '/artikel-vorschlaege')).status).toBe(403);
      });

      it('creates Artikel when booking, lists them and changes the default tax rate', async () => {
        const t = await wareSetup();
        const kat = (text: string, steuersatz: number) => ({
          kategorieId: t.kat,
          text,
          anzahlMilli: 1000,
          einzelpreisCent: 100,
          steuersatz,
        });
        await t.gebucht({ belegsummeCent: 200, posten: [kat('Deko', 700), kat('Kerzen', 1900)] });
        // A known Artikel keeps its tax rate; only new names are created.
        await t.gebucht({
          belegsummeCent: 100,
          posten: [kat(' deko', 0)],
          datei: datei('7'.repeat(64)),
        });
        const liste = await t.lesen<Dto[]>('vorstand-token', '/artikel');
        expect(liste).toMatchObject([
          {
            name: 'Deko',
            steuersatzArt: 'ermaessigt',
            kategorien: [{ kategorieId: t.kat, anzahl: 2 }],
            postenAnzahl: 2,
          },
          { name: 'Kerzen', steuersatzArt: 'regel', postenAnzahl: 1 },
        ]);
        expect(liste[0]!.zuletztAm).toEqual(expect.any(String));
        expect((await t.roh('member-token', 'GET', '/artikel')).status).toBe(403);
        const deko = liste[0]!.id as string;
        expect(
          (await t.roh('admin-token', 'PATCH', `/artikel/${deko}`, { steuersatzArt: 'regel' }))
            .status,
        ).toBe(200);
        expect((await t.lesen<Dto[]>('vorstand-token', '/artikel'))[0]).toMatchObject({
          steuersatzArt: 'regel',
        });
        expect(
          (await t.roh('admin-token', 'PATCH', `/artikel/${deko}`, { steuersatzArt: 'x' })).status,
        ).toBe(400);
        expect(
          (
            await t.roh('admin-token', 'PATCH', '/artikel/gibt-es-nicht', {
              steuersatzArt: 'keine',
            })
          ).status,
        ).toBe(404);
      });

      it('requires an Artikel on Kategorie items of a submission and ignores a Ware text', async () => {
        const t = await wareSetup();
        const senden = (posten: Dto[]) =>
          t.roh('member-token', 'POST', '/einreichungen', {
            datei: datei('5'.repeat(64)),
            belegdatum: '2027-01-05',
            betragCent: 100,
            posten,
          });
        const kat = { kategorieId: t.kat, anzahlMilli: 1000, einzelpreisCent: 100, steuersatz: 0 };
        expect((await senden([kat])).status).toBe(400);
        expect((await senden([{ ...kat, text: '  ' }])).status).toBe(400);
        expect((await senden([{ ...kat, text: 'x'.repeat(101) }])).status).toBe(400);
        expect((await senden([{ ...kat, text: 'Deko' }])).status).toBe(201);
      });

      it('warns when the stated amount differs from the sum and copies the submission data', async () => {
        const t = await wareSetup();
        const id = await t.entwurf({ eingereichtBetragCent: 1000 });
        const e = await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${id}`);
        expect(e.warnungen).toMatchObject([{ code: 'betrag_abweichung' }]);
        expect((await t.buchenE(id)).status).toBe(409);
        const res = await t.buchenE(id, { bestaetigt: ['betrag_abweichung'] });
        expect(res.status).toBe(201);
        const detail = await t.lesen<Dto>(
          'admin-token',
          `/belege/${((await res.json()) as Dto).id}`,
        );
        expect(detail).toMatchObject({ eingereichtBetragCent: 1000, eingereichtVon: null });
        // The right amount raises no warning (the duplicate file warning is another one).
        const passt = await t.entwurf({ eingereichtBetragCent: 1190 });
        const codes = (
          await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${passt}`)
        ).warnungen.map((w: Dto) => w.code);
        expect(codes).not.toContain('betrag_abweichung');
      });
    });

    describe('Warengruppe -> Kategorie', () => {
      async function gruppen() {
        const t = await belegSetup();
        const l = t.finanzenFake.lager;
        const gruppe = (id: string, parentId: string | null, kategorieId: string | null = null) =>
          l.warengruppen.set(id, { id, name: id, parentId, archiviert: false, kategorieId });
        gruppe('oben', null, t.kat);
        gruppe('unten', 'oben');
        gruppe('ohne', null);
        return { ...t, l };
      }

      it('lists the groups with the own and the inherited Kategorie', async () => {
        const t = await gruppen();
        const liste = await t.lesen<Dto[]>('admin-token', '/warengruppen-kategorien');
        expect(liste).toMatchObject([
          { id: 'oben', kategorieId: t.kat, wirksamKategorieId: t.kat },
          { id: 'ohne', kategorieId: null, wirksamKategorieId: null },
          { id: 'unten', kategorieId: null, wirksamKategorieId: t.kat },
        ]);
        expect((await t.roh('vorstand-token', 'GET', '/warengruppen-kategorien')).status).toBe(200);
      });

      it('assigns and removes a Kategorie and validates it', async () => {
        const t = await gruppen();
        const setzen = (id: string, kategorieId: string | null, token = 'admin-token') =>
          t.roh(token, 'PUT', `/warengruppen/${id}/kategorie`, { kategorieId });
        expect((await setzen('ohne', t.kat)).status).toBe(200);
        expect(t.l.warengruppen.get('ohne')!.kategorieId).toBe(t.kat);
        expect((await setzen('ohne', null)).status).toBe(200);
        expect(t.l.warengruppen.get('ohne')!.kategorieId).toBeNull();
        expect((await setzen('ohne', 'bank')).status).toBe(400);
        expect((await setzen('ohne', 'gibtsnicht')).status).toBe(400);
        expect((await setzen('nope', t.kat)).status).toBe(404);
        // Reading is not enough.
        expect((await setzen('ohne', t.kat, 'vorstand-token')).status).toBe(403);
        await t.roh('admin-token', 'PUT', `/konten/${t.kat}/archiv`, { archiviert: true });
        expect((await setzen('ohne', t.kat)).status).toBe(400);
      });

      it('offers Waren with Gebinde, deposit and the suggested Kategorie', async () => {
        const t = await gruppen();
        t.l.gebinde.set('g1', {
          id: 'g1',
          menge: 0.5,
          einheit: 'l',
          verpackungseinheit: 'flasche',
          pfandCent: 25,
          unterGebindeId: null,
          unterAnzahl: null,
          archiviert: false,
        });
        t.l.waren.set('w1', {
          id: 'w1',
          name: 'Cola',
          warengruppeId: 'unten',
          archiviert: false,
          gebindeIds: ['g1'],
          aliase: ['Coke'],
          standardGebindeId: 'g1',
        });
        t.l.waren.set('w2', {
          id: 'w2',
          name: 'Alt',
          warengruppeId: 'unten',
          archiviert: true,
          gebindeIds: [],
        });
        const waren = await t.lesen<Dto[]>('vorstand-token', '/beleg-waren');
        expect(waren).toMatchObject([
          {
            id: 'w1',
            name: 'Cola',
            aliase: ['Coke'],
            standardGebindeId: 'g1',
            kategorieId: t.kat,
            gebinde: [{ id: 'g1', pfandGesamtCent: 25 }],
          },
        ]);
        expect(waren[0]!.gebinde[0].bezeichnung).toContain('Flasche');
        // Never bought: no last price; afterwards the newest gross price per Gebinde without deposit.
        expect(waren[0]!.gebinde[0].letzterPreisCent).toBeNull();
        const ware = (preis: number) => ({
          belegsummeCent: preis + 25,
          posten: [
            {
              art: 'ware',
              wareId: 'w1',
              gebindeId: 'g1',
              kategorieId: t.kat,
              anzahlMilli: 1000,
              einzelpreisCent: preis,
              steuersatz: 1900,
              pfandCent: 25,
            },
          ],
        });
        await t.gebucht(ware(1190));
        const neuer = await t.gebucht({ ...ware(1290), belegdatum: '2027-01-08' });
        const nachher = await t.lesen<Dto[]>('vorstand-token', '/beleg-waren');
        expect(nachher[0]!.gebinde[0].letzterPreisCent).toBe(1290);
        // A reversed Beleg does not count.
        await t.anfrage('admin-token', 'POST', `/buchungen/${neuer.buchungId}/storno`, {
          datum: '2027-03-01',
          text: 'Falsch',
        });
        const danach = await t.lesen<Dto[]>('vorstand-token', '/beleg-waren');
        expect(danach[0]!.gebinde[0].letzterPreisCent).toBe(1190);
      });
    });

    describe('Einreichungen', () => {
      const einreichen = (extra: Dto = {}, token = 'member-token') => ({
        token,
        body: {
          datei: datei('3'.repeat(64)),
          belegdatum: '2027-01-05',
          betragCent: 2340,
          ...extra,
        },
      });
      const einreichung = async (
        t: Awaited<ReturnType<typeof belegSetup>>,
        extra: Dto = {},
        token = 'member-token',
      ) => {
        const e = einreichen(extra, token);
        const res = await t.roh(e.token, 'POST', '/einreichungen', e.body);
        expect(res.status, await res.clone().text()).toBe(201);
        return ((await res.json()) as Dto).id as string;
      };
      const mitPush = async (t: Awaited<ReturnType<typeof belegSetup>>) => {
        for (const sub of ['a', 'r', 'm2'])
          await t.push.store.aboSpeichern(sub, {
            endpoint: `https://push.example/${sub}`,
            keys: { p256dh: 'p', auth: 'a' },
          });
        // `r` additionally holds a Posten with finanzen:buchen
        t.posten.inhaberMitRecht.mockResolvedValue(['r']);
        t.userAdmin.rollen.mockResolvedValue(new Map([['a', ['admin']]]));
      };

      it('lets members submit Leergut items and rejects negative Anzahl or Pfand', async () => {
        const t = await belegSetup();
        const leergut: Dto = {
          art: 'leergut',
          text: 'Pfandrückgabe Kästen',
          anzahlMilli: 2000,
          einzelpreisCent: 310,
          steuersatz: 1900,
        };
        const senden = (posten: Dto[], betragCent = -620) => {
          const e = einreichen({ betragCent, posten });
          return t.roh(e.token, 'POST', '/einreichungen', e.body);
        };
        const ok = await senden([leergut]);
        expect(ok.status, await ok.clone().text()).toBe(201);
        expect((await senden([{ ...leergut, anzahlMilli: -1000 }])).status).toBe(400);
        expect((await senden([{ ...leergut, einzelpreisCent: -10 }])).status).toBe(400);
      });

      it('requires belege:einreichen and validates the required fields', async () => {
        const t = await belegSetup();
        const e = einreichen();
        const ohne = await t.app.request('/api/finanzen/einreichungen', { method: 'POST' });
        expect(ohne.status).toBe(401);
        for (const feld of ['datei', 'belegdatum', 'betragCent']) {
          const rest = Object.fromEntries(Object.entries(e.body).filter(([k]) => k !== feld));
          expect((await t.roh(e.token, 'POST', '/einreichungen', rest)).status, feld).toBe(400);
        }
        expect(
          (await t.roh(e.token, 'POST', '/einreichungen', { ...e.body, betragCent: 1.5 })).status,
        ).toBe(400);
        expect(
          (
            await t.roh(e.token, 'POST', '/einreichungen', {
              ...e.body,
              rechnungsstellerId: 'gibt-es-nicht',
            })
          ).status,
        ).toBe(400);
        const upload = await t.roh(e.token, 'POST', '/einreichungen/upload', {
          sha256: sha,
          groesse: 100,
          typ: 'application/pdf',
          name: 'beleg.pdf',
        });
        expect(upload.status).toBe(200);
      });

      it('creates an Auslage draft of the submitter, the finance side sees it in the list', async () => {
        const t = await belegSetup();
        const id = await einreichung(t, { rechnungsstellerName: 'Baumarkt', notiz: 'Kabel' });
        const e = await t.lesen<Dto>('admin-token', `/beleg-entwuerfe/${id}`);
        expect(e).toMatchObject({
          status: 'eingereicht',
          daten: {
            zahlweg: 'auslage',
            mitgliedId: 'm2',
            eingereichtBetragCent: 2340,
            rechnungsstellerName: 'Baumarkt',
            notiz: 'Kabel',
          },
          eingereichtVon: { username: 'user-m2' },
        });
        const liste = await t.lesen<Dto>('admin-token', '/belege');
        expect(liste.belege).toMatchObject([
          {
            id,
            status: 'entwurf',
            entwurfStatus: 'eingereicht',
            eingereichtVon: { username: 'user-m2', status: 'anwaerter' },
            eingereichtBetragCent: 2340,
          },
        ]);
        expect(liste.belege[0].eingereichtAm).toEqual(expect.any(String));
      });

      it('offers members only id and name of active Rechnungssteller and Aufwand Konten', async () => {
        const t = await belegSetup();
        expect((await t.app.request('/api/finanzen/einreichungen/auswahl')).status).toBe(401);
        await t.roh('admin-token', 'POST', '/rechnungssteller', { name: 'Edeka' });
        const alt = (await t.lesen<Dto[]>('admin-token', '/rechnungssteller')).find(
          (r) => r.name === 'Edeka',
        )!;
        await t.roh('admin-token', 'PATCH', `/rechnungssteller/${alt.id}`, { archiviert: true });
        const auswahl = await t.lesen<Dto>('member-token', '/einreichungen/auswahl');
        expect(auswahl.rechnungssteller.length).toBeGreaterThan(0);
        for (const r of auswahl.rechnungssteller) {
          expect(Object.keys(r).sort()).toEqual(['id', 'name']);
          expect(r.id).not.toBe(alt.id);
        }
        const aufwand = (await t.lesen<Dto[]>('admin-token', '/konten')).filter(
          (k) => k.art === 'aufwand' && !k.archiviert,
        );
        expect(auswahl.kategorien).toEqual(aufwand.map((k) => ({ id: k.id, name: k.name })));
      });

      it('shows the Posten of a submission with the Kategorie name', async () => {
        const t = await belegSetup();
        const kat = (await t.lesen<Dto[]>('admin-token', '/konten')).find(
          (k) => k.art === 'aufwand' && !k.archiviert,
        )!;
        const id = await einreichung(t, {
          posten: [
            {
              kategorieId: kat.id,
              text: 'Kabel',
              anzahlMilli: 2000,
              einzelpreisCent: 500,
              steuersatz: 1900,
            },
          ],
        });
        const detail = await t.lesen<Dto>('member-token', `/einreichungen/${id}`);
        expect(detail.posten).toEqual([
          {
            kategorie: kat.name,
            text: 'Kabel',
            betragCent: 1000,
            steuersatz: 1900,
            ware: null,
            gebinde: null,
            anzahlMilli: null,
          },
        ]);
      });

      it('shows and withdraws only own submissions, and only while submitted', async () => {
        const t = await belegSetup();
        const id = await einreichung(t, { rechnungsstellerName: 'Baumarkt' });
        const meine = await t.lesen<Dto[]>('member-token', '/einreichungen');
        expect(meine).toMatchObject([
          { id, status: 'eingereicht', betragCent: 2340, rechnungssteller: 'Baumarkt' },
        ]);
        const detail = await t.lesen<Dto>('member-token', `/einreichungen/${id}`);
        expect(detail).toMatchObject({ zurueckziehbar: true, dateiName: 'rechnung.pdf' });
        expect(detail.dateiUrl).toContain('belege/');
        expect(detail.posten).toEqual([]);
        // Foreign: not visible, not withdrawable.
        expect(await t.lesen<Dto[]>('admin-token', '/einreichungen')).toEqual([]);
        expect((await t.roh('admin-token', 'GET', `/einreichungen/${id}`)).status).toBe(404);
        expect((await t.roh('admin-token', 'DELETE', `/einreichungen/${id}`)).status).toBe(404);
        // Withdraw.
        expect((await t.roh('member-token', 'DELETE', `/einreichungen/${id}`)).status).toBe(200);
        expect((await t.roh('member-token', 'GET', `/einreichungen/${id}`)).status).toBe(404);
        // After processing: rejected and booked ones stay.
        const v = await einreichung(t);
        const zweiter = await einreichung(t, { datei: datei('4'.repeat(64)) });
        await t.roh('admin-token', 'POST', `/beleg-entwuerfe/${v}/verwerfen`, {
          grund: 'unleserlich',
        });
        expect((await t.roh('member-token', 'DELETE', `/einreichungen/${v}`)).status).toBe(409);
        const verworfen = await t.lesen<Dto>('member-token', `/einreichungen/${v}`);
        expect(verworfen).toMatchObject({
          status: 'verworfen',
          verworfenGrund: 'unleserlich',
          zurueckziehbar: false,
        });
        await t.roh('admin-token', 'PUT', `/beleg-entwuerfe/${zweiter}`, {
          daten: {
            ...t.daten({ zahlweg: 'auslage', mitgliedId: 'm2', bezahldatum: null }),
            eingereichtBetragCent: 1190,
          },
        });
        const gebucht = await t.buchenE(zweiter);
        expect(gebucht.status, await gebucht.clone().text()).toBe(201);
        const belegId = ((await gebucht.json()) as Dto).id as string;
        expect((await t.roh('member-token', 'DELETE', `/einreichungen/${zweiter}`)).status).toBe(
          404,
        );
        expect((await t.roh('member-token', 'DELETE', `/einreichungen/${belegId}`)).status).toBe(
          404,
        );
        const status = (await t.lesen<Dto[]>('member-token', '/einreichungen'))
          .map((x) => x.status)
          .sort();
        expect(status).toEqual(['gebucht', 'verworfen']);
      });

      it('rejects with a mandatory reason, only submitted drafts, and hides it from the list', async () => {
        const t = await belegSetup();
        const id = await einreichung(t);
        const verwerfen = (body: unknown, token = 'admin-token') =>
          t.roh(token, 'POST', `/beleg-entwuerfe/${id}/verwerfen`, body);
        expect((await verwerfen({}, 'member-token')).status).toBe(403);
        expect((await verwerfen({})).status).toBe(400);
        expect((await verwerfen({ grund: '   ' })).status).toBe(400);
        expect((await verwerfen({ grund: 'Doppelt' })).status).toBe(200);
        expect((await verwerfen({ grund: 'Doppelt' })).status).toBe(409);
        expect(
          (await t.roh('admin-token', 'POST', '/beleg-entwuerfe/nope/verwerfen', { grund: 'x' }))
            .status,
        ).toBe(404);
        expect((await t.lesen<Dto>('admin-token', '/belege')).belege).toEqual([]);
        // A normal draft cannot be rejected.
        const normal = await t.entwurf();
        expect(
          (
            await t.roh('admin-token', 'POST', `/beleg-entwuerfe/${normal}/verwerfen`, {
              grund: 'x',
            })
          ).status,
        ).toBe(409);
        // A rejected draft cannot be booked any more.
        expect((await t.buchenE(id)).status).toBe(400);
      });

      it('pushes: submitted goes to the finance holders except the submitter', async () => {
        const t = await belegSetup();
        await mitPush(t);
        const id = await einreichung(t);
        expect(t.gesendet.map((g) => g.endpoint).sort()).toEqual([
          'https://push.example/a',
          'https://push.example/r',
        ]);
        expect(t.gesendet[0]).toMatchObject({
          text: 'Neuer Beleg von user-m2: 23,40 €',
          url: `/app/finanzen/belege/entwurf/${id}`,
        });
        t.gesendet.length = 0;
        await einreichung(t, { datei: datei('5'.repeat(64)) }, 'admin-token');
        expect(t.gesendet.map((g) => g.endpoint)).toEqual(['https://push.example/r']);
      });

      it('pushes: booked, rejected and reimbursed go to the submitter, not on repeat', async () => {
        const t = await belegSetup();
        await mitPush(t);
        const alsAuslage = { zahlweg: 'auslage', mitgliedId: 'm2', bezahldatum: null };
        const id = await einreichung(t);
        t.gesendet.length = 0;
        await t.roh('admin-token', 'PUT', `/beleg-entwuerfe/${id}`, {
          daten: { ...t.daten(alsAuslage), eingereichtBetragCent: 2340 },
        });
        const schluessel = crypto.randomUUID();
        const buchen = () =>
          t.buchenE(id, { idempotenzSchluessel: schluessel, bestaetigt: ['betrag_abweichung'] });
        const res = await buchen();
        expect(res.status, await res.clone().text()).toBe(201);
        expect(t.gesendet).toMatchObject([
          {
            endpoint: 'https://push.example/m2',
            text: 'Dein Beleg über 23,40 € wurde gebucht.',
            url: '/app/belege',
          },
        ]);
        const belegId = ((await res.json()) as Dto).id as string;
        expect((await buchen()).status).toBe(200);
        expect(t.gesendet).toHaveLength(1);
        // Reimbursed: one push per Erstattung, only for submitted Belege.
        t.gesendet.length = 0;
        const eigener = await t.gebucht({ ...alsAuslage, datei: datei('6'.repeat(64)) });
        const erstattung = {
          idempotenzSchluessel: crypto.randomUUID(),
          mitgliedId: 'm2',
          belegIds: [belegId, eigener.id],
          datum: '2027-02-01',
          zahlweg: 'bank',
        };
        expect((await t.roh('admin-token', 'POST', '/erstattungen', erstattung)).status).toBe(201);
        expect(t.gesendet).toMatchObject([
          {
            endpoint: 'https://push.example/m2',
            text: expect.stringContaining('wurden erstattet'),
          },
        ]);
        expect(t.gesendet[0]!.text).toContain('23,40');
        expect((await t.roh('admin-token', 'POST', '/erstattungen', erstattung)).status).toBe(200);
        expect(t.gesendet).toHaveLength(1);
        // Rejected: with the reason.
        t.gesendet.length = 0;
        const v = await einreichung(t, { datei: datei('7'.repeat(64)) });
        t.gesendet.length = 0;
        await t.roh('admin-token', 'POST', `/beleg-entwuerfe/${v}/verwerfen`, {
          grund: 'unleserlich',
        });
        expect(t.gesendet).toMatchObject([
          { endpoint: 'https://push.example/m2', text: 'Dein Beleg wurde verworfen: unleserlich' },
        ]);
      });
    });

    describe('Festschreibung', () => {
      it('books a Beleg dated in a closed month on the first open day, the Belegdatum stays', async () => {
        const t = await belegSetup();
        const monat = await t.roh('admin-token', 'POST', '/festschreibungen', {
          monat: '2027-01-01',
          idempotenzSchluessel: crypto.randomUUID(),
        });
        expect(monat.status, await monat.clone().text()).toBe(201);
        const beleg = await t.gebucht();
        const detail = await t.lesen<Dto>('admin-token', `/belege/${beleg.id}`);
        expect(detail.belegdatum).toBe('2027-01-05');
        const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${beleg.buchungId}`);
        expect(buchung.datum).toBe('2027-02-01');
        expect(detail.buchungsdatum).toBe('2027-02-01');
        expect(detail.buchungVerschoben).toBe(true);
        const liste = await t.lesen<Dto>('admin-token', '/belege');
        const eintrag = (liste.belege as Dto[]).find((b) => b.id === beleg.id);
        expect(eintrag?.buchungsdatum).toBe('2027-02-01');
        expect(eintrag?.buchungVerschoben).toBe(true);
      });
    });
  });

  describe('Festschreibung', () => {
    const jetzt = (iso: string) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(iso));
    };
    afterEach(() => vi.useRealTimers());
    type Dto = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const festschreiben = (
      t: Awaited<ReturnType<typeof setup>>,
      monat: string,
      token = 'admin-token',
    ) =>
      t.roh(token, 'POST', '/festschreibungen', {
        monat,
        idempotenzSchluessel: crypto.randomUUID(),
      });

    it('needs finanzen:verwalten to close and finanzen:lesen to read', async () => {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      await t.umbuchung();
      for (const token of ['member-token', 'reader-token', 'vorstand-token'])
        expect((await festschreiben(t, '2027-01-01', token)).status, token).toBe(403);
      expect((await t.roh('vorstand-token', 'GET', '/festschreibungen')).status).toBe(200);
      expect((await t.roh('member-token', 'GET', '/festschreibungen')).status).toBe(403);
      expect((await festschreiben(t, '2027-01-15')).status).toBe(400);
    });

    it('closes month by month in order, never the current month, and replays a closed one', async () => {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      expect((await festschreiben(t, '2027-01-01')).status).toBe(409);
      await t.umbuchung();
      const leer = await t.lesen<Dto>('vorstand-token', '/festschreibungen');
      expect(leer).toMatchObject({
        festgeschriebenBis: null,
        ersterOffenerTag: null,
        naechsterMonat: '2027-01-01',
        liste: [],
      });
      const zuFrueh = await festschreiben(t, '2027-02-01');
      expect(zuFrueh.status).toBe(409);
      expect(await zuFrueh.text()).toContain('Als Nächstes ist 01/2027 dran.');
      const erste = await festschreiben(t, '2027-01-01');
      expect(erste.status, await erste.clone().text()).toBe(201);
      expect(await erste.json()).toMatchObject({ monat: '2027-01-01', bisSeq: 1, anzahl: 1 });
      expect(t.finanzarchiv.exportSchreiben.mock.calls.map((c) => c[0])).toEqual([
        'festschreibung/2027-01.jsonl',
        'festschreibung/2027-01.json',
      ]);
      expect(
        String(t.finanzarchiv.exportSchreiben.mock.calls[0]![1]).trim().split('\n'),
      ).toHaveLength(1);
      expect(JSON.parse(String(t.finanzarchiv.exportSchreiben.mock.calls[1]![1]))).toMatchObject({
        monat: '2027-01-01',
        bis_seq: 1,
        anzahl: 1,
      });
      expect((await festschreiben(t, '2027-01-01')).status).toBe(200);
      const danach = await t.lesen<Dto>('vorstand-token', '/festschreibungen');
      expect(danach).toMatchObject({
        festgeschriebenBis: '2027-01-31',
        ersterOffenerTag: '2027-02-01',
        naechsterMonat: '2027-02-01',
        liste: [{ monat: '2027-01-01', festgeschriebenVon: { username: 'user-a' } }],
      });
      // An empty month in between is closed as well; the current month is never closable.
      expect((await festschreiben(t, '2027-02-01')).status).toBe(201);
      const aktuell = await festschreiben(t, '2027-03-01');
      expect(aktuell.status).toBe(409);
      expect(await aktuell.text()).toContain('Es kann kein Monat festgeschrieben werden.');
    });

    it('refuses to close when the chain has errors or the archive is not reachable', async () => {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      await t.umbuchung();
      t.finanzarchiv.exportSchreiben.mockRejectedValueOnce(new Error('weg'));
      expect((await festschreiben(t, '2027-01-01')).status).toBe(503);
      expect((await t.lesen<Dto>('admin-token', '/festschreibungen')).liste).toEqual([]);
      t.finanzenFake.buchungen[0]!.text = 'verändert';
      const res = await festschreiben(t, '2027-01-01');
      expect(res.status).toBe(409);
      expect(await res.text()).toContain('Die Kette hat Fehler');
    });

    it('refuses free bookings and Stornos in a closed month', async () => {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      const { id } = (await (await t.umbuchung()).json()) as { id: string };
      expect((await festschreiben(t, '2027-01-01')).status).toBe(201);
      const abgelehnt = await t.umbuchung(100, { datum: '2027-01-31' });
      expect(abgelehnt.status).toBe(400);
      expect(await abgelehnt.text()).toContain(
        'Der Monat 01/2027 ist festgeschrieben. Buche mit einem Datum ab 01.02.2027.',
      );
      expect((await t.umbuchung(100, { datum: '2027-02-01' })).status).toBe(201);
      const storno = (datum: string) =>
        t.anfrage('admin-token', 'POST', `/buchungen/${id}/storno`, { datum, text: 'Falsch' });
      expect((await storno('2027-01-20')).status).toBe(400);
      expect((await storno('2027-02-02')).status).toBe(201);
    });

    it('books a Zählung dated in a closed month on the first open day', async () => {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      const fach = await t.fach();
      await t.befuellen(fach, [[500, 2]]);
      expect((await festschreiben(t, '2027-01-01')).status).toBe(201);
      const res = await t.anfrage('admin-token', 'POST', '/zaehlungen', {
        kontoId: fach,
        datum: '2027-01-10',
        ist: [{ nennwertCent: 500, anzahl: 1 }],
      });
      expect(res.status, await res.clone().text()).toBe(201);
      const z = (await res.json()) as { buchungId: string };
      expect((await t.lesen<Dto>('admin-token', `/buchungen/${z.buchungId}`)).datum).toBe(
        '2027-02-01',
      );
    });

    it('pushes the closing to the holders of finanzen:pruefen, the reminder dedupe key per week', async () => {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      for (const sub of ['a', 'r', 'v'])
        await t.push.store.aboSpeichern(sub, {
          endpoint: `https://push.example/${sub}`,
          keys: { p256dh: 'p', auth: 'a' },
        });
      t.posten.inhaberMitRecht.mockResolvedValue(['r']);
      t.userAdmin.rollen.mockResolvedValue(new Map([['a', ['admin']]]));
      await t.umbuchung();
      expect((await festschreiben(t, '2027-01-01')).status).toBe(201);
      expect(t.gesendet.map((g) => g.endpoint).sort()).toEqual([
        'https://push.example/a',
        'https://push.example/r',
      ]);
      expect(t.gesendet[0]).toMatchObject({
        text: expect.stringMatching(/^Kopf-Hash: [0-9a-f]{16}…, Nr\. bis 1$/),
        url: '/app/finanzen/festschreibung',
      });
    });

    it('returns the hints for the next month', async () => {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      await t.umbuchung();
      t.finanzenFake.hinweise.push({ art: 'beleg_entwurf', anzahl: 2, text: 'Zwei Belege' });
      expect((await t.lesen<Dto>('vorstand-token', '/festschreibungen')).hinweise).toEqual([
        { art: 'beleg_entwurf', anzahl: 2, text: 'Zwei Belege' },
      ]);
    });
  });

  describe('Datenexport', () => {
    type Dto = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const exportieren = (
      t: Awaited<ReturnType<typeof setup>>,
      token: string,
      body: unknown = { von: '2027-01-01', bis: '2027-12-31' },
    ) => t.roh(token, 'POST', '/datenexporte', body);

    it('is open to finanzen:pruefen and finanzen:verwalten, not to others', async () => {
      const t = await setup();
      for (const token of ['member-token', 'vorstand-token']) {
        expect((await exportieren(t, token)).status, token).toBe(403);
        expect((await t.roh(token, 'GET', '/datenexporte')).status, token).toBe(403);
      }
      expect((await exportieren(t, 'reader-token')).status).toBe(201);
      expect((await exportieren(t, 'admin-token')).status).toBe(201);
    });

    it('validates the period', async () => {
      const t = await setup();
      const falsch = await exportieren(t, 'admin-token', { von: '2027-02-01', bis: '2027-01-01' });
      expect(falsch.status).toBe(400);
      const zuLang = await exportieren(t, 'admin-token', { von: '2010-01-01', bis: '2020-01-01' });
      expect(zuLang.status).toBe(400);
      expect((await exportieren(t, 'admin-token', { von: 'x' })).status).toBe(400);
    });

    it('answers 503 without a Finanzarchiv', async () => {
      const t = await setup();
      (t.finanzarchiv as { eingerichtet: boolean }).eingerichtet = false;
      expect((await exportieren(t, 'admin-token')).status).toBe(503);
    });

    it('writes a ZIP with all files, records it and lists it again', async () => {
      const t = await setup();
      await t.umbuchung(500, { text: 'Text; mit "Zeichen"' });
      await t.umbuchung(700, { datum: '2028-02-01' });
      const res = await exportieren(t, 'reader-token');
      expect(res.status).toBe(201);
      const { id, url } = (await res.json()) as { id: string; url: string };
      const [schluessel, inhalt] = t.finanzarchiv.exportSchreiben.mock.calls.at(-1)!;
      expect(schluessel).toMatch(/^datenexport\/\d{8}-\d{6}-2027-01-01-2027-12-31\.zip$/);
      expect(url).toBe(`https://s3.example/finanzarchiv/${schluessel}`);
      const dateien = unzipSync(inhalt as Uint8Array);
      expect(Object.keys(dateien).sort()).toEqual(
        [
          'beschreibung.txt',
          'belege.csv',
          'belegposten.csv',
          'buchungen.csv',
          'buchungszeilen.csv',
          'festschreibungen.csv',
          'gdpdu-01-03-2019.dtd',
          'index.xml',
          'konten.csv',
          'rechnungen.csv',
          'rechnungsposten.csv',
          'rechnungssteller.csv',
          'rechnungszahlungen.csv',
          'stueckelung.csv',
        ].sort(),
      );
      const buchungen = strFromU8(dateien['buchungen.csv']!);
      expect(buchungen).toContain('05.01.2027;"Text; mit ""Zeichen"""');
      expect(buchungen).not.toContain('01.02.2028');
      expect(strFromU8(dateien['buchungszeilen.csv']!)).toContain('geldtransit;5,00');
      expect(strFromU8(dateien['index.xml']!)).toContain('gdpdu-01-03-2019.dtd');
      expect(strFromU8(dateien['gdpdu-01-03-2019.dtd']!)).toContain('<!ELEMENT DataSet');
      expect(strFromU8(dateien['beschreibung.txt']!)).toContain('01.01.2027 bis 31.12.2027');
      expect(strFromU8(dateien['konten.csv']!)).toContain('geldtransit');
      const liste = await t.lesen<Dto[]>('admin-token', '/datenexporte');
      expect(liste).toHaveLength(1);
      expect(liste[0]).toMatchObject({
        id,
        von: '2027-01-01',
        bis: '2027-12-31',
        schluessel,
        url,
        erstelltVon: { username: 'user-r', status: expect.any(String) },
      });
      expect(liste[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('with Beleg files: answers 202 and hands the order to the starter without writing', async () => {
      const t = await setup();
      const res = await exportieren(t, 'reader-token', {
        von: '2027-01-01',
        bis: '2027-12-31',
        mitBelegdateien: true,
      });
      expect(res.status).toBe(202);
      const { id, laeuft } = (await res.json()) as { id: string; laeuft: boolean };
      expect(laeuft).toBe(true);
      expect(t.datenexportStarten).toHaveBeenCalledTimes(1);
      expect(t.datenexportStarten).toHaveBeenCalledWith({
        c4: 'datenexport',
        id,
        von: '2027-01-01',
        bis: '2027-12-31',
        sub: 'r',
      });
      expect(t.finanzarchiv.exportSchreiben).not.toHaveBeenCalled();
      expect(await t.lesen<Dto[]>('admin-token', '/datenexporte')).toHaveLength(0);
    });

    it('with Beleg files: needs the right, validates, answers 503 when it cannot start', async () => {
      const t = await setup();
      const body = { von: '2027-01-01', bis: '2027-12-31', mitBelegdateien: true };
      expect((await exportieren(t, 'member-token', body)).status).toBe(403);
      expect((await exportieren(t, 'admin-token', { ...body, bis: '2026-01-01' })).status).toBe(
        400,
      );
      expect(t.datenexportStarten).not.toHaveBeenCalled();
      t.datenexportStarten.mockRejectedValueOnce(new Error('AccessDenied'));
      expect((await exportieren(t, 'admin-token', body)).status).toBe(503);
      (t.finanzarchiv as { eingerichtet: boolean }).eingerichtet = false;
      expect((await exportieren(t, 'admin-token', body)).status).toBe(503);
    });
  });

  describe('Rechnungen', () => {
    type Dto = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    afterEach(() => vi.useRealTimers());
    const jetzt = (iso: string) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(iso));
    };
    const einstellungen = {
      vereinsname: 'C4 e. V.',
      anschrift: 'Musterweg 1\n04109 Leipzig',
      steuernummer: '232/123/45678',
      bankName: 'Fyrst',
      iban: 'DE02120300000000202051',
      bic: 'BYLADEM1001',
      zahlungszielTage: 14,
    };

    /** Settings, an Erlös category, an external recipient and a Fach. */
    async function rechnungSetup(mitEinstellungen = true) {
      jetzt('2027-03-01T10:00:00Z');
      const t = await setup();
      const post = async (pfad: string, body: unknown, token = 'admin-token') =>
        (await (await t.roh(token, 'POST', pfad, body)).json()) as Dto;
      if (mitEinstellungen) {
        const res = await t.roh('admin-token', 'POST', '/rechnung-einstellungen', einstellungen);
        expect(res.status).toBe(201);
      }
      const erloes = (await post('/konten', { name: 'Erlöse Beratung', art: 'erloes' }))
        .id as string;
      const extern = (
        await post('/rechnungsempfaenger', {
          name: 'Muster GmbH',
          anschrift: 'Hauptstr. 5\n10115 Berlin',
        })
      ).id as string;
      const fach = await t.fach();
      const posten = (extra: Dto = {}) => ({
        art: 'frei',
        text: 'Beratung',
        anzahlMilli: 1000,
        einzelpreisCent: 11900,
        steuersatz: 1900,
        erloesKontoId: erloes,
        ...extra,
      });
      const daten = (extra: Dto = {}) => ({
        empfaenger: { typ: 'extern', id: extern },
        leistungVon: '2027-02-20',
        betreff: 'Beratung Februar',
        posten: [posten()],
        ...extra,
      });
      const entwurf = async (extra: Dto = {}) => {
        const res = await t.roh('admin-token', 'POST', '/rechnung-entwuerfe', {
          daten: daten(extra),
        });
        expect(res.status).toBe(201);
        return ((await res.json()) as Dto).id as string;
      };
      const stellenE = (id: string, extra: Dto = {}, token = 'admin-token') =>
        t.roh(token, 'POST', `/rechnung-entwuerfe/${id}/stellen`, {
          idempotenzSchluessel: crypto.randomUUID(),
          ...extra,
        });
      /** Drafts and issues a Rechnung; returns the result. */
      const gestellt = async (extra: Dto = {}) => {
        const res = await stellenE(await entwurf(extra));
        expect(res.status, await res.clone().text()).toBe(201);
        return (await res.json()) as Dto;
      };
      const zahlen = (id: string, extra: Dto = {}, token = 'admin-token') =>
        t.roh(token, 'POST', `/rechnungen/${id}/zahlung`, {
          idempotenzSchluessel: crypto.randomUUID(),
          zahlweg: 'bank',
          datum: '2027-03-01',
          ...extra,
        });
      const storno = (id: string, extra: Dto = {}) =>
        t.roh('admin-token', 'POST', `/rechnungen/${id}/storno`, {
          idempotenzSchluessel: crypto.randomUUID(),
          begruendung: 'Falsch ausgestellt',
          ...extra,
        });
      const saldo = async (kontoId: string) =>
        (await t.lesen<Dto[]>('admin-token', '/konten')).find((k) => k.id === kontoId)!
          .saldoCent as number;
      const bar = {
        zahlweg: 'bar',
        fachId: fach,
        stueckelung: [
          { nennwertCent: 5000, anzahl: 2 },
          { nennwertCent: 1000, anzahl: 1 },
          { nennwertCent: 500, anzahl: 1 },
          { nennwertCent: 200, anzahl: 2 },
        ],
      };
      return {
        ...t,
        erloes,
        extern,
        fach,
        posten,
        postenStore: t.posten,
        daten,
        entwurf,
        stellenE,
        gestellt,
        zahlen,
        storno,
        saldo,
        bar,
      };
    }

    it('requires the matching right on every route', async () => {
      const t = await rechnungSetup();
      const id = await t.entwurf();
      const schreiben: [string, string][] = [
        ['POST', '/rechnungsempfaenger'],
        ['PUT', '/rechnungsempfaenger/x'],
        ['POST', '/rechnung-entwuerfe'],
        ['PUT', `/rechnung-entwuerfe/${id}`],
        ['DELETE', `/rechnung-entwuerfe/${id}`],
        ['POST', `/rechnung-entwuerfe/${id}/stellen`],
        ['POST', '/rechnungen/x/zahlung'],
        ['POST', '/rechnungen/x/storno'],
        ['POST', '/rechnungen/x/kopieren'],
        ['POST', '/rechnungen/x/datei'],
        ['POST', '/rechnung-dateien/upload'],
      ];
      for (const [method, pfad] of schreiben)
        expect(
          (await t.anfrage('vorstand-token', method, pfad, {})).status,
          `${method} ${pfad}`,
        ).toBe(403);
      // finanzen:lesen alone reads but does not manage the settings.
      expect((await t.anfrage('vorstand-token', 'GET', '/rechnungen')).status).toBe(200);
      expect((await t.anfrage('vorstand-token', 'GET', '/rechnung-einstellungen')).status).toBe(
        200,
      );
      expect(
        (await t.anfrage('vorstand-token', 'POST', '/rechnung-einstellungen', {})).status,
      ).toBe(403);
      expect((await t.anfrage('member-token', 'GET', '/rechnungen')).status).toBe(403);
    });

    it('stores the settings as versions; the newest applies', async () => {
      const t = await rechnungSetup(false);
      expect(
        (await t.lesen<Dto | null>('admin-token', '/rechnung-einstellungen')) ?? null,
      ).toBeNull();
      expect(
        (await t.roh('admin-token', 'POST', '/rechnung-einstellungen', { vereinsname: 'x' }))
          .status,
      ).toBe(400);
      await t.roh('admin-token', 'POST', '/rechnung-einstellungen', einstellungen);
      await t.roh('admin-token', 'POST', '/rechnung-einstellungen', {
        ...einstellungen,
        vereinsname: 'C4 Leipzig e. V.',
      });
      const e = await t.lesen<Dto>('admin-token', '/rechnung-einstellungen');
      expect(e).toMatchObject({
        vereinsname: 'C4 Leipzig e. V.',
        zahlungszielTage: 14,
        erstelltVon: { username: 'user-a' },
      });
    });

    it('refuses to issue a Rechnung while no Vorstandsposten is staffed', async () => {
      const t = await rechnungSetup();
      const id = await t.entwurf();
      t.finanzenFake.vorstand.length = 0;
      const res = await t.stellenE(id);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await res.text()).toContain('kein Vorstandsposten');
    });

    it('lists the current Vorstand with the settings', async () => {
      const t = await rechnungSetup();
      t.postenStore.vorstandAm.mockResolvedValue([
        {
          postenId: 'vorstandsvorsitz',
          postenName: 'Vorstandsvorsitz',
          sub: 'a',
          vorname: 'A',
          nachname: 'B',
        },
      ]);
      const e = await t.lesen<Dto>('admin-token', '/rechnung-einstellungen');
      expect(e.vorstand).toMatchObject([
        { postenId: 'vorstandsvorsitz', postenName: 'Vorstandsvorsitz' },
      ]);
    });

    it('manages external recipients without duplicate names', async () => {
      const t = await rechnungSetup();
      const dup = await t.roh('admin-token', 'POST', '/rechnungsempfaenger', {
        name: ' muster gmbh ',
        anschrift: 'x',
      });
      expect(dup.status).toBe(400);
      expect(
        (
          await t.roh('admin-token', 'PUT', `/rechnungsempfaenger/${t.extern}`, {
            anschrift: 'Neue Str. 1',
            archiviert: true,
          })
        ).status,
      ).toBe(200);
      expect(await t.lesen<Dto[]>('admin-token', '/rechnungsempfaenger')).toEqual([]);
      const alle = await t.lesen<Dto[]>('admin-token', '/rechnungsempfaenger?archiviert=1');
      expect(alle).toMatchObject([
        { name: 'Muster GmbH', anschrift: 'Neue Str. 1', archiviert: true },
      ]);
      expect(
        (await t.roh('admin-token', 'PUT', '/rechnungsempfaenger/nope', { name: 'X' })).status,
      ).toBe(404);
    });

    it('issues a Rechnung: number, claim against open revenue, no revenue and no VAT yet', async () => {
      const t = await rechnungSetup();
      const id = await t.entwurf();
      const e = await t.lesen<Dto>('admin-token', `/rechnung-entwuerfe/${id}`);
      expect(e).toMatchObject({
        warnungen: [],
        empfaenger: { typ: 'extern', name: 'Muster GmbH', adresseFehlt: false },
      });
      const res = await t.stellenE(id);
      expect(res.status).toBe(201);
      const r = (await res.json()) as Dto;
      expect(r.nummer).toBe('001-2027');
      expect((await t.roh('admin-token', 'GET', `/rechnung-entwuerfe/${id}`)).status).toBe(404);
      const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${r.buchungId}`);
      expect(buchung).toMatchObject({
        quelleTyp: 'rechnung',
        quelleId: r.id,
        datum: '2027-03-01',
        text: 'Rechnung 001-2027: Muster GmbH',
      });
      expect(buchung.zeilen).toMatchObject([
        { kontoId: 'forderungen', betragCent: 11900, steuerArt: 'keine' },
        { kontoId: 'erloese_offen', betragCent: -11900, steuerArt: 'keine' },
      ]);
      expect(await t.saldo(t.erloes)).toBe(0);
      const detail = await t.lesen<Dto>('admin-token', `/rechnungen/${r.id}`);
      expect(detail).toMatchObject({
        nummer: '001-2027',
        status: 'gestellt',
        ueberfaellig: false,
        rechnungsdatum: '2027-03-01',
        faelligAm: '2027-03-15',
        bruttoCent: 11900,
        empfaengerName: 'Muster GmbH',
        empfaengerAnschrift: 'Hauptstr. 5\n10115 Berlin',
        verein: {
          vereinsname: 'C4 e. V.',
          iban: 'DE02120300000000202051',
          vorstand: 'Vorstandsvorsitz: Vera Vorstand',
        },
        summen: [{ satz: 1900, netto: 10000, steuer: 1900, brutto: 11900 }],
        zahlung: null,
        datei: null,
        stornorechnung: null,
      });
      expect(detail.posten).toMatchObject([
        {
          pos: 1,
          art: 'frei',
          text: 'Beratung',
          betragCent: 11900,
          erloesKontoName: 'Erlöse Beratung',
        },
      ]);
      const liste = await t.lesen<Dto>('admin-token', '/rechnungen');
      expect(liste).toMatchObject({
        offeneSummeCent: 11900,
        ueberfaelligAnzahl: 0,
        gekappt: false,
      });
      expect(liste.rechnungen).toMatchObject([
        { id: r.id, status: 'gestellt', nummer: '001-2027', bruttoCent: 11900 },
      ]);
      const kette = await t.lesen<Dto>('admin-token', '/kette');
      expect(kette.ok).toBe(true);
    });

    it('is idempotent and numbers gapless per year', async () => {
      const t = await rechnungSetup();
      const id = await t.entwurf();
      const schluessel = crypto.randomUUID();
      const erst = await t.stellenE(id, { idempotenzSchluessel: schluessel });
      const nochmal = await t.stellenE(id, { idempotenzSchluessel: schluessel });
      expect(erst.status).toBe(201);
      expect(nochmal.status).toBe(200);
      const a = (await erst.json()) as Dto;
      const b = (await nochmal.json()) as Dto;
      expect(b).toMatchObject({ id: a.id, nummer: '001-2027', wiederholt: true });
      expect((await t.gestellt()).nummer).toBe('002-2027');
      jetzt('2027-12-31T10:00:00Z');
      expect((await t.gestellt()).nummer).toBe('003-2027');
      jetzt('2028-01-02T10:00:00Z');
      expect((await t.gestellt()).nummer).toBe('001-2028');
      expect((await t.gestellt()).nummer).toBe('002-2028');
    });

    it('lists drafts first and filters by status, year and search', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const entwurf = await t.entwurf({ betreff: 'Noch offen' });
      const alle = await t.lesen<Dto>('admin-token', '/rechnungen');
      expect(alle.rechnungen.map((x: Dto) => [x.id, x.status])).toEqual([
        [entwurf, 'entwurf'],
        [r.id, 'gestellt'],
      ]);
      const nurEntwurf = await t.lesen<Dto>('admin-token', '/rechnungen?status=entwurf');
      expect(nurEntwurf.rechnungen).toHaveLength(1);
      expect((await t.lesen<Dto>('admin-token', '/rechnungen?jahr=2026')).rechnungen).toHaveLength(
        1,
      );
      expect((await t.lesen<Dto>('admin-token', '/rechnungen?q=001-2027')).rechnungen).toHaveLength(
        1,
      );
      expect(
        (await t.lesen<Dto>('admin-token', '/rechnungen?q=gibtsnicht')).rechnungen,
      ).toHaveLength(0);
    });

    it('asks for confirmation of warnings, errors on missing settings and invalid drafts', async () => {
      const t = await rechnungSetup();
      const id = await t.entwurf({ leistungVon: '2027-04-01' });
      const entwurf = await t.lesen<Dto>('admin-token', `/rechnung-entwuerfe/${id}`);
      expect(entwurf.warnungen.map((w: Dto) => w.code)).toEqual(['leistung_zukunft']);
      const offen = await t.stellenE(id);
      expect(offen.status).toBe(409);
      expect(((await offen.json()) as Dto).warnungen.map((w: Dto) => w.code)).toEqual([
        'leistung_zukunft',
      ]);
      const ok = await t.stellenE(id, { bestaetigt: ['leistung_zukunft'] });
      expect(ok.status).toBe(201);
      // High amount and zero price warn as well.
      const hoch = await t.entwurf({
        posten: [t.posten({ einzelpreisCent: 60000 }), t.posten({ einzelpreisCent: 0 })],
      });
      const w = await t.stellenE(hoch);
      expect(((await w.json()) as Dto).warnungen.map((x: Dto) => x.code)).toEqual([
        'hoher_betrag',
        'preis_null',
      ]);
      // An incomplete draft is an error, not a warning.
      const leer = await t.roh('admin-token', 'POST', '/rechnung-entwuerfe', { daten: {} });
      const leerId = ((await leer.json()) as Dto).id;
      const fehler = await t.stellenE(leerId);
      expect(fehler.status).toBe(400);
      expect(((await fehler.json()) as Dto).error).toContain('Bitte wähle einen Empfänger.');
      // A category that is no Erlöse account.
      const aufwand = (
        (await (
          await t.roh('admin-token', 'POST', '/konten', { name: 'Material', art: 'aufwand' })
        ).json()) as Dto
      ).id;
      const falsch = await t.stellenE(
        await t.entwurf({ posten: [t.posten({ erloesKontoId: aufwand })] }),
      );
      expect(falsch.status).toBe(400);
      expect(((await falsch.json()) as Dto).error).toContain('keine Erlös-Kategorie');
    });

    it('needs the Einstellungen to issue', async () => {
      const t = await rechnungSetup(false);
      const res = await t.stellenE(await t.entwurf());
      expect(res.status).toBe(400);
      expect(((await res.json()) as Dto).error).toContain(
        'Bitte erst die Rechnungs-Einstellungen ausfüllen.',
      );
    });

    it('addresses a member by real name and profile address; no address is an error', async () => {
      const t = await rechnungSetup();
      const empfaenger = { empfaenger: { typ: 'mitglied', sub: 'm2' } };
      const id = await t.entwurf(empfaenger);
      const vorher = await t.lesen<Dto>('admin-token', `/rechnung-entwuerfe/${id}`);
      expect(vorher.empfaenger).toMatchObject({
        typ: 'mitglied',
        name: 'A B',
        adresseFehlt: true,
        mitglied: { username: 'user-m2' },
      });
      const res = await t.stellenE(id);
      expect(res.status).toBe(400);
      expect(((await res.json()) as Dto).error).toBe(
        'Für user-m2 ist im Profil keine Adresse hinterlegt.',
      );
      await t.mitglieder.speichern('m2', {
        vorname: 'Erika',
        nachname: 'Muster',
        anrede: 'neutral',
        kontaktkanaele: null,
        discordName: null,
        adresse: 'Weg 3\n04109 Leipzig',
        telefon: null,
        ueberMich: null,
        profilbildKey: null,
        geburtsdatum: null,
        geburtstagImKalender: null,
        wohnheim: null,
      });
      const ok = await t.stellenE(id);
      expect(ok.status).toBe(201);
      const detail = await t.lesen<Dto>(
        'admin-token',
        `/rechnungen/${((await ok.json()) as Dto).id}`,
      );
      expect(detail).toMatchObject({
        empfaengerName: 'Erika Muster',
        empfaengerAnschrift: 'Weg 3\n04109 Leipzig',
        mitglied: { sub: 'm2', username: 'user-m2' },
      });
    });

    it('books the payment by bank with revenue and VAT at the payment date', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const res = await t.zahlen(r.id);
      expect(res.status).toBe(201);
      const z = (await res.json()) as Dto;
      const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${z.buchungId}`);
      expect(buchung).toMatchObject({
        quelleTyp: 'rechnungszahlung',
        quelleId: r.id,
        datum: '2027-03-01',
        text: 'Zahlung Rechnung 001-2027: Muster GmbH',
      });
      expect(buchung.zeilen).toMatchObject([
        { kontoId: 'bank', betragCent: 11900, steuerArt: 'keine' },
        { kontoId: 'forderungen', betragCent: -11900 },
        { kontoId: 'erloese_offen', betragCent: 11900 },
        {
          kontoId: t.erloes,
          betragCent: -11900,
          nettoCent: -10000,
          steuerCent: -1900,
          steuersatz: 1900,
          steuerArt: 'ust',
        },
      ]);
      expect(await t.saldo('forderungen')).toBe(0);
      expect(await t.saldo('erloese_offen')).toBe(0);
      expect(await t.saldo(t.erloes)).toBe(-11900);
      const detail = await t.lesen<Dto>('admin-token', `/rechnungen/${r.id}`);
      expect(detail).toMatchObject({
        status: 'bezahlt',
        zahlung: { zahlweg: 'bank', datum: '2027-03-01', buchungId: z.buchungId },
      });
      expect((await t.lesen<Dto>('admin-token', '/rechnungen')).offeneSummeCent).toBe(0);
    });

    it('books cash payments into a Fach with the denominations', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const falsch = await t.zahlen(r.id, {
        ...t.bar,
        stueckelung: [{ nennwertCent: 5000, anzahl: 1 }],
      });
      expect(falsch.status).toBe(400);
      expect(((await falsch.json()) as Dto).error).toContain('passt nicht zum Rechnungsbetrag');
      const ohneFach = await t.zahlen(r.id, { zahlweg: 'bar' });
      expect(ohneFach.status).toBe(400);
      const res = await t.zahlen(r.id, t.bar);
      expect(res.status, await res.clone().text()).toBe(201);
      expect(await t.saldo(t.fach)).toBe(11900);
      const buchung = await t.lesen<Dto>(
        'admin-token',
        `/buchungen/${((await res.json()) as Dto).buchungId}`,
      );
      expect(buchung.zeilen[0]).toMatchObject({ kontoId: t.fach, betragCent: 11900 });
      expect(buchung.zeilen[0].stueckelung).toHaveLength(4);
    });

    it('books card payments against the SumUp account', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      expect((await t.zahlen(r.id, { zahlweg: 'sumup' })).status).toBe(201);
      expect(await t.saldo('sumup')).toBe(11900);
      expect(await t.saldo('bank')).toBe(0);
    });

    it('rejects a second payment, is idempotent and checks the payment date', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      // Future payment date: error; before the Rechnungsdatum: warning.
      const zukunft = await t.zahlen(r.id, { datum: '2027-03-05' });
      expect(zukunft.status).toBe(400);
      const vor = await t.zahlen(r.id, { datum: '2027-02-27' });
      expect(vor.status).toBe(409);
      expect(((await vor.json()) as Dto).warnungen).toMatchObject([
        { code: 'zahlung_vor_rechnung' },
      ]);
      const schluessel = crypto.randomUUID();
      const erst = await t.zahlen(r.id, { idempotenzSchluessel: schluessel });
      expect(erst.status).toBe(201);
      const nochmal = await t.zahlen(r.id, { idempotenzSchluessel: schluessel });
      expect(nochmal.status).toBe(200);
      expect(((await nochmal.json()) as Dto).wiederholt).toBe(true);
      const doppelt = await t.zahlen(r.id);
      expect(doppelt.status).toBe(409);
      expect(((await doppelt.json()) as Dto).error).toBe('Die Rechnung ist schon bezahlt.');
      expect(await t.saldo('bank')).toBe(11900);
      expect((await t.zahlen('nope')).status).toBe(404);
    });

    it('does not reverse the Stellungsbuchung in the journal, but the payment', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const storno = (buchungId: string) =>
        t.anfrage('admin-token', 'POST', `/buchungen/${buchungId}/storno`, {
          datum: '2027-03-01',
          text: 'Falsch',
        });
      const abgelehnt = await storno(r.buchungId);
      expect(abgelehnt.status).toBe(409);
      expect(((await abgelehnt.json()) as Dto).error).toContain('Stornorechnung');
      const z = (await (await t.zahlen(r.id)).json()) as Dto;
      expect((await storno(z.buchungId)).status).toBe(201);
      expect((await t.lesen<Dto>('admin-token', `/rechnungen/${r.id}`)).status).toBe('gestellt');
    });

    it('pays a Rechnung again after the payment booking was reversed in the journal', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const z = (await (await t.zahlen(r.id)).json()) as Dto;
      const stornoBuchung = await t.anfrage(
        'admin-token',
        'POST',
        `/buchungen/${z.buchungId}/storno`,
        {
          datum: '2027-03-01',
          text: 'Zahlung falsch zugeordnet',
        },
      );
      expect(stornoBuchung.status).toBe(201);
      expect((await t.lesen<Dto>('admin-token', `/rechnungen/${r.id}`)).status).toBe('gestellt');
      expect((await t.zahlen(r.id)).status).toBe(201);
    });

    it('cancels an unpaid Rechnung with a Stornorechnung from the same number sequence', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const res = await t.storno(r.id);
      expect(res.status).toBe(201);
      const s = (await res.json()) as Dto;
      expect(s.nummer).toBe('002-2027');
      const buchung = await t.lesen<Dto>('admin-token', `/buchungen/${s.buchungId}`);
      expect(buchung).toMatchObject({
        quelleTyp: 'storno',
        text: expect.stringContaining('Stornorechnung 002-2027 zu 001-2027'),
      });
      expect(await t.saldo('forderungen')).toBe(0);
      expect(await t.saldo('erloese_offen')).toBe(0);
      const original = await t.lesen<Dto>('admin-token', `/rechnungen/${r.id}`);
      expect(original).toMatchObject({
        status: 'storniert',
        stornorechnung: { id: s.id, nummer: '002-2027' },
      });
      const storno = await t.lesen<Dto>('admin-token', `/rechnungen/${s.id}`);
      expect(storno).toMatchObject({
        istStorno: true,
        status: 'storniert',
        bruttoCent: -11900,
        stornoBegruendung: 'Falsch ausgestellt',
        stornoVon: { id: r.id, nummer: '001-2027' },
        summen: [{ satz: 1900, netto: -10000, steuer: -1900, brutto: -11900 }],
      });
      expect(storno.posten[0]).toMatchObject({ anzahlMilli: -1000, betragCent: -11900 });
      // Neither again nor pay, neither the Stornorechnung itself.
      expect((await t.storno(r.id)).status).toBe(409);
      expect((await t.storno(s.id)).status).toBe(409);
      expect((await t.zahlen(r.id)).status).toBe(409);
      expect((await t.zahlen(s.id)).status).toBe(409);
      expect((await t.lesen<Dto>('admin-token', '/rechnungen')).offeneSummeCent).toBe(0);
      expect((await t.lesen<Dto>('admin-token', '/kette')).ok).toBe(true);
    });

    it('refuses to cancel a paid Rechnung until the payment is reversed', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const z = (await (await t.zahlen(r.id)).json()) as Dto;
      const abgelehnt = await t.storno(r.id);
      expect(abgelehnt.status).toBe(409);
      expect(((await abgelehnt.json()) as Dto).error).toContain('Zahlungsbuchung');
      await t.anfrage('admin-token', 'POST', `/buchungen/${z.buchungId}/storno`, {
        datum: '2027-03-01',
        text: 'Falsch',
      });
      expect((await t.storno(r.id)).status).toBe(201);
    });

    it('requires a reason for the Stornorechnung', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      expect((await t.storno(r.id, { begruendung: ' ' })).status).toBe(400);
      expect((await t.storno('nope')).status).toBe(404);
    });

    it('copies an issued Rechnung into a new draft', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const res = await t.roh('admin-token', 'POST', `/rechnungen/${r.id}/kopieren`);
      expect(res.status).toBe(201);
      const e = await t.lesen<Dto>(
        'admin-token',
        `/rechnung-entwuerfe/${((await res.json()) as Dto).id}`,
      );
      expect(e.daten).toMatchObject({
        empfaenger: { typ: 'extern', id: t.extern },
        betreff: 'Beratung Februar',
        leistungVon: null,
        posten: [{ art: 'frei', text: 'Beratung', einzelpreisCent: 11900 }],
      });
      const s = (await (await t.storno(r.id)).json()) as Dto;
      expect((await t.roh('admin-token', 'POST', `/rechnungen/${s.id}/kopieren`)).status).toBe(409);
      expect((await t.roh('admin-token', 'POST', '/rechnungen/nope/kopieren')).status).toBe(404);
    });

    it('registers one PDF per Rechnung in the archive', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      const sha = 'b'.repeat(64);
      const upload = await t.roh('admin-token', 'POST', '/rechnung-dateien/upload', {
        rechnungId: r.id,
        sha256: sha,
        groesse: 1234,
      });
      expect(upload.status).toBe(200);
      expect(((await upload.json()) as Dto).schluessel).toBe(`rechnungen/${sha}.pdf`);
      expect(
        (
          await t.roh('admin-token', 'POST', '/rechnung-dateien/upload', {
            rechnungId: 'nope',
            sha256: sha,
            groesse: 1,
          })
        ).status,
      ).toBe(404);
      const reg = await t.roh('admin-token', 'POST', `/rechnungen/${r.id}/datei`, {
        sha256: sha,
        groesse: 1234,
      });
      expect(reg.status).toBe(201);
      const nochmal = await t.roh('admin-token', 'POST', `/rechnungen/${r.id}/datei`, {
        sha256: 'c'.repeat(64),
        groesse: 5,
      });
      expect(nochmal.status).toBe(409);
      const detail = await t.lesen<Dto>('admin-token', `/rechnungen/${r.id}`);
      expect(detail.datei).toMatchObject({
        sha256: sha,
        groesse: 1234,
        url: `https://s3.example/finanzarchiv/rechnungen/${sha}.pdf`,
      });
      expect(
        (await t.roh('admin-token', 'POST', '/rechnungen/nope/datei', { sha256: sha, groesse: 1 }))
          .status,
      ).toBe(404);
    });

    it('answers 503 for the PDF without a Finanzarchiv', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      (t.finanzarchiv as { eingerichtet: boolean }).eingerichtet = false;
      const sha = 'b'.repeat(64);
      expect(
        (
          await t.roh('admin-token', 'POST', '/rechnung-dateien/upload', {
            rechnungId: r.id,
            sha256: sha,
            groesse: 1,
          })
        ).status,
      ).toBe(503);
      expect(
        (
          await t.roh('admin-token', 'POST', `/rechnungen/${r.id}/datei`, {
            sha256: sha,
            groesse: 1,
          })
        ).status,
      ).toBe(503);
    });

    it('marks an unpaid Rechnung overdue after the due date', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      jetzt('2027-03-20T10:00:00Z');
      const liste = await t.lesen<Dto>('admin-token', '/rechnungen');
      expect(liste).toMatchObject({ offeneSummeCent: 11900, ueberfaelligAnzahl: 1 });
      expect(liste.rechnungen[0]).toMatchObject({
        id: r.id,
        status: 'gestellt',
        ueberfaellig: true,
      });
    });

    it('exports Rechnungen, items and payments in the Datenexport', async () => {
      const t = await rechnungSetup();
      const r = await t.gestellt();
      await t.zahlen(r.id);
      const res = await t.roh('admin-token', 'POST', '/datenexporte', {
        von: '2027-01-01',
        bis: '2027-12-31',
      });
      expect(res.status).toBe(201);
      const [, inhalt] = t.finanzarchiv.exportSchreiben.mock.calls.at(-1)!;
      const dateien = unzipSync(inhalt as Uint8Array);
      expect(strFromU8(dateien['rechnungen.csv']!)).toContain('001-2027;01.03.2027');
      expect(strFromU8(dateien['rechnungsposten.csv']!)).toContain(`${r.id};1;frei;Beratung`);
      expect(strFromU8(dateien['rechnungszahlungen.csv']!)).toContain(`${r.id};bank;01.03.2027`);
    });
  });
});
