import { describe, expect, it } from 'vitest';
import type { Gebinde, LagerAbgleichDto, LagerAbgleichWareDto } from '@c4/shared';
import { makeApp, bearer } from '../test/appTestHelfer';

const flasche: Gebinde = {
  id: 'f',
  menge: 0.5,
  einheit: 'l',
  verpackungseinheit: 'flasche',
  pfandCent: 8,
  unterGebindeId: null,
  unterAnzahl: null,
};
const kasten: Gebinde = {
  id: 'k',
  menge: null,
  einheit: null,
  verpackungseinheit: 'kasten',
  pfandCent: null,
  unterGebindeId: 'f',
  unterAnzahl: 20,
};

describe('lager-abgleich', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  /** v: finanzen:lesen, w: waren:verwalten, b: finanzen:buchen, m2: nothing. */
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
      sub === 'v' ? ['finanzen:lesen' as const] : sub === 'r' ? ['waren:verwalten' as const] : [],
    );
    const z = t.lagerAbgleichFake.zustand;
    z.waren = [{ id: 'w1', name: 'Cola', warengruppe: 'Softdrinks', gebinde: [flasche, kasten] }];
    z.alleGebinde = [flasche, kasten];
    const roh = (token: string, method: string, pfad: string, body?: unknown) =>
      t.app.request(`/api/lager-abgleich${pfad}`, json(token, method, body));
    return { t, z, roh };
  }

  it('without a Stichtag the list is empty', async () => {
    const { roh } = await setup();
    const res = await roh('admin-token', 'GET', '');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stichtag: null, waren: [] });
  });

  it('checks permissions: read = finanzen:lesen or waren:verwalten, write = finanzen:buchen or waren:verwalten', async () => {
    const { roh } = await setup();
    expect((await roh('member-token', 'GET', '')).status).toBe(403);
    expect((await roh('vorstand-token', 'GET', '')).status).toBe(200);
    expect((await roh('reader-token', 'GET', '')).status).toBe(200);
    const stichtag = { stichtag: '2026-01-01' };
    expect((await roh('member-token', 'PUT', '/stichtag', stichtag)).status).toBe(403);
    expect((await roh('vorstand-token', 'PUT', '/stichtag', stichtag)).status).toBe(403);
    expect((await roh('reader-token', 'PUT', '/stichtag', stichtag)).status).toBe(200);
    expect((await roh('admin-token', 'PUT', '/stichtag', stichtag)).status).toBe(200);
    expect((await roh('member-token', 'GET', '/waren/w1')).status).toBe(403);
    const korrektur = { wareId: 'w1', menge: 1, grund: 'bruch', datum: '2026-02-01' };
    expect((await roh('vorstand-token', 'POST', '/korrekturen', korrektur)).status).toBe(403);
  });

  it('validates the Stichtag', async () => {
    const { roh } = await setup();
    expect((await roh('admin-token', 'PUT', '/stichtag', { stichtag: '2026-13-01' })).status).toBe(
      400,
    );
    expect((await roh('admin-token', 'PUT', '/stichtag', {})).status).toBe(400);
  });

  it('computes through the API: Stichtag boundary, Storno excluded, mixed texts, timeline links', async () => {
    const { roh, z } = await setup();
    await roh('admin-token', 'PUT', '/stichtag', { stichtag: '2026-02-01' });
    z.ist = [
      { wareId: 'w1', datum: '2026-01-31', menge: 999, vorgangId: 'alt', lagerortName: 'Keller' },
      { wareId: 'w1', datum: '2026-02-01', menge: 60, vorgangId: 'v1', lagerortName: 'Keller' },
    ];
    z.soll = [
      {
        wareId: 'w1',
        datum: '2026-02-02',
        menge: 40,
        belegId: 'b1',
        belegNummer: 'B-2026-0001',
        storniert: false,
      },
      {
        wareId: 'w1',
        datum: '2026-02-03',
        menge: 20,
        belegId: 'b2',
        belegNummer: 'B-2026-0002',
        storniert: true,
      },
      {
        wareId: 'w1',
        datum: '2026-01-31',
        menge: 5,
        belegId: 'b0',
        belegNummer: 'B-2026-0000',
        storniert: false,
      },
    ];
    const liste = (await (await roh('vorstand-token', 'GET', '')).json()) as LagerAbgleichDto;
    expect(liste.stichtag).toBe('2026-02-01');
    expect(liste.waren).toHaveLength(1);
    expect(liste.waren[0]).toMatchObject({
      wareId: 'w1',
      name: 'Cola',
      warengruppe: 'Softdrinks',
      ist: 60,
      soll: 40,
      korrektur: 0,
      diskrepanz: 20,
      istText: '3 Kästen',
      sollText: '2 Kästen',
      diskrepanzText: '1 Kasten',
    });

    const ok = await roh('reader-token', 'POST', '/korrekturen', {
      wareId: 'w1',
      menge: 3,
      grund: 'bruch',
      datum: '2026-02-04',
    });
    expect(ok.status).toBe(201);

    const detail = (await (
      await roh('vorstand-token', 'GET', '/waren/w1')
    ).json()) as LagerAbgleichWareDto;
    expect(detail.ware.diskrepanz).toBe(17);
    expect(detail.ware.diskrepanzText).toBe('17 Flaschen');
    expect(detail.zeitleiste.map((e) => [e.art, e.menge, e.diskrepanz])).toEqual([
      ['ist', 60, 60],
      ['soll', 40, 20],
      ['korrektur', 3, 17],
    ]);
    expect(detail.zeitleiste[0]).toMatchObject({ vorgangId: 'v1', lagerortName: 'Keller' });
    expect(detail.zeitleiste[1]).toMatchObject({ belegId: 'b1', belegNummer: 'B-2026-0001' });
    expect(detail.zeitleiste[2]).toMatchObject({
      grund: 'bruch',
      person: { username: 'user-r', status: expect.any(String) },
    });
  });

  it('returns 404 for an unknown Ware', async () => {
    const { roh } = await setup();
    await roh('admin-token', 'PUT', '/stichtag', { stichtag: '2026-02-01' });
    expect((await roh('admin-token', 'GET', '/waren/nix')).status).toBe(404);
  });

  describe('POST /korrekturen', () => {
    const gueltig = { wareId: 'w1', menge: -2, grund: 'haendler', datum: '2026-02-01' };

    it('needs a Stichtag', async () => {
      const { roh } = await setup();
      expect((await roh('admin-token', 'POST', '/korrekturen', gueltig)).status).toBe(409);
    });

    it('validates the input', async () => {
      const { roh, z } = await setup();
      await roh('admin-token', 'PUT', '/stichtag', { stichtag: '2026-02-01' });
      const post = (b: unknown) => roh('admin-token', 'POST', '/korrekturen', b);
      expect((await post({ ...gueltig, menge: 0 })).status).toBe(400);
      expect((await post({ ...gueltig, menge: 1.5 })).status).toBe(400);
      expect((await post({ ...gueltig, grund: 'egal' })).status).toBe(400);
      expect((await post({ ...gueltig, grund: 'sonstiges' })).status).toBe(400);
      expect((await post({ ...gueltig, datum: '2999-01-01' })).status).toBe(400);
      expect((await post({ ...gueltig, datum: '2026-01-31' })).status).toBe(400);
      expect((await post({ ...gueltig, wareId: 'nix' })).status).toBe(404);
      expect(z.korrekturen).toHaveLength(0);
      expect(
        (await post({ ...gueltig, grund: 'sonstiges', text: 'Palette umgekippt' })).status,
      ).toBe(201);
      expect(z.korrekturen[0]).toMatchObject({
        menge: -2,
        text: 'Palette umgekippt',
        erstelltVon: 'a',
      });
    });
  });
});
