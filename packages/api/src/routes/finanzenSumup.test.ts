import { describe, expect, it } from 'vitest';
import { makeApp, bearer } from '../test/appTestHelfer';
import type { SumupTransaktionRoh } from '../sumup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dto = Record<string, any>;

const tx = (id: string, zeitpunkt: string, betragCent = 1000): SumupTransaktionRoh => ({
  id,
  transactionCode: `TC${id}`,
  zeitpunkt,
  betragCent,
  typ: 'PAYMENT',
  status: 'SUCCESSFUL',
  trinkgeldCent: 0,
  sumupBenutzer: null,
  roh: '{}',
});

describe('finanzen SumUp', () => {
  function setup() {
    const t = makeApp();
    // 'vorstand-token' (v) may only read.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['finanzen:lesen' as const] : [],
    );
    const anfrage = (token: string, method: string, pfad: string, body?: unknown) =>
      t.app.request(`/api/finanzen${pfad}`, {
        method,
        headers: { ...bearer(token), 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const buchen = (transaktionIds: string[], eventId: string | null = null, extra: Dto = {}) =>
      anfrage('admin-token', 'POST', '/sumup/buchen', {
        transaktionIds,
        eventId,
        idempotenzSchluessel: crypto.randomUUID(),
        ...extra,
      });
    const uebersicht = async () =>
      (await (await anfrage('admin-token', 'GET', '/sumup')).json()) as Dto;
    t.sumupApi.state.transaktionen.push(
      tx('t1', '2026-11-07T20:00:00.000Z', 1000),
      tx('t2', '2026-11-07T21:00:00.000Z', 2500),
    );
    t.finanzenFake.events.set('e1', {
      titel: 'Cocktailabend',
      kategorie: 'kat',
      beginn: '2026-11-07T18:00:00.000Z',
      ende: '2026-11-07T23:00:00.000Z',
      abgesagt: false,
    });
    return { ...t, anfrage, buchen, uebersicht };
  }

  it('requires the matching right', async () => {
    const t = setup();
    const routen: [string, string, string][] = [
      ['GET', '/sumup', 'lesen'],
      ['POST', '/sumup/abruf', 'buchen'],
      ['POST', '/sumup/buchen', 'buchen'],
    ];
    for (const [method, pfad, recht] of routen) {
      const body = method === 'POST' ? {} : undefined;
      expect((await t.anfrage('member-token', method, pfad, body)).status).toBe(403);
      const leser = await t.anfrage('vorstand-token', method, pfad, body);
      expect(leser.status === 403, `${method} ${pfad}`).toBe(recht === 'buchen');
    }
  });

  it('fetches and shows groups with the suggested event, payouts and balance', async () => {
    const t = setup();
    t.sumupApi.state.auszahlungen.push({
      id: 'p1',
      datum: '2026-11-09',
      typ: 'PAYOUT',
      betragCent: 3400,
      gebuehrCent: 100,
      transactionCode: null,
      referenz: null,
      status: 'SUCCESSFUL',
      roh: '{}',
    });
    const abruf = await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    expect(abruf.status).toBe(200);
    expect(await abruf.json()).toEqual({
      transaktionenNeu: 2,
      auszahlungenNeu: 1,
      vollstaendig: true,
    });
    const u = await t.uebersicht();
    expect(u.gruppen).toHaveLength(1);
    expect(u.gruppen[0]).toMatchObject({
      eventId: 'e1',
      eventTitel: 'Cocktailabend',
      summeCent: 3500,
      anzahl: 2,
    });
    expect(u.events.map((e: Dto) => e.id)).toEqual(['e1']);
    expect(u.auszahlungen[0]).toMatchObject({
      datum: '2026-11-09',
      nettoCent: 3400,
      status: 'offen',
    });
    expect(u.letzterAbrufAm).toBeTruthy();
    expect(u.saldoCent).toBe(0);
  });

  it('answers 409 when SumUp is not set up', async () => {
    const t = setup();
    t.sumupSecret.wert = undefined;
    const res = await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    expect(res.status).toBe(409);
    expect(((await res.json()) as Dto).error).toBe('SumUp ist noch nicht eingerichtet.');
  });

  it('books a group with the event, idempotently', async () => {
    const t = setup();
    await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    const key = crypto.randomUUID();
    const res = await t.buchen(['t2', 't1'], 'e1', { idempotenzSchluessel: key });
    expect(res.status).toBe(201);
    const gebucht = (await res.json()) as Dto;
    const buchung = t.finanzenFake.buchungen.find((b) => b.id === gebucht.id)!;
    expect(buchung).toMatchObject({
      quelleTyp: 'sumup',
      quelleId: 't1',
      eventId: 'e1',
      datum: '2026-11-07',
      text: 'SumUp Cocktailabend',
    });
    expect(buchung.zeilen.map((z) => [z.kontoId, z.betragCent])).toEqual([
      ['sumup', 3500],
      ['kartenerloese', -3500],
    ]);
    const wieder = await t.buchen(['t2', 't1'], 'e1', { idempotenzSchluessel: key });
    expect(wieder.status).toBe(200);
    expect(((await wieder.json()) as Dto).id).toBe(gebucht.id);
    expect(t.finanzenFake.buchungen).toHaveLength(1);
    expect((await t.uebersicht()).gruppen).toEqual([]);
    expect((await t.uebersicht()).saldoCent).toBe(3500);
  });

  it('rejects a second booking of the same transactions', async () => {
    const t = setup();
    await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    expect((await t.buchen(['t1'])).status).toBe(201);
    const zweite = await t.buchen(['t1', 't2']);
    expect(zweite.status).toBe(409);
    expect(((await zweite.json()) as Dto).error).toBe('Mindestens eine Zahlung ist schon gebucht.');
  });

  it('opens the transactions again after a Storno', async () => {
    const t = setup();
    await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    const gebucht = (await (await t.buchen(['t1', 't2'], 'e1')).json()) as Dto;
    const storno = await t.anfrage('admin-token', 'POST', `/buchungen/${gebucht.id}/storno`, {
      datum: '2026-11-08',
      text: 'Falsch',
      idempotenzSchluessel: crypto.randomUUID(),
    });
    expect(storno.status).toBe(201);
    expect((await t.uebersicht()).gruppen[0]).toMatchObject({ summeCent: 3500 });
    expect((await t.buchen(['t1', 't2'], 'e1')).status).toBe(201);
  });

  it('moves the booking out of a closed month like a Kassenabrechnung', async () => {
    const t = setup();
    await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    t.finanzenFake.festschreibungenListe.push({
      id: 'f1',
      monat: '2026-11-01',
      bisSeq: 0,
      kopfHash: '',
      anzahl: 0,
      exportSchluessel: '',
      festgeschriebenVon: 'a',
      festgeschriebenAm: new Date(),
    });
    const res = await t.buchen(['t1'], 'e1');
    expect(res.status).toBe(201);
    expect(((await res.json()) as Dto).datum).toBe('2026-12-01');
  });

  it('rejects a cancelled event, an unknown event and an unknown transaction', async () => {
    const t = setup();
    await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    t.finanzenFake.events.get('e1')!.abgesagt = true;
    const abgesagt = await t.buchen(['t1'], 'e1');
    expect(abgesagt.status).toBe(400);
    expect(((await abgesagt.json()) as Dto).error).toContain('abgesagt');
    expect((await t.buchen(['t1'], 'gibtsnicht')).status).toBe(400);
    expect((await t.buchen(['nix'])).status).toBe(404);
    expect((await t.buchen([])).status).toBe(400);
  });

  it('books a day without an event by the business day of the first transaction', async () => {
    const t = setup();
    t.sumupApi.state.transaktionen.push(tx('n1', '2026-11-12T01:30:00.000Z', 700));
    await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    const res = await t.buchen(['n1']);
    expect(res.status).toBe(201);
    // 02:30 local time still belongs to the previous business day.
    expect(((await res.json()) as Dto).datum).toBe('2026-11-11');
  });

  it('rejects a sum of 0', async () => {
    const t = setup();
    t.sumupApi.state.transaktionen.push(tx('z1', '2026-11-12T20:00:00.000Z', 500), {
      ...tx('z2', '2026-11-12T20:05:00.000Z', -500),
      typ: 'REFUND',
    });
    await t.anfrage('admin-token', 'POST', '/sumup/abruf');
    expect((await t.buchen(['z1', 'z2'])).status).toBe(400);
  });
});
