import { describe, expect, it } from 'vitest';
import { makeApp, bearer } from '../test/appTestHelfer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dto = Record<string, any>;

describe('finanzen Auswertungen', () => {
  function setup() {
    const t = makeApp();
    // 'vorstand-token' (v) may only read.
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['finanzen:lesen' as const] : [],
    );
    const lesen = (token: string, pfad: string) =>
      t.app.request(`/api/finanzen/auswertungen${pfad}`, { headers: bearer(token) });
    const json = async (pfad: string) =>
      (await (await lesen('vorstand-token', pfad)).json()) as Dto;
    const buchen = (body: Dto) =>
      t.app.request('/api/finanzen/buchungen', {
        method: 'POST',
        headers: { ...bearer('admin-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ idempotenzSchluessel: crypto.randomUUID(), ...body }),
      });
    return { ...t, lesen, json, buchen };
  }
  const ZEITRAUM = '?von=2027-03-01&bis=2027-04-30&intervall=monat';

  it('requires finanzen:lesen', async () => {
    const t = setup();
    for (const pfad of [
      `/ust${ZEITRAUM}`,
      `/guv${ZEITRAUM}`,
      `/euer?jahr=2027`,
      `/events${ZEITRAUM}`,
      `/einkauf?vonJahr=2027&bisJahr=2027`,
    ]) {
      expect((await t.lesen('member-token', pfad)).status, pfad).toBe(403);
      expect((await t.lesen('vorstand-token', pfad)).status, pfad).toBe(200);
    }
  });

  it('validates the query', async () => {
    const t = setup();
    for (const pfad of [
      '/ust',
      '/ust?von=2027-04-01&bis=2027-03-01',
      '/guv?von=2027-03-01&bis=2027-04-30&intervall=woche',
      '/events?von=kaputt&bis=2027-04-30',
      '/euer',
      '/euer?jahr=1999',
      '/einkauf?jahr=2027',
      '/einkauf?vonJahr=abc&bisJahr=2027',
      '/einkauf?vonJahr=2028&bisJahr=2027',
      '/einkauf?vonJahr=2010&bisJahr=2030',
    ])
      expect((await t.lesen('vorstand-token', pfad)).status, pfad).toBe(400);
  });

  it('calculates USt, G+V and EÜR from a booked revenue', async () => {
    const t = setup();
    // 119,00 € gross card revenue: 100,00 € net + 19,00 € USt, booked on 2027-03-10
    const res = await t.buchen({
      datum: '2027-03-10',
      text: 'Kartenumsatz',
      quelleTyp: 'umbuchung',
      zeilen: [
        { kontoId: 'bank', betragCent: 11_900 },
        {
          kontoId: 'kartenerloese',
          betragCent: -11_900,
          nettoCent: -10_000,
          steuerCent: -1_900,
          steuersatz: 1900,
          steuerArt: 'ust',
        },
      ],
    });
    expect(res.status, await res.clone().text()).toBe(201);

    const ust = await t.json(`/ust${ZEITRAUM}`);
    expect(ust.zeitraeume.map((z: Dto) => z.schluessel)).toEqual(['2027-03', '2027-04']);
    expect(ust.zeitraeume[0].kennzahlen).toEqual({
      kz81Cent: 10_000,
      kz81UstCent: 1_900,
      kz86Cent: 0,
      kz86UstCent: 0,
      kz66Cent: 0,
      kz83Cent: 1_900,
    });
    expect(ust.zeitraeume[1].zeilen).toEqual([]);

    const guv = await t.json(`/guv${ZEITRAUM}`);
    expect(guv.erloese).toMatchObject([{ kontoId: 'kartenerloese', werteCent: [10_000, 0] }]);
    expect(guv.gesamt.ergebnisCent).toBe(10_000);

    const euer = await t.json('/euer?jahr=2027');
    const zeile = (z: string) => euer.zeilen.find((x: Dto) => x.zeile === z);
    expect(zeile('umsatz').betragCent).toBe(10_000);
    expect(zeile('ust_vereinnahmt').betragCent).toBe(1_900);
    expect(euer.nichtZugeordnet).toEqual([]);
    expect(euer.ueberschussCent).toBe(11_900);
  });

  it('returns empty events and Einkauf without data', async () => {
    const t = setup();
    const events = await t.json(`/events${ZEITRAUM}`);
    expect(events.events).toEqual([]);
    expect(events.verlauf.zeitraeume).toHaveLength(2);
    const einkauf = await t.json('/einkauf?vonJahr=2027&bisJahr=2028');
    expect(einkauf).toMatchObject({ vonJahr: 2027, bisJahr: 2028, nettoCent: 0, bruttoCent: 0 });
    expect(einkauf.waren).toEqual([]);
    expect(einkauf.pfand).toEqual({ anfangCent: 0, zugangCent: 0, abgangCent: 0, endeCent: 0 });
  });
});
