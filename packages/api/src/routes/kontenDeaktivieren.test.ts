import { describe, expect, it } from 'vitest';
import { heuteBerlin, tagNachher } from '@c4/shared';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('accounts deaktivieren', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  /** Profiles for a (admin), r, v, m2 with Cognito accounts `user-<sub>`. */
  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'r', 'v', 'm2'].map((sub) => [
          sub,
          {
            sub,
            kontoName: `konto-${sub}`,
            username: `user-${sub}`,
            aktiviert: true,
            enabled: true,
          },
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
    const aktiv = (token: string, sub: string, aktiv: boolean) =>
      t.app.request(`/api/admin/mitglieder/${sub}/aktiv`, json(token, 'PUT', { aktiv }));
    return { ...t, aktiv };
  }

  it('lets only users:manage (de)activate, never yourself, and mirrors it in Cognito', async () => {
    const t = await setup();
    expect((await t.aktiv('reader-token', 'm2', false)).status).toBe(403);
    expect((await t.aktiv('member-token', 'm2', false)).status).toBe(403);
    expect(
      (await t.app.request('/api/admin/mitglieder/m2/aktiv', json('admin-token', 'PUT', {})))
        .status,
    ).toBe(400);
    const selbst = await t.aktiv('admin-token', 'a', false);
    expect(selbst.status).toBe(400);
    expect(await selbst.json()).toEqual({ error: 'Du kannst dich nicht selbst deaktivieren.' });
    expect((await t.aktiv('admin-token', 'unbekannt', false)).status).toBe(404);
    expect(t.userAdmin.setEnabled).not.toHaveBeenCalled();

    const aus = await t.aktiv('admin-token', 'm2', false);
    expect(aus.status).toBe(200);
    expect(await aus.json()).toEqual({ aktiv: false });
    expect(t.mitglieder.deaktiviertSetzen).toHaveBeenLastCalledWith('m2', true);
    expect(t.userAdmin.setEnabled).toHaveBeenLastCalledWith('konto-m2', false);

    const an = await t.aktiv('admin-token', 'm2', true);
    expect(await an.json()).toEqual({ aktiv: true });
    expect(t.mitglieder.deaktiviertSetzen).toHaveBeenLastCalledWith('m2', false);
    expect(t.userAdmin.setEnabled).toHaveBeenLastCalledWith('konto-m2', true);
  });

  it('refuses to change the status of a deactivated account', async () => {
    const t = await setup();
    const setze = (status: string) =>
      t.app.request('/api/admin/mitglieder/m2/status', json('admin-token', 'PUT', { status }));
    await t.aktiv('admin-token', 'm2', false);
    const res = await setze('em');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Der Account ist deaktiviert, der Status kann nicht geändert werden.',
    });
    expect((await t.mitglieder.holen('m2'))?.status).toBe('anwaerter');
    await t.aktiv('admin-token', 'm2', true);
    expect((await setze('em')).status).toBe(200);
  });

  it('creates an empty row when the member has none yet', async () => {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map([['neu', { sub: 'neu', kontoName: 'konto-neu', aktiviert: true, enabled: true }]]),
    );
    const res = await t.app.request(
      '/api/admin/mitglieder/neu/aktiv',
      json('admin-token', 'PUT', { aktiv: false }),
    );
    expect(res.status).toBe(200);
    expect((await t.mitglieder.holen('neu'))?.deaktiviertAm).toBeInstanceOf(Date);
    expect((await t.mitglieder.holen('neu'))?.status).toBe('anwaerter');
  });

  it('answers requests of a deactivated member with 403 and a distinguishable body', async () => {
    const t = await setup();
    expect((await t.app.request('/api/me', json('reader-token', 'GET'))).status).toBe(200);
    await t.aktiv('admin-token', 'r', false);
    for (const url of [
      '/api/me',
      '/api/mitglieder',
      '/api/kalender/events?von=2026-01-01&bis=2026-01-31',
    ]) {
      const res = await t.app.request(url, json('reader-token', 'GET'));
      expect(res.status, url).toBe(403);
      expect(await res.json()).toEqual({
        error: 'Dein Account ist deaktiviert.',
        deaktiviert: true,
      });
    }
    // other 403s do not carry the flag
    const verboten = await t.app.request('/api/admin/users', json('member-token', 'POST', {}));
    expect(await verboten.json()).toEqual({ error: 'Forbidden' });
    await t.aktiv('admin-token', 'r', true);
    expect((await t.app.request('/api/me', json('reader-token', 'GET'))).status).toBe(200);
  });

  it('lists deactivated members only for admins who ask, but the detail always works', async () => {
    const t = await setup();
    await t.aktiv('admin-token', 'm2', false);
    const subs = async (url: string, token: string) =>
      ((await (await t.app.request(url, json(token, 'GET'))).json()) as { sub: string }[]).map(
        (m) => m.sub,
      );
    expect(await subs('/api/mitglieder', 'admin-token')).not.toContain('m2');
    expect(await subs('/api/mitglieder', 'reader-token')).not.toContain('m2');
    expect(await subs('/api/mitglieder?deaktivierte=1', 'reader-token')).not.toContain('m2');
    const mit = await t.app.request('/api/mitglieder?deaktivierte=1', json('admin-token', 'GET'));
    const liste = (await mit.json()) as { sub: string; deaktiviert: boolean }[];
    expect(liste.find((m) => m.sub === 'm2')).toMatchObject({ deaktiviert: true });
    expect(liste.find((m) => m.sub === 'r')).toMatchObject({ deaktiviert: false });
    for (const token of ['reader-token', 'admin-token']) {
      const detail = await t.app.request('/api/mitglieder/user-m2', json(token, 'GET'));
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({ sub: 'm2', deaktiviert: true });
    }
  });

  it('previews future Dienste, current Posten and held keys', async () => {
    const t = await setup();
    const heute = heuteBerlin();
    const dienst = (id: string, eventId: string, tage: number, abgesagt = false) => ({
      id,
      eventId,
      eventTitel: `Event ${eventId}`,
      schichtArt: 'betrieb' as const,
      dienstformName: 'Bar',
      beginn: `${tagNachher(heute, tage)}T18:00:00.000Z`,
      ende: `${tagNachher(heute, tage)}T21:00:00.000Z`,
      abgesagt,
    });
    t.kalender.meineDienste.mockResolvedValue([
      dienst('d0', 'e0', -3),
      dienst('d1', 'e1', 2),
      dienst('d2', 'e1', 2),
      dienst('d3', 'e2', 5, true),
      dienst('d4', 'e3', 7),
    ]);
    t.posten.aktuelleNachMitglied.mockResolvedValue(
      new Map([
        [
          'm2',
          [
            {
              id: 'p1',
              name: 'Kasse',
              bezeichnungMaennlich: null,
              bezeichnungWeiblich: null,
              bezeichnungNeutral: null,
            },
          ],
        ],
      ]),
    );
    await t.schluessel.anlegen(
      { name: 'Haupttür', beschreibung: null, halter: { art: 'mitglied', sub: 'm2' } },
      'a',
    );
    await t.schluessel.anlegen(
      { name: 'Keller', beschreibung: null, halter: { art: 'mitglied', sub: 'r' } },
      'a',
    );
    const res = await t.app.request(
      '/api/admin/mitglieder/m2/deaktivieren-vorschau',
      json('admin-token', 'GET'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dienste: [
        { eventId: 'e1', titel: 'Event e1', datum: tagNachher(heute, 2) },
        { eventId: 'e3', titel: 'Event e3', datum: tagNachher(heute, 7) },
      ],
      posten: [{ id: 'p1', name: 'Kasse' }],
      schluessel: [{ id: 's1', name: 'Haupttür' }],
    });
    expect(t.kalender.meineDienste).toHaveBeenLastCalledWith('m2', expect.any(Date));
    expect(
      (
        await t.app.request(
          '/api/admin/mitglieder/m2/deaktivieren-vorschau',
          json('reader-token', 'GET'),
        )
      ).status,
    ).toBe(403);
  });

  it('refuses to enter a deactivated member', async () => {
    const t = await setup();
    await t.aktiv('admin-token', 'm2', false);
    const abgelehnt = async (res: Response) => {
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Das Mitglied ist deaktiviert.' });
    };
    // Dienst by somebody else
    await abgelehnt(
      await t.app.request(
        '/api/kalender/schichten/s1/dienste',
        json('reader-token', 'POST', { dienstformId: 'f1', mitgliedSub: 'm2' }),
      ),
    );
    expect(t.kalender.dienstEintragen).not.toHaveBeenCalled();
    // Posten holder
    const p = await t.app.request(
      '/api/posten',
      json('admin-token', 'POST', { name: 'Kasse', beschreibung: null }),
    );
    const { id } = (await p.json()) as { id: string };
    await abgelehnt(
      await t.app.request(
        `/api/posten/${id}/besetzungen`,
        json('admin-token', 'POST', { mitgliedSub: 'm2', start: heuteBerlin() }),
      ),
    );
    // Key holder and Übergabe
    await abgelehnt(
      await t.app.request(
        '/api/schluessel',
        json('admin-token', 'POST', { name: 'Tür', halter: { art: 'mitglied', sub: 'm2' } }),
      ),
    );
    const s = await t.app.request(
      '/api/schluessel',
      json('admin-token', 'POST', { name: 'Tür', halter: { art: 'mitglied', sub: 'r' } }),
    );
    const { id: schluesselId } = (await s.json()) as { id: string };
    await abgelehnt(
      await t.app.request(
        `/api/schluessel/${schluesselId}/uebergaben`,
        json('reader-token', 'POST', {
          von: { art: 'mitglied', sub: 'r' },
          an: { art: 'mitglied', sub: 'm2' },
        }),
      ),
    );
    // Trichter participant
    const tr = await t.app.request(
      '/api/trichter',
      json('admin-token', 'POST', { name: 'Dicker', volumenL: 3, auslaesse: 2 }),
    );
    const { id: trichterId } = (await tr.json()) as { id: string };
    await abgelehnt(
      await t.app.request(
        '/api/trichter/durchgaenge',
        json('reader-token', 'POST', { trichterId, volumenL: 2, teilnehmende: ['m2'] }),
      ),
    );
    // individual in a poll circle
    const umfrage = {
      titel: 'Fest',
      beschreibung: null,
      endetAm: tagNachher(heuteBerlin(), 10),
      anonym: false,
      ergebnisse: 'sofort',
      pflicht: { status: [], posten: [], personen: ['m2'] },
      optional: { status: [], posten: [], personen: [] },
      erinnerungenPflicht: [],
      erinnerungenOptional: [],
      fragen: [{ text: 'Wann?', freitext: true, maxAntworten: 1, optionen: [{ text: 'Samstag' }] }],
    };
    await abgelehnt(await t.app.request('/api/umfragen', json('admin-token', 'POST', umfrage)));
    // reactivated: allowed again
    await t.aktiv('admin-token', 'm2', true);
    expect(
      (await t.app.request('/api/umfragen', json('admin-token', 'POST', umfrage))).status,
    ).toBe(201);
  });

  it('keeps names of deactivated members in old Trichter entries', async () => {
    const t = await setup();
    const tr = await t.app.request(
      '/api/trichter',
      json('admin-token', 'POST', { name: 'Dicker', volumenL: 3, auslaesse: 2 }),
    );
    const { id: trichterId } = (await tr.json()) as { id: string };
    const eintrag = await t.app.request(
      '/api/trichter/durchgaenge',
      json('reader-token', 'POST', { trichterId, volumenL: 2, teilnehmende: ['m2'] }),
    );
    expect(eintrag.status).toBe(201);
    await t.aktiv('admin-token', 'm2', false);
    const liste = await t.app.request('/api/trichter/durchgaenge', json('admin-token', 'GET'));
    expect(JSON.stringify(await liste.json())).toContain('user-m2');
  });

  it('hides deactivated members from the birthday calendar', async () => {
    const t = await setup();
    await t.mitglieder.speichern('m2', {
      vorname: 'Eva',
      nachname: 'Muster',
      anrede: 'weiblich',
      kontaktkanaele: null,
      discordName: null,
      adresse: null,
      telefon: null,
      ueberMich: null,
      profilbildKey: null,
      geburtsdatum: '1990-06-20',
      geburtstagImKalender: true,
      wohnheim: null,
    });
    const abfrage = async () =>
      (await (
        await t.app.request(
          '/api/kalender/geburtstage?von=2026-06-01&bis=2026-06-30',
          json('reader-token', 'GET'),
        )
      ).json()) as unknown[];
    expect(await abfrage()).toHaveLength(1);
    await t.aktiv('admin-token', 'm2', false);
    expect(await abfrage()).toHaveLength(0);
  });
});
