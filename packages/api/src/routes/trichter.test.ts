import { describe, expect, it } from 'vitest';
import { type DurchgaengeSeiteDto, type TrichterUebersichtDto } from '@c4/shared';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('trichter', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  /** Profiles for a (admin), r, v, m2 with usernames `user-<sub>`; one funnel of 3 l with 2 outlets. */
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
      sub === 'v' ? ['trichter:verwalten' as const] : [],
    );
    const res = await t.app.request(
      '/api/trichter',
      json('admin-token', 'POST', { name: 'Dicker', volumenL: 3, auslaesse: 2 }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const eintragen = (token: string, body: Record<string, unknown>) =>
      t.app.request(
        '/api/trichter/durchgaenge',
        json(token, 'POST', { trichterId: id, volumenL: 2, teilnehmende: ['m2'], ...body }),
      );
    return { ...t, id, eintragen };
  }

  it('lets everyone read but only the management change funnels', async () => {
    const t = await setup();
    const liste = await t.app.request('/api/trichter', json('member-token', 'GET'));
    expect(await liste.json()).toEqual([
      { id: t.id, name: 'Dicker', volumenMl: 3000, auslaesse: 2, archiviert: false },
    ]);
    const body = { name: 'Neu', volumenL: 1, auslaesse: 1 };
    for (const token of ['member-token', 'reader-token']) {
      expect((await t.app.request('/api/trichter', json(token, 'POST', body))).status).toBe(403);
      expect(
        (await t.app.request(`/api/trichter/${t.id}`, json(token, 'PUT', { archiviert: true })))
          .status,
      ).toBe(403);
    }
    expect(
      (await t.app.request(`/api/trichter/${t.id}`, json('vorstand-token', 'PUT', { volumenL: 4 })))
        .status,
    ).toBe(200);
    expect(
      (await t.app.request('/api/trichter/nope', json('admin-token', 'PUT', { volumenL: 4 })))
        .status,
    ).toBe(404);
    const neu = await t.app.request('/api/trichter', json('member-token', 'GET'));
    expect(await neu.json()).toEqual([expect.objectContaining({ volumenMl: 4000 })]);
  });

  it('hides archived funnels unless asked and refuses Durchgänge for them', async () => {
    const t = await setup();
    await t.app.request(`/api/trichter/${t.id}`, json('admin-token', 'PUT', { archiviert: true }));
    expect(
      await (await t.app.request('/api/trichter', json('member-token', 'GET'))).json(),
    ).toEqual([]);
    const alle = await t.app.request('/api/trichter?archiviert=1', json('member-token', 'GET'));
    expect(await alle.json()).toEqual([expect.objectContaining({ archiviert: true })]);
    const res = await t.eintragen('member-token', { teilnehmende: ['a'] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Dieser Trichter ist archiviert.' });
  });

  it('validates Durchgänge', async () => {
    const t = await setup();
    const selbst = await t.eintragen('member-token', { teilnehmende: ['m2'] });
    expect(selbst.status).toBe(400);
    expect(await selbst.json()).toEqual({
      error: 'Du kannst dich nicht selbst eintragen. Das machen die anderen für dich.',
    });
    expect((await t.eintragen('member-token', { teilnehmende: ['a', 'r', 'v'] })).status).toBe(400);
    expect((await t.eintragen('member-token', { volumenL: 3.5, teilnehmende: ['a'] })).status).toBe(
      400,
    );
    expect((await t.eintragen('member-token', { teilnehmende: ['a', 'a'] })).status).toBe(400);
    expect((await t.eintragen('member-token', { teilnehmende: [] })).status).toBe(400);
    expect((await t.eintragen('member-token', { teilnehmende: ['fremd'] })).status).toBe(400);
    // An enabled account without a profile row may take part; a disabled one may not.
    const konten = await t.userAdmin.konten();
    t.userAdmin.konten.mockResolvedValue(
      new Map([
        ...konten,
        ['neu', { sub: 'neu', kontoName: 'neu', username: 'neu', aktiviert: false, enabled: true }],
        ['aus', { sub: 'aus', kontoName: 'aus', username: 'aus', aktiviert: true, enabled: false }],
      ]),
    );
    expect((await t.eintragen('member-token', { teilnehmende: ['aus'] })).status).toBe(400);
    expect((await t.eintragen('member-token', { teilnehmende: ['neu'] })).status).toBe(201);
    expect(
      (
        await t.eintragen('member-token', {
          teilnehmende: ['a'],
          zeitpunkt: '2999-01-01T00:00:00Z',
        })
      ).status,
    ).toBe(400);
    expect(
      (await t.eintragen('member-token', { trichterId: 'nope', teilnehmende: ['a'] })).status,
    ).toBe(400);
    expect(
      (await t.eintragen('member-token', { volumenL: 3, teilnehmende: ['a', 'r'] })).status,
    ).toBe(201);
  });

  it('deletes a Durchgang only by its author or the management', async () => {
    const t = await setup();
    const eintragen = async () =>
      (
        (await (await t.eintragen('member-token', { teilnehmende: ['a'] })).json()) as {
          id: string;
        }
      ).id;
    const loeschen = (token: string, id: string) =>
      t.app.request(`/api/trichter/durchgaenge/${id}`, json(token, 'DELETE'));
    const id = await eintragen();
    expect((await loeschen('reader-token', id)).status).toBe(403);
    expect((await loeschen('member-token', id)).status).toBe(200);
    expect((await loeschen('member-token', id)).status).toBe(404);
    expect((await loeschen('reader-token', await eintragen())).status).toBe(403);
    expect((await loeschen('vorstand-token', await eintragen())).status).toBe(200);
    expect((await loeschen('admin-token', await eintragen())).status).toBe(200);
  });

  it('rejects entries in closed calendar years (create and delete)', async () => {
    const t = await setup();
    const msg = 'Einträge in abgeschlossenen Jahren lassen sich nicht mehr anlegen oder ändern.';
    const jahr = Number(new Date().toISOString().slice(0, 4));
    const vorjahr = await t.eintragen('member-token', {
      teilnehmende: ['a'],
      zeitpunkt: new Date(Date.UTC(jahr - 1, 11, 31, 12)).toISOString(),
    });
    expect(vorjahr.status).toBe(400);
    expect(await vorjahr.json()).toEqual({ error: msg });
    // Within the current year it still works.
    expect(
      (
        await t.eintragen('member-token', {
          teilnehmende: ['a'],
          zeitpunkt: new Date(Date.UTC(jahr, 0, 1, 12)).toISOString(),
        })
      ).status,
    ).toBe(201);
    // An entry that is already in a past year cannot be deleted either.
    const alt = await t.trichter.durchgangAnlegen({
      trichterId: t.id,
      volumenMl: 1000,
      zeitpunkt: new Date(Date.UTC(jahr - 1, 5, 1)),
      eingetragenVon: 'm',
      teilnehmende: ['a'],
    });
    const res = await t.app.request(
      `/api/trichter/durchgaenge/${alt}`,
      json('admin-token', 'DELETE'),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: msg });
  });

  it('lists Durchgänge page by page with darfLoeschen', async () => {
    const t = await setup();
    for (let i = 0; i < 22; i++) {
      const zeitpunkt = new Date(Date.now() - (i + 1) * 3_600_000).toISOString();
      await t.eintragen('member-token', { teilnehmende: ['a', 'r'], volumenL: 1, zeitpunkt });
    }
    const erste = (await (
      await t.app.request('/api/trichter/durchgaenge', json('member-token', 'GET'))
    ).json()) as DurchgaengeSeiteDto;
    expect(erste.durchgaenge).toHaveLength(20);
    expect(erste.weiter).toEqual(expect.any(String));
    expect(erste.durchgaenge[0]).toMatchObject({
      trichter: { id: t.id, name: 'Dicker' },
      volumenMl: 1000,
      darfLoeschen: true,
      eingetragenVon: { sub: 'm2', username: 'user-m2', status: 'anwaerter' },
    });
    expect(erste.durchgaenge[0]!.teilnehmende.map((m) => m.sub)).toEqual(['a', 'r']);
    const zeiten = erste.durchgaenge.map((d) => d.zeitpunkt);
    expect(zeiten).toEqual([...zeiten].sort().reverse());
    const zweite = (await (
      await t.app.request(
        `/api/trichter/durchgaenge?vor=${encodeURIComponent(erste.weiter!)}`,
        json('reader-token', 'GET'),
      )
    ).json()) as DurchgaengeSeiteDto;
    expect(zweite.durchgaenge).toHaveLength(2);
    expect(zweite.weiter).toBeNull();
    expect(zweite.durchgaenge.every((d) => !d.darfLoeschen)).toBe(true);
    expect(
      (await t.app.request('/api/trichter/durchgaenge?vor=kaputt', json('reader-token', 'GET')))
        .status,
    ).toBe(400);
  });

  it('shows the kings and the ranking per year', async () => {
    const t = await setup();
    const jahr = Number(new Date().toISOString().slice(0, 4));
    const mitte = (j: number) => `${j}-06-15T12:00:00Z`;
    // Last year: r twice. This year: a twice (shared volume), r once.
    for (let i = 0; i < 2; i++) {
      await t.trichter.durchgangAnlegen({
        trichterId: t.id,
        volumenMl: 2000,
        zeitpunkt: new Date(mitte(jahr - 1)),
        eingetragenVon: 'm',
        teilnehmende: ['r'],
      });
    }
    await t.eintragen('member-token', {
      teilnehmende: ['a', 'r'],
      volumenL: 2,
      zeitpunkt: `${jahr}-01-01T12:00:00Z`,
    });
    await t.eintragen('member-token', { teilnehmende: ['a'], volumenL: 1 });
    const holen = async (query = '') =>
      (await (
        await t.app.request(`/api/trichter/uebersicht${query}`, json('reader-token', 'GET'))
      ).json()) as TrichterUebersichtDto;

    const alle = await holen();
    expect(alle.jahr).toBeNull();
    expect(alle.jahre).toEqual([jahr, jahr - 1]);
    expect(alle.jahreskoenige.map((m) => m.sub)).toEqual(['a']);
    expect(alle.ewigeKoenige.map((m) => m.sub)).toEqual(['r']);
    expect(alle.rangliste.map((z) => [z.mitglied.sub, z.anzahl, z.ml])).toEqual([
      ['r', 3, 5000],
      ['a', 2, 2000],
    ]);
    expect(alle.rangliste[0]!.mitglied).toMatchObject({ username: 'user-r', anrede: 'neutral' });

    const letztes = await holen(`?jahr=${jahr - 1}`);
    expect(letztes.rangliste.map((z) => [z.mitglied.sub, z.anzahl, z.ml])).toEqual([
      ['r', 2, 4000],
    ]);
    expect(letztes.jahreskoenige.map((m) => m.sub)).toEqual(['a']);
    expect(letztes.ewigeKoenige.map((m) => m.sub)).toEqual(['r']);
    expect(
      (await t.app.request('/api/trichter/uebersicht?jahr=x', json('reader-token', 'GET'))).status,
    ).toBe(400);
  });

  it('names everybody on a full tie', async () => {
    const t = await setup();
    await t.eintragen('member-token', { teilnehmende: ['a'], volumenL: 1 });
    await t.eintragen('member-token', { teilnehmende: ['r'], volumenL: 1 });
    const res = (await (
      await t.app.request('/api/trichter/uebersicht', json('reader-token', 'GET'))
    ).json()) as TrichterUebersichtDto;
    expect(res.jahreskoenige.map((m) => m.sub).sort()).toEqual(['a', 'r']);
    expect(res.ewigeKoenige.map((m) => m.sub).sort()).toEqual(['a', 'r']);
  });

  it('has no kings without entries', async () => {
    const t = await setup();
    const res = (await (
      await t.app.request('/api/trichter/uebersicht', json('reader-token', 'GET'))
    ).json()) as TrichterUebersichtDto;
    expect(res).toMatchObject({ jahreskoenige: [], ewigeKoenige: [], rangliste: [], jahre: [] });
  });
});
