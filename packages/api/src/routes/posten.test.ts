import { describe, expect, it } from 'vitest';
import { type PostenRecht, ifcoPlatzHatIfcosFehler, ifcoPlatzHatWareFehler } from '@c4/shared';
import { WarenKonflikt, WarenUngueltig } from '../waren';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('posten', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  it('lets every member read but only holders of posten:bearbeiten write', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/posten', { headers: bearer('reader-token') })).status).toBe(
      200,
    );
    const neu = { name: 'Kassenwart' };
    expect((await app.request('/api/posten', json('reader-token', 'POST', neu))).status).toBe(403);
    expect((await app.request('/api/posten', json('vorstand-token', 'POST', neu))).status).toBe(
      201,
    );
  });

  it('hides archived Posten from readers and lists them for editors on request', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/posten', json('vorstand-token', 'POST', { name: 'Alt' }));
    const { id } = (await res.json()) as { id: string };
    await app.request(
      `/api/posten/${id}/archiv`,
      json('vorstand-token', 'PUT', { archiviert: true }),
    );

    const liste = async (token: string, query = '') =>
      (await app.request(`/api/posten${query}`, { headers: bearer(token) })).json();
    expect(await liste('reader-token')).toEqual([]);
    expect(await liste('vorstand-token')).toEqual([]);
    expect(await liste('vorstand-token', '?archiv=1')).toHaveLength(1);
    expect(
      (await app.request('/api/posten?archiv=1', { headers: bearer('reader-token') })).status,
    ).toBe(403);
    expect(
      (await app.request(`/api/posten/${id}`, { headers: bearer('reader-token') })).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/posten/${id}`, { headers: bearer('vorstand-token') })).status,
    ).toBe(200);
  });

  it('only assigns members that have a profile row', async () => {
    const { app, mitglieder } = makeApp();
    const res = await app.request('/api/posten', json('vorstand-token', 'POST', { name: 'Kasse' }));
    const { id } = (await res.json()) as { id: string };
    const besetzung = { mitgliedSub: 'm1', start: '2026-01-01' };
    const post = () =>
      app.request(`/api/posten/${id}/besetzungen`, json('vorstand-token', 'POST', besetzung));
    expect((await post()).status).toBe(400);
    await mitglieder.speichern('m1', {
      vorname: 'A',
      nachname: 'B',
      anrede: null,
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
    expect((await post()).status).toBe(201);
    const bad = { mitgliedSub: 'm1', start: '2026-02-01', ende: '2026-01-01' };
    expect(
      (await app.request(`/api/posten/${id}/besetzungen`, json('vorstand-token', 'POST', bad)))
        .status,
    ).toBe(400);
  });

  it('lets only admins attach rights to a Posten', async () => {
    const { app } = makeApp();
    const res = await app.request(
      '/api/posten',
      json('vorstand-token', 'POST', { name: 'Vorstand' }),
    );
    const { id } = (await res.json()) as { id: string };
    const rechte = { rechte: ['posten:bearbeiten'] };
    const put = (token: string) =>
      app.request(`/api/admin/posten/${id}/rechte`, json(token, 'PUT', rechte));
    expect((await put('vorstand-token')).status).toBe(403);
    expect((await put('admin-token')).status).toBe(200);
  });

  describe('Besetzung rules', () => {
    const profil = {
      vorname: 'A',
      nachname: 'B',
      anrede: null,
      kontaktkanaele: null,
      discordName: null,
      adresse: null,
      telefon: null,
      ueberMich: null,
      profilbildKey: null,
      geburtsdatum: null,
      geburtstagImKalender: null,
      wohnheim: null,
    };
    const aufbau = async (rechte: PostenRecht[]) => {
      const t = makeApp();
      await t.mitglieder.speichern('m1', profil);
      const res = await t.app.request(
        '/api/posten',
        json('vorstand-token', 'POST', { name: 'Mit Rechten' }),
      );
      const { id } = (await res.json()) as { id: string };
      await t.posten.rechteSetzen(id, rechte);
      return { ...t, id };
    };
    const besetzung = { mitgliedSub: 'm1', start: '2026-01-01' };

    it('refuses to staff a Posten that grants rights the editor lacks', async () => {
      const t = await aufbau(['users:manage']);
      const url = `/api/posten/${t.id}/besetzungen`;
      const neu = await t.app.request(url, json('vorstand-token', 'POST', besetzung));
      expect(neu.status).toBe(403);
      expect(await neu.json()).toEqual({
        error:
          'Diesen Posten kannst du nicht besetzen: Er gewährt Rechte, die du selbst nicht hast.',
      });
      const aendern = await t.app.request(
        `${url}/b1`,
        json('vorstand-token', 'PUT', { ...besetzung, ende: '2026-02-01' }),
      );
      expect(aendern.status).toBe(403);
      await t.app.request(
        `/api/posten/${t.id}/archiv`,
        json('admin-token', 'PUT', { archiviert: true }),
      );
      const aktivieren = await t.app.request(
        `/api/posten/${t.id}/archiv`,
        json('vorstand-token', 'PUT', { archiviert: false }),
      );
      expect(aktivieren.status).toBe(403);
      // Archiving stays possible.
      expect(
        (
          await t.app.request(
            `/api/posten/${t.id}/archiv`,
            json('vorstand-token', 'PUT', { archiviert: true }),
          )
        ).status,
      ).toBe(200);
      // Admins hold every right.
      expect((await t.app.request(url, json('admin-token', 'POST', besetzung))).status).toBe(201);
      expect(
        (
          await t.app.request(
            `/api/posten/${t.id}/archiv`,
            json('admin-token', 'PUT', { archiviert: false }),
          )
        ).status,
      ).toBe(200);
    });

    it('allows staffing a Posten without rights or with only rights the editor holds', async () => {
      for (const rechte of [[], ['waren:verwalten' as const]]) {
        const t = await aufbau(rechte);
        const url = `/api/posten/${t.id}/besetzungen`;
        expect((await t.app.request(url, json('vorstand-token', 'POST', besetzung))).status).toBe(
          201,
        );
        expect(
          (await t.app.request(`${url}/b1`, json('vorstand-token', 'PUT', besetzung))).status,
        ).toBe(200);
      }
    });

    it('lets an admin end the Besetzung of a deactivated member but not name one', async () => {
      const t = await aufbau([]);
      await t.mitglieder.speichern('m3', profil);
      await t.posten.besetzungAnlegen(t.id, { mitgliedSub: 'm1', start: '2026-01-01', ende: null });
      await t.mitglieder.deaktiviertSetzen('m1', true);
      await t.mitglieder.deaktiviertSetzen('m3', true);
      const put = (mitgliedSub: string) =>
        t.app.request(
          `/api/posten/${t.id}/besetzungen/b1`,
          json('admin-token', 'PUT', { mitgliedSub, start: '2026-01-01', ende: '2026-03-01' }),
        );
      expect((await put('m1')).status).toBe(200);
      expect((await put('m3')).status).toBe(400);
    });
  });

  it('adds the permissions of held Posten to /api/me', async () => {
    const res = await makeApp().app.request('/api/me', { headers: bearer('vorstand-token') });
    expect(((await res.json()) as { permissions: string[] }).permissions).toContain(
      'posten:bearbeiten',
    );
  });

  it('titles the holder in the list by their form of address', async () => {
    const { app, mitglieder, posten, userAdmin } = makeApp();
    for (const [sub, anrede] of [
      ['w1', 'weiblich'],
      ['m1', 'maennlich'],
    ] as const) {
      await mitglieder.speichern(sub, {
        vorname: 'A',
        nachname: 'B',
        anrede,
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
    userAdmin.konten.mockResolvedValue(new Map());
    const chef = {
      id: 'p1',
      name: 'Vorstandsvorsitz',
      bezeichnungMaennlich: 'Chef',
      bezeichnungWeiblich: 'Chefin',
      bezeichnungNeutral: 'Chef:in',
    };
    posten.aktuelleNachMitglied.mockResolvedValue(
      new Map([
        ['w1', [chef]],
        ['m1', [chef]],
      ]),
    );
    const liste = (await (
      await app.request('/api/mitglieder', { headers: bearer('reader-token') })
    ).json()) as { sub: string; posten: { bezeichnung: string }[] }[];
    expect(liste.find((m) => m.sub === 'w1')?.posten[0]?.bezeichnung).toBe('Chefin');
    expect(liste.find((m) => m.sub === 'm1')?.posten[0]?.bezeichnung).toBe('Chef');
  });

  it('ends taken-over Besetzungen the day before the new start', async () => {
    const { app, mitglieder, posten } = makeApp();
    const leer = {
      vorname: 'A',
      nachname: 'B',
      anrede: null,
      kontaktkanaele: null,
      discordName: null,
      adresse: null,
      telefon: null,
      ueberMich: null,
      profilbildKey: null,
      geburtsdatum: null,
      geburtstagImKalender: null,
      wohnheim: null,
    };
    await mitglieder.speichern('m1', leer);
    await mitglieder.speichern('m2', leer);
    const res = await app.request('/api/posten', json('vorstand-token', 'POST', { name: 'Kasse' }));
    const { id } = (await res.json()) as { id: string };
    const alt = await posten.besetzungAnlegen(id, {
      mitgliedSub: 'm1',
      start: '2025-01-01',
      ende: null,
    });
    const neu = (ablosung: string[]) =>
      app.request(
        `/api/posten/${id}/besetzungen`,
        json('vorstand-token', 'POST', { mitgliedSub: 'm2', start: '2026-03-01', ablosung }),
      );
    expect((await neu(['gibt-es-nicht'])).status).toBe(400);
    expect((await neu([alt!])).status).toBe(201);
    expect((await posten.holen(id))?.besetzungen.find((b) => b.id === alt)?.endDatum).toBe(
      '2026-02-28',
    );
  });

  it('rejects overlapping Besetzungen of one member, but allows disjoint ones', async () => {
    const { app, mitglieder } = makeApp();
    await mitglieder.speichern('m1', {
      vorname: 'A',
      nachname: 'B',
      anrede: null,
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
    const res = await app.request('/api/posten', json('vorstand-token', 'POST', { name: 'Kasse' }));
    const { id } = (await res.json()) as { id: string };
    const post = (start: string, ende: string | null) =>
      app.request(
        `/api/posten/${id}/besetzungen`,
        json('vorstand-token', 'POST', { mitgliedSub: 'm1', start, ende }),
      );
    expect((await post('2020-01-01', '2020-12-31')).status).toBe(201);
    expect((await post('2024-01-01', '2025-12-31')).status).toBe(201);
    expect((await post('2020-12-31', '2021-06-30')).status).toBe(409);
    expect((await post('2025-06-01', null)).status).toBe(409);
  });
  describe('waren', () => {
    const json = (token: string, method: string, body?: unknown) => ({
      method,
      headers: { ...bearer(token), 'content-type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const zeitpunkt = '2026-05-01T10:00:00.000Z';

    it('lets everyone read and book, but only Waren-Verwalter change master data', async () => {
      const { app, waren } = makeApp();
      expect((await app.request('/api/lagerorte', json('reader-token', 'GET'))).status).toBe(200);
      for (const [url, method] of [
        ['/api/lagerorte', 'POST'],
        ['/api/lagerorte/l1/boeden', 'POST'],
        ['/api/lagerorte/l1', 'PUT'],
        ['/api/lagerorte/l1', 'DELETE'],
        ['/api/lagerorte/l1/archiv', 'PUT'],
        ['/api/lagerorte/root/reihenfolge', 'PUT'],
        ['/api/lagerorte/l1/waren', 'PUT'],
        ['/api/warengruppen', 'POST'],
        ['/api/gebinde', 'POST'],
        ['/api/waren', 'POST'],
        ['/api/waren/w1', 'DELETE'],
        ['/api/waren/w1/archiv', 'PUT'],
      ] as const) {
        const res = await app.request(
          url,
          json('reader-token', method, method === 'PUT' || method === 'POST' ? {} : undefined),
        );
        expect(res.status, `${method} ${url}`).toBe(403);
      }
      expect(waren.lagerortAnlegen).not.toHaveBeenCalled();

      const einlagerung = {
        wareId: 'w1',
        lagerortId: 'l1',
        gebindeId: 'gb1',
        anzahl: 3,
        mhd: '2027-01-15',
        zeitpunkt,
      };
      const res = await app.request(
        '/api/bestand/einlagerung',
        json('reader-token', 'POST', einlagerung),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: 'v1' });
      expect(waren.einlagern).toHaveBeenCalledWith(
        expect.objectContaining({ anzahl: 3, mhd: '2027-01-15', kommentar: null }),
        'r',
      );
    });

    it('manages Lagerorte: create, update, cycle, 404, conflict on delete, archive, order', async () => {
      const { app, verwendet, waren, orte } = makeApp();
      const post = async (body: unknown) =>
        app.request('/api/lagerorte', json('admin-token', 'POST', body));
      expect((await post({ name: '  ' })).status).toBe(400);
      const lager = (await (await post({ name: 'Lager' })).json()) as { id: string };
      const regal = (await (await post({ name: 'Regal', parentId: lager.id })).json()) as {
        id: string;
      };
      expect(regal.id).toBe('l2');
      expect(orte.get('l2')?.art).toBeNull();

      const put = (id: string, body: unknown) =>
        app.request(`/api/lagerorte/${id}`, json('vorstand-token', 'PUT', body));
      expect((await put(lager.id, { name: 'Lager', parentId: regal.id })).status).toBe(400);
      expect((await put(lager.id, { name: 'Lager', parentId: lager.id })).status).toBe(400);
      expect((await put('x', { name: 'X' })).status).toBe(404);
      expect((await put(regal.id, { name: 'Regal 2', parentId: lager.id })).status).toBe(200);

      verwendet.add(regal.id);
      const del = await app.request(`/api/lagerorte/${regal.id}`, json('admin-token', 'DELETE'));
      expect(del.status).toBe(409);
      expect((await del.json()) as { error: string }).toEqual({
        error: 'Der Lagerort wird noch verwendet, archiviere ihn stattdessen.',
      });
      const archiv = (id: string, archiviert: boolean) =>
        app.request(`/api/lagerorte/${id}/archiv`, json('admin-token', 'PUT', { archiviert }));
      expect((await archiv(regal.id, true)).status).toBe(409);
      verwendet.delete(regal.id);
      expect((await archiv(regal.id, true)).status).toBe(200);
      expect((await archiv('x', true)).status).toBe(404);

      const liste = async (query = '') =>
        (await (
          await app.request(`/api/lagerorte${query}`, json('reader-token', 'GET'))
        ).json()) as unknown[];
      expect(await liste()).toHaveLength(1);
      expect(await liste('?archiv=1')).toHaveLength(2);

      const reihenfolge = await app.request(
        '/api/lagerorte/root/reihenfolge',
        json('admin-token', 'PUT', { ids: [lager.id] }),
      );
      expect(reihenfolge.status).toBe(200);
      expect(waren.lagerortReihenfolge).toHaveBeenCalledWith(null, [lager.id]);
      expect(
        (
          await app.request(
            '/api/lagerorte/root/reihenfolge',
            json('admin-token', 'PUT', { ids: ['a', 'a'] }),
          )
        ).status,
      ).toBe(400);

      expect(
        (await app.request('/api/lagerorte/x/waren', json('reader-token', 'GET'))).status,
      ).toBe(404);
      const ware = await app.request(
        `/api/lagerorte/${lager.id}/waren`,
        json('admin-token', 'PUT', { wareIds: ['w1', 'w2'] }),
      );
      expect(ware.status).toBe(200);
      expect(waren.lagerortWarenSetzen).toHaveBeenCalledWith(lager.id, ['w1', 'w2']);
    });

    it('creates a Regal with its Regalböden in one request', async () => {
      const { app, waren, orte } = makeApp();
      const post = (url: string, body: unknown, token = 'admin-token') =>
        app.request(url, json(token, 'POST', body));
      const lager = (await (await post('/api/lagerorte', { name: 'Lager' })).json()) as {
        id: string;
      };
      const res = await post('/api/lagerorte', {
        name: 'Regal A',
        parentId: lager.id,
        art: 'regal',
        boeden: [' Boden 1 ', 'Boden 2'],
      });
      expect(res.status).toBe(201);
      const angelegt = (await res.json()) as { id: string; boedenIds: string[] };
      expect(angelegt.boedenIds).toHaveLength(2);
      expect(waren.lagerortAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'Regal A', art: 'regal' }),
        ['Boden 1', 'Boden 2'],
        null,
      );
      expect(angelegt.boedenIds.map((id) => orte.get(id))).toEqual([
        expect.objectContaining({ name: 'Boden 1', art: 'regalboden', parentId: angelegt.id }),
        expect.objectContaining({ name: 'Boden 2', art: 'regalboden', parentId: angelegt.id }),
      ]);

      const regal = { name: 'R', art: 'regal' };
      for (const body of [
        regal, // no Böden
        { ...regal, boeden: [] },
        { ...regal, boeden: ['a', 'a'] },
        { ...regal, boeden: ['a', '  '] },
        { ...regal, boeden: Array.from({ length: 51 }, (_, i) => `B${i}`) },
        { name: 'Normal', boeden: ['a'] }, // Böden only come with a Regal
        { name: 'R', art: 'sonstiges' },
        { ...regal, parentId: angelegt.id, boeden: ['a'] }, // Regal inside a Regal
        { name: 'X', parentId: angelegt.id }, // normal below a Regal
        { name: 'B', art: 'regalboden' }, // Regalboden without a Regal
      ]) {
        expect((await post('/api/lagerorte', body)).status, JSON.stringify(body)).toBe(400);
      }
      expect(
        (await post('/api/lagerorte', { ...regal, boeden: ['a'] }, 'reader-token')).status,
      ).toBe(403);
      expect((await post('/api/lagerorte', { ...regal, boeden: ['a'] })).status).toBe(201);
    });

    it('appends Regalböden to a Regal', async () => {
      const { app, waren } = makeApp();
      const post = (url: string, body: unknown, token = 'admin-token') =>
        app.request(url, json(token, 'POST', body));
      const regal = (await (
        await post('/api/lagerorte', { name: 'Regal', art: 'regal', boeden: ['Boden 1'] })
      ).json()) as { id: string };
      const lager = (await (await post('/api/lagerorte', { name: 'Lager' })).json()) as {
        id: string;
      };
      const res = await post(`/api/lagerorte/${regal.id}/boeden`, {
        namen: ['Boden 2', 'Boden 3'],
      });
      expect(res.status).toBe(201);
      expect(((await res.json()) as { boedenIds: string[] }).boedenIds).toHaveLength(2);
      expect(waren.boedenHinzufuegen).toHaveBeenCalledWith(regal.id, ['Boden 2', 'Boden 3'], null);
      expect((await post(`/api/lagerorte/${lager.id}/boeden`, { namen: ['x'] })).status).toBe(400);
      // names already used in the Regal (case-insensitive) are rejected
      expect((await post(`/api/lagerorte/${regal.id}/boeden`, { namen: ['boden 1'] })).status).toBe(
        400,
      );
      expect((await post(`/api/lagerorte/${regal.id}/boeden`, { namen: ['A', 'a'] })).status).toBe(
        400,
      );
      expect((await post('/api/lagerorte/x/boeden', { namen: ['x'] })).status).toBe(404);
      expect((await post(`/api/lagerorte/${regal.id}/boeden`, { namen: [] })).status).toBe(400);
      expect((await post(`/api/lagerorte/${regal.id}/boeden`, { namen: ['a', 'a'] })).status).toBe(
        400,
      );
      expect(
        (await post(`/api/lagerorte/${regal.id}/boeden`, { namen: ['x'] }, 'reader-token')).status,
      ).toBe(403);
    });

    it('keeps the Regal rules when the kind changes or a Lagerort moves', async () => {
      const { app, orte } = makeApp();
      const post = async (body: unknown) =>
        (await (await app.request('/api/lagerorte', json('admin-token', 'POST', body))).json()) as {
          id: string;
          boedenIds: string[];
        };
      const put = (id: string, body: unknown) =>
        app.request(`/api/lagerorte/${id}`, json('admin-token', 'PUT', body));
      const lager = await post({ name: 'Lager' });
      const tief = await post({ name: 'Tief', parentId: lager.id });
      await post({ name: 'Enkel', parentId: tief.id });
      const flach = await post({ name: 'Flach', parentId: lager.id });
      const blatt = await post({ name: 'Blatt', parentId: flach.id });

      // children with children of their own: no Regal
      expect((await put(lager.id, { name: 'Lager', art: 'regal' })).status).toBe(400);
      // otherwise the children become Regalböden
      expect(
        (await put(flach.id, { name: 'Flach', parentId: lager.id, art: 'regal' })).status,
      ).toBe(200);
      expect(orte.get(flach.id)?.art).toBe('regal');
      expect(orte.get(blatt.id)?.art).toBe('regalboden');
      // omitted art keeps the kind
      expect((await put(flach.id, { name: 'Flach 2', parentId: lager.id })).status).toBe(200);
      expect(orte.get(flach.id)?.art).toBe('regal');
      // a Regalboden keeps its kind and stays below a Regal
      expect((await put(blatt.id, { name: 'Blatt', parentId: flach.id, art: null })).status).toBe(
        400,
      );
      expect((await put(blatt.id, { name: 'Blatt', parentId: lager.id })).status).toBe(400);
      // no Regal below a Regal, no normal Lagerort below a Regal
      expect((await put(flach.id, { name: 'Flach', parentId: flach.id })).status).toBe(400);
      expect((await put(tief.id, { name: 'Tief', parentId: flach.id })).status).toBe(400);
      // back to a normal Lagerort: the Böden become normal
      expect((await put(flach.id, { name: 'Flach', parentId: lager.id, art: null })).status).toBe(
        200,
      );
      expect(orte.get(blatt.id)?.art).toBeNull();
    });

    it('validates and passes the IFCO-Lagerplatz dimensions', async () => {
      const { app, waren } = makeApp();
      const send = (url: string, method: string, body: unknown) =>
        app.request(url, json('admin-token', method, body));
      const platz = { hoeheCm: 20, stellflaechen: 1.5 };
      expect(
        (await send('/api/lagerorte', 'POST', { name: 'HR11', ifcoPlatz: platz })).status,
      ).toBe(201);
      expect(waren.lagerortAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'HR11', ifcoPlatz: platz }),
        undefined,
        null,
      );
      const regal = { name: 'Regal', art: 'regal', boeden: ['Boden 1'], boedenIfcoPlatz: platz };
      expect((await send('/api/lagerorte', 'POST', regal)).status).toBe(201);
      expect(waren.lagerortAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'Regal' }),
        ['Boden 1'],
        platz,
      );
      for (const ungueltig of [
        { hoeheCm: 0, stellflaechen: 1 },
        { hoeheCm: 20, stellflaechen: 0 },
        { hoeheCm: 20, stellflaechen: 0.25 },
        { hoeheCm: 20 },
      ]) {
        expect(
          (await send('/api/lagerorte', 'POST', { name: 'X', ifcoPlatz: ungueltig })).status,
        ).toBe(400);
      }
      // Update: undefined keeps, null unmarks.
      const angelegt = (await (await send('/api/lagerorte', 'POST', { name: 'Platz' })).json()) as {
        id: string;
      };
      expect(
        (await send(`/api/lagerorte/${angelegt.id}`, 'PUT', { name: 'Platz', ifcoPlatz: platz }))
          .status,
      ).toBe(200);
      expect(waren.lagerortAktualisieren).toHaveBeenLastCalledWith(
        angelegt.id,
        expect.objectContaining({ ifcoPlatz: platz }),
      );
      await send(`/api/lagerorte/${angelegt.id}`, 'PUT', { name: 'Platz', ifcoPlatz: null });
      expect(waren.lagerortAktualisieren).toHaveBeenLastCalledWith(
        angelegt.id,
        expect.objectContaining({ ifcoPlatz: null }),
      );
      await send(`/api/lagerorte/${angelegt.id}`, 'PUT', { name: 'Platz' });
      expect(waren.lagerortAktualisieren.mock.lastCall?.[1].ifcoPlatz).toBeUndefined();
      // New Böden of a Regal.
      const regalRes = (await (await send('/api/lagerorte', 'POST', regal)).json()) as {
        id: string;
      };
      expect(
        (
          await send(`/api/lagerorte/${regalRes.id}/boeden`, 'POST', {
            namen: ['B2'],
            ifcoPlatz: platz,
          })
        ).status,
      ).toBe(201);
      expect(waren.boedenHinzufuegen).toHaveBeenLastCalledWith(regalRes.id, ['B2'], platz);
    });

    it('accepts one IFCO-Lagerplatz per Boden and rejects a wrong count', async () => {
      const { app, waren } = makeApp();
      const send = (url: string, body: unknown) =>
        app.request(url, json('admin-token', 'POST', body));
      const a = { hoeheCm: 20, stellflaechen: 1 };
      const b = { hoeheCm: 30, stellflaechen: 1 };
      const regal = { name: 'Regal', art: 'regal', boeden: ['R1', 'R2'] };
      expect((await send('/api/lagerorte', { ...regal, boedenIfcoPlatz: [a, b] })).status).toBe(
        201,
      );
      expect(waren.lagerortAnlegen).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'Regal' }),
        ['R1', 'R2'],
        [a, b],
      );
      expect((await send('/api/lagerorte', { ...regal, boedenIfcoPlatz: [a] })).status).toBe(400);
      const id = ((await (await send('/api/lagerorte', regal)).json()) as { id: string }).id;
      expect(
        (await send(`/api/lagerorte/${id}/boeden`, { namen: ['B3', 'B4'], ifcoPlatz: [a, b] }))
          .status,
      ).toBe(201);
      expect(waren.boedenHinzufuegen).toHaveBeenLastCalledWith(id, ['B3', 'B4'], [a, b]);
      expect(
        (await send(`/api/lagerorte/${id}/boeden`, { namen: ['B5'], ifcoPlatz: [a, b] })).status,
      ).toBe(400);
    });

    it('rejects reordering the Regalböden of a Regal', async () => {
      const { app, waren } = makeApp();
      waren.lagerortReihenfolge.mockRejectedValueOnce(
        new WarenUngueltig('Regalböden lassen sich nicht verschieben.'),
      );
      const res = await app.request(
        '/api/lagerorte/l1/reihenfolge',
        json('admin-token', 'PUT', { ids: ['a', 'b'] }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Regalböden lassen sich nicht verschieben.' });
    });

    it('lets IFCO-Lagerplätze be marked with stock, but keeps Waren and IFCOs apart', async () => {
      const { app, waren, inventar } = makeApp();
      const send = (url: string, method: string, body: unknown) =>
        app.request(url, json('admin-token', method, body));
      // marking a place that holds Waren is no longer rejected by the API layer
      const id = (
        (await (await send('/api/lagerorte', 'POST', { name: 'HR11' })).json()) as {
          id: string;
        }
      ).id;
      const platz = { hoeheCm: 20, stellflaechen: 1 };
      expect(
        (await send(`/api/lagerorte/${id}`, 'PUT', { name: 'HR11', ifcoPlatz: platz })).status,
      ).toBe(200);
      // booking Waren onto a place that holds IFCOs is a 400
      waren.einlagern.mockRejectedValueOnce(new WarenUngueltig(ifcoPlatzHatIfcosFehler('HR11')));
      const buchung = await send('/api/bestand/einlagerung', 'POST', {
        wareId: 'w1',
        lagerortId: id,
        gebindeId: 'gb1',
        anzahl: 1,
        zeitpunkt: '2026-05-01T10:00:00.000Z',
      });
      expect(buchung.status).toBe(400);
      expect(await buchung.json()).toEqual({
        error: 'Auf „HR11“ stehen IFCOs; dort kann gerade keine Ware liegen.',
      });
      // placing an IFCO onto a place that holds Waren is a 400
      inventar.ifcoAnlegen.mockRejectedValueOnce(
        new WarenUngueltig(ifcoPlatzHatWareFehler('HR11')),
      );
      const ifco = await send('/api/inventar/ifcos', 'POST', { name: 'Kiste', lagerortId: id });
      expect(ifco.status).toBe(400);
      expect(await ifco.json()).toEqual({
        error: 'Auf „HR11“ liegt Ware; dort kann keine IFCO stehen.',
      });
    });

    it('validates Gebinde and Waren input', async () => {
      const { app, waren } = makeApp();
      const gebinde = (body: unknown) =>
        app.request('/api/gebinde', json('admin-token', 'POST', body));
      const flasche = { menge: 0.5, einheit: 'l', verpackungseinheit: 'flasche', pfandCent: 8 };
      expect((await gebinde({ ...flasche, pfandCent: -1 })).status).toBe(400);
      expect((await gebinde({ name: 'Flasche', pfandCent: 8 })).status).toBe(400);
      // Basisgebinde without menge/einheit, Obergebinde without count or with its own menge
      expect((await gebinde({ verpackungseinheit: 'dose' })).status).toBe(400);
      expect((await gebinde({ verpackungseinheit: 'kasten', unterGebindeId: 'gb1' })).status).toBe(
        400,
      );
      expect(
        (
          await gebinde({
            verpackungseinheit: 'kasten',
            unterGebindeId: 'gb1',
            unterAnzahl: 20,
            menge: 1,
            einheit: 'l',
          })
        ).status,
      ).toBe(400);
      expect((await gebinde({ ...flasche, einheit: 'oz' })).status).toBe(400);
      expect((await gebinde(flasche)).status).toBe(201);
      const doppelt = await gebinde(flasche);
      expect(doppelt.status).toBe(409);
      expect(await doppelt.json()).toEqual({ error: 'Dieses Gebinde gibt es schon.' });
      // Same bottle with a different deposit is a different Gebinde
      expect((await gebinde({ ...flasche, pfandCent: 15 })).status).toBe(201);
      expect(
        (
          await gebinde({
            verpackungseinheit: 'kasten',
            pfandCent: 150,
            unterGebindeId: 'gb1',
            unterAnzahl: 20,
          })
        ).status,
      ).toBe(201);

      waren.wareAnlegen.mockRejectedValueOnce(
        new WarenUngueltig('Die Warengruppe existiert nicht.'),
      );
      const ware = (body: unknown) => app.request('/api/waren', json('admin-token', 'POST', body));
      expect(
        (await ware({ name: 'Cola', warengruppeId: 'g', mhdArt: 'x', gebindeIds: ['gb1'] })).status,
      ).toBe(400);
      expect(
        (await ware({ name: 'Cola', warengruppeId: 'g', mhdArt: 'tag', gebindeIds: [] })).status,
      ).toBe(400);
      const res = await ware({
        name: 'Cola',
        warengruppeId: 'g',
        mhdArt: 'tag',
        gebindeIds: ['gb1'],
        standardGebindeId: 'gb1',
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Die Warengruppe existiert nicht.' });
      expect(
        (
          await ware({
            name: 'Cola',
            warengruppeId: 'g',
            mhdArt: 'tag',
            gebindeIds: ['gb1'],
            standardGebindeId: 'gb1',
          })
        ).status,
      ).toBe(201);
      // The Standard-Gebinde is required.
      expect(
        (await ware({ name: 'Cola', warengruppeId: 'g', mhdArt: 'tag', gebindeIds: ['gb1'] }))
          .status,
      ).toBe(400);
      // A name or alias clash names the field, so the form can show it there.
      waren.wareAnlegen.mockRejectedValueOnce(
        new WarenUngueltig(
          '„Sterni“ wird schon von der Ware „Sternburg Export“ verwendet.',
          'alias',
        ),
      );
      const aliasKonflikt = await ware({
        name: 'Cola',
        warengruppeId: 'g',
        mhdArt: 'tag',
        gebindeIds: ['gb1'],
        standardGebindeId: 'gb1',
        aliase: ['Sterni'],
      });
      expect(aliasKonflikt.status).toBe(400);
      expect(await aliasKonflikt.json()).toEqual({
        error: '„Sterni“ wird schon von der Ware „Sternburg Export“ verwendet.',
        feld: 'alias',
      });

      expect((await app.request('/api/waren/nope', json('reader-token', 'GET'))).status).toBe(404);
      expect(
        (await app.request('/api/waren/nope/verlauf', json('reader-token', 'GET'))).status,
      ).toBe(404);
    });

    it('validates bookings and maps store errors', async () => {
      const { app, waren } = makeApp();
      const basis = { wareId: 'w1', lagerortId: 'l1', gebindeId: 'gb1', zeitpunkt };
      const entnahme = (body: unknown) =>
        app.request('/api/bestand/entnahme', json('reader-token', 'POST', body));
      expect((await entnahme({ ...basis, anzahl: 0 })).status).toBe(400);
      expect((await entnahme({ ...basis, anzahl: 1.5 })).status).toBe(400);
      expect((await entnahme({ ...basis, anzahl: 1, zeitpunkt: 'gestern' })).status).toBe(400);
      const ok = await entnahme({ ...basis, anzahl: 2, kommentar: ' Fest ' });
      expect(ok.status).toBe(201);
      expect(waren.entnehmen).toHaveBeenCalledWith(
        expect.objectContaining({ anzahl: 2, kommentar: 'Fest' }),
        'r',
      );
      waren.entnehmen.mockRejectedValueOnce(new WarenUngueltig('Die Ware ist archiviert.'));
      expect((await entnahme({ ...basis, anzahl: 1 })).status).toBe(400);

      const einlagerung = (body: unknown) =>
        app.request('/api/bestand/einlagerung', json('reader-token', 'POST', body));
      waren.einlagern.mockRejectedValueOnce(new WarenUngueltig('Bitte gib ein MHD an.'));
      const res = await einlagerung({ ...basis, anzahl: 1 });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Bitte gib ein MHD an.' });

      const loeschen = (id: string) =>
        app.request(`/api/bestand/vorgaenge/${id}`, json('reader-token', 'DELETE'));
      expect((await loeschen('v1')).status).toBe(200);
      expect((await loeschen('nope')).status).toBe(404);
    });

    it('rejects booking timestamps in the future but allows backdating and a small clock skew', async () => {
      const { app, waren } = makeApp();
      const post = async (url: string, body: unknown) =>
        app.request(url, json('reader-token', 'POST', body));
      const zukunft = new Date(Date.now() + 86_400_000).toISOString();
      const leichtVoraus = new Date(Date.now() + 60_000).toISOString();
      const pos = { wareId: 'w1', lagerortId: 'l1', gebindeId: 'gb1', anzahl: 2 };
      const umlagerung = { wareId: 'w1', gebindeId: 'gb1', anzahl: 2, vonId: 'l1', nachId: 'l2' };
      const faelle: [string, (zeitpunkt: string) => unknown][] = [
        ['/api/bestand/einlagerung', (z) => ({ ...pos, mhd: '2027-01-15', zeitpunkt: z })],
        ['/api/bestand/entnahme', (z) => ({ ...pos, zeitpunkt: z })],
        ['/api/bestand/einlagerungen', (z) => ({ zeitpunkt: z, positionen: [pos] })],
        ['/api/bestand/entnahmen', (z) => ({ zeitpunkt: z, positionen: [pos] })],
        ['/api/bestand/umlagerungen', (z) => ({ zeitpunkt: z, positionen: [umlagerung] })],
        ['/api/inventuren/i1/abschluss', (z) => ({ zeitpunkt: z })],
      ];
      for (const [url, body] of faelle) {
        const res = await post(url, body(zukunft));
        expect(res.status, url).toBe(400);
        expect(JSON.stringify(await res.json()), url).toContain(
          'Der Zeitpunkt darf nicht in der Zukunft liegen.',
        );
        expect((await post(url, body(leichtVoraus))).status, url).not.toBe(400);
        expect((await post(url, body(zeitpunkt))).status, url).not.toBe(400);
      }
      expect(waren.entnehmen).toHaveBeenCalled();
    });

    it('books several positions at once (Einlagerungen, Entnahmen, Umlagerungen)', async () => {
      const { app, waren } = makeApp();
      const post = (url: string, body: unknown) =>
        app.request(url, json('reader-token', 'POST', body));
      const pos = { wareId: 'w1', lagerortId: 'l1', gebindeId: 'gb1', anzahl: 2 };

      expect((await post('/api/bestand/einlagerungen', { zeitpunkt, positionen: [] })).status).toBe(
        400,
      );
      const einlagerung = await post('/api/bestand/einlagerungen', {
        zeitpunkt,
        kommentar: ' Lieferung ',
        positionen: [{ ...pos, mhd: '2027-01-15' }],
      });
      expect(einlagerung.status).toBe(201);
      expect(await einlagerung.json()).toEqual({ id: 'v4' });
      expect(waren.einlagerungen).toHaveBeenCalledWith(
        expect.objectContaining({ kommentar: 'Lieferung' }),
        'r',
      );
      waren.einlagerungen.mockRejectedValueOnce(new WarenUngueltig('Bitte gib ein MHD an.'));
      expect(
        (await post('/api/bestand/einlagerungen', { zeitpunkt, positionen: [pos] })).status,
      ).toBe(400);

      const gleich = { lagerortId: 'l1', quelleId: 'l1' };
      expect(
        (
          await post('/api/bestand/entnahmen', {
            zeitpunkt,
            positionen: [pos],
            nachfuellen: [gleich],
          })
        ).status,
      ).toBe(400);
      expect(
        (await post('/api/bestand/entnahmen', { zeitpunkt, positionen: [{ ...pos, anzahl: 0 }] }))
          .status,
      ).toBe(400);
      const entnahme = await post('/api/bestand/entnahmen', { zeitpunkt, positionen: [pos] });
      expect(entnahme.status).toBe(201);
      expect(await entnahme.json()).toEqual({ entnahmeId: 'v5', umlagerungId: null });
      expect(waren.entnahmen).toHaveBeenCalledWith(
        expect.objectContaining({ nachfuellen: [] }),
        'r',
      );
      waren.entnahmen.mockResolvedValueOnce({ entnahmeId: 'v7', umlagerungId: 'v8' });
      const mit = await post('/api/bestand/entnahmen', {
        zeitpunkt,
        positionen: [pos],
        nachfuellen: [{ lagerortId: 'l1', quelleId: 'l2' }],
      });
      expect(await mit.json()).toEqual({ entnahmeId: 'v7', umlagerungId: 'v8' });

      const umlagerung = { wareId: 'w1', gebindeId: 'gb1', anzahl: 1, vonId: 'l1', nachId: 'l2' };
      expect(
        (
          await post('/api/bestand/umlagerungen', {
            zeitpunkt,
            positionen: [{ ...umlagerung, nachId: 'l1' }],
          })
        ).status,
      ).toBe(400);
      const ok = await post('/api/bestand/umlagerungen', { zeitpunkt, positionen: [umlagerung] });
      expect(ok.status).toBe(201);
      expect(await ok.json()).toEqual({ id: 'v6' });

      waren.lagerortBestand.mockResolvedValueOnce([
        { lagerortId: 'l1', wareId: 'w1', gebindeId: 'gb1', menge: 3, fruehestesMhd: null },
      ]);
      const bestand = await app.request('/api/lagerorte/bestand', json('reader-token', 'GET'));
      expect(bestand.status).toBe(200);
      expect(await bestand.json()).toHaveLength(1);
      expect((await app.request('/api/lagerorte/bestand')).status).toBe(401);

      const listen = await app.request('/api/lagerorte/warenlisten', json('reader-token', 'GET'));
      expect(listen.status).toBe(200);
      expect(await listen.json()).toEqual([{ lagerortId: 'l1', wareIds: ['w1'] }]);
      expect((await app.request('/api/lagerorte/warenlisten')).status).toBe(401);
    });

    it('runs the Inventur flow and maps conflicts', async () => {
      const { app, waren } = makeApp();
      const start = (body: unknown) =>
        app.request('/api/inventuren', json('reader-token', 'POST', body));
      expect((await start({})).status).toBe(400);
      const ok = await start({ lagerortId: 'l1' });
      expect(ok.status).toBe(201);
      expect(waren.inventurStarten).toHaveBeenCalledWith('l1', 'r');
      waren.inventurStarten.mockRejectedValueOnce(
        new WarenKonflikt('Für diesen Lagerort läuft bereits eine Inventur.'),
      );
      expect((await start({ lagerortId: 'l1' })).status).toBe(409);

      expect(
        (await app.request('/api/inventuren?status=offen', json('reader-token', 'GET'))).status,
      ).toBe(200);
      expect(waren.inventuren).toHaveBeenCalledWith('offen');
      expect(
        (await app.request('/api/inventuren?status=x', json('reader-token', 'GET'))).status,
      ).toBe(400);
      expect((await app.request('/api/inventuren/nope', json('reader-token', 'GET'))).status).toBe(
        404,
      );

      const knoten = (body: unknown) =>
        app.request('/api/inventuren/i1/knoten/l1', json('reader-token', 'PUT', body));
      expect(
        (await knoten({ zaehlungen: [{ wareId: 'w1', gebindeId: 'gb1', anzahl: -1 }] })).status,
      ).toBe(400);
      const gespeichert = await knoten({
        zaehlungen: [{ wareId: 'w1', gebindeId: 'gb1', mhd: '2027-01-01', anzahl: 0 }],
        inListeAufnehmen: ['w2'],
      });
      expect(gespeichert.status).toBe(200);
      expect(waren.inventurKnotenSpeichern).toHaveBeenCalledWith(
        'i1',
        'l1',
        [{ wareId: 'w1', gebindeId: 'gb1', mhd: '2027-01-01', anzahl: 0 }],
        ['w2'],
      );

      expect(
        (
          await app.request(
            '/api/inventuren/i1/zusammenfassung?zeitpunkt=gestern',
            json('reader-token', 'GET'),
          )
        ).status,
      ).toBe(400);
      expect(
        (await app.request('/api/inventuren/i1/zusammenfassung', json('reader-token', 'GET')))
          .status,
      ).toBe(404);

      const abschluss = (id: string, body: unknown) =>
        app.request(`/api/inventuren/${id}/abschluss`, json('reader-token', 'POST', body));
      expect((await abschluss('i1', { zeitpunkt: 'bald' })).status).toBe(400);
      const fertig = await abschluss('i1', { zeitpunkt });
      expect(await fertig.json()).toEqual({ vorgangId: 'v3' });
      expect((await abschluss('nope', { zeitpunkt })).status).toBe(404);
      waren.inventurAbschliessen.mockRejectedValueOnce(new WarenKonflikt('Bereits abgeschlossen.'));
      expect((await abschluss('i1', { zeitpunkt })).status).toBe(409);

      expect((await app.request('/api/inventuren/i1', json('reader-token', 'DELETE'))).status).toBe(
        200,
      );
    });
  });
});
