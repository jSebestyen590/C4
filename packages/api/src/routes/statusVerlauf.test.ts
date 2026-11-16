import { describe, expect, it } from 'vitest';
import { heuteBerlin, type MitgliedHistorie, type StatusEintrag, tagNachher } from '@c4/shared';
import { type MitgliedDaten } from '../mitglieder';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('Status-Verlauf', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const leer: MitgliedDaten = {
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
  };

  /** Profiles for a (admin), r (reader), m2 (member); r starts as Anwaerter today. */
  async function setup() {
    const t = makeApp();
    for (const sub of ['a', 'r', 'm2']) await t.mitglieder.speichern(sub, leer);
    const url = (sub = 'r', id = '') => `/api/admin/mitglieder/${sub}/status-verlauf${id}`;
    const historie = async (token = 'member-token', kennung = 'r') =>
      (await (
        await t.app.request(`/api/mitglieder/${kennung}/historie`, json(token, 'GET'))
      ).json()) as MitgliedHistorie;
    return { ...t, url, historie };
  }

  it('creates an entry with today when a member row is created', async () => {
    const t = await setup();
    expect((await t.historie()).statusVerlauf).toMatchObject([
      { status: 'anwaerter', ab: heuteBerlin() },
    ]);
  });

  it('is readable by members, with Posten and deactivation date', async () => {
    const t = await setup();
    const pid = await t.posten.anlegen({
      name: 'Kassenwart',
      beschreibung: null,
      bezeichnungMaennlich: null,
      bezeichnungWeiblich: null,
      bezeichnungNeutral: null,
    });
    await t.posten.besetzungAnlegen(pid, { mitgliedSub: 'r', start: '2024-01-01', ende: null });
    const res = await t.historie('member-token');
    expect(res.besetzungen).toEqual([
      { postenId: pid, postenName: 'Kassenwart', start: '2024-01-01', ende: null },
    ]);
    expect(res.deaktiviertAm).toBeNull();
    await t.mitglieder.deaktiviertSetzen('r', true);
    expect((await t.historie('member-token')).deaktiviertAm).toBe(heuteBerlin());
    expect(
      (await t.app.request('/api/mitglieder/unbekannt/historie', json('member-token', 'GET')))
        .status,
    ).toBe(404);
  });

  it('lets only admins edit the history', async () => {
    const t = await setup();
    const eingabe = { status: 'mitglied', ab: '2024-01-01' };
    expect((await t.app.request(t.url(), json('member-token', 'POST', eingabe))).status).toBe(403);
    expect(
      (await t.app.request(t.url('r', '/x'), json('reader-token', 'PUT', eingabe))).status,
    ).toBe(403);
    expect((await t.app.request(t.url('r', '/x'), json('reader-token', 'DELETE'))).status).toBe(
      403,
    );
  });

  it('keeps mitglieder.status on the newest entry', async () => {
    const t = await setup();
    const anlegen = (status: string, ab: string) =>
      t.app.request(t.url(), json('admin-token', 'POST', { status, ab }));
    expect((await anlegen('mitglied', '2020-01-01')).status).toBe(201);
    // older than today's Anwaerter entry: status stays
    expect((await t.mitglieder.holen('r'))?.status).toBe('anwaerter');
    const neu = (await (await anlegen('em', '2024-02-02')).json()) as StatusEintrag[];
    expect(neu.map((e) => e.ab)).toEqual(['2020-01-01', '2024-02-02', heuteBerlin()]);
    expect((await t.mitglieder.holen('r'))?.status).toBe('anwaerter');

    const heute = neu.find((e) => e.ab === heuteBerlin())!;
    // editing the date of today's entry to before the others makes "em" the newest
    const geaendert = await t.app.request(
      t.url('r', `/${heute.id}`),
      json('admin-token', 'PUT', { status: 'anwaerter', ab: '2019-01-01' }),
    );
    expect(geaendert.status).toBe(200);
    expect((await t.mitglieder.holen('r'))?.status).toBe('em');

    const em = neu.find((e) => e.status === 'em')!;
    const geloescht = await t.app.request(t.url('r', `/${em.id}`), json('admin-token', 'DELETE'));
    expect(geloescht.status).toBe(200);
    expect(((await geloescht.json()) as StatusEintrag[]).map((e) => e.status)).toEqual([
      'anwaerter',
      'mitglied',
    ]);
    expect((await t.mitglieder.holen('r'))?.status).toBe('mitglied');
  });

  it('rejects unknown entries, future dates, duplicates and deleting the last entry', async () => {
    const t = await setup();
    const heute = heuteBerlin();
    const eintrag = (await t.historie()).statusVerlauf[0]!;
    const post = (body: unknown, sub = 'r') =>
      t.app.request(t.url(sub), json('admin-token', 'POST', body));
    expect((await post({ status: 'mitglied', ab: '2024-01-01' }, 'unbekannt')).status).toBe(404);
    expect(
      (await t.app.request(t.url('r', '/gibtsnicht'), json('admin-token', 'DELETE'))).status,
    ).toBe(404);
    expect(
      (
        await t.app.request(
          t.url('r', '/gibtsnicht'),
          json('admin-token', 'PUT', { status: 'em', ab: '2024-01-01' }),
        )
      ).status,
    ).toBe(404);
    expect((await post({ status: 'mitglied', ab: tagNachher(heute, 1) })).status).toBe(400);
    expect((await post({ status: 'quatsch', ab: '2024-01-01' })).status).toBe(400);
    expect((await post({ status: 'mitglied', ab: heute })).status).toBe(409);
    const res = await t.app.request(t.url('r', `/${eintrag.id}`), json('admin-token', 'DELETE'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Der letzte Statuseintrag kann nicht gelöscht werden.',
    });
    // changing an entry onto another entry's day is a conflict, onto itself is fine
    await post({ status: 'mitglied', ab: '2024-01-01' });
    const [alt] = (await t.historie()).statusVerlauf;
    const auf = (ab: string) =>
      t.app.request(
        t.url('r', `/${alt!.id}`),
        json('admin-token', 'PUT', { status: 'mitglied', ab }),
      );
    expect((await auf(heute)).status).toBe(409);
    expect((await auf('2024-01-01')).status).toBe(200);
  });

  it('refuses to edit the history of a deactivated account', async () => {
    const t = await setup();
    const eintrag = (await t.historie()).statusVerlauf[0]!;
    await t.mitglieder.deaktiviertSetzen('r', true);
    for (const res of [
      await t.app.request(t.url(), json('admin-token', 'POST', { status: 'em', ab: '2024-01-01' })),
      await t.app.request(
        t.url('r', `/${eintrag.id}`),
        json('admin-token', 'PUT', { status: 'em', ab: '2024-01-01' }),
      ),
      await t.app.request(t.url('r', `/${eintrag.id}`), json('admin-token', 'DELETE')),
    ]) {
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toMatch(
        /^Der Account ist deaktiviert/,
      );
    }
  });

  it('PUT status takes an optional start date, default today', async () => {
    const t = await setup();
    const setze = (body: unknown) =>
      t.app.request('/api/admin/mitglieder/r/status', json('admin-token', 'PUT', body));
    expect((await setze({ status: 'mitglied', ab: tagNachher(heuteBerlin(), 1) })).status).toBe(
      400,
    );
    expect((await setze({ status: 'mitglied', ab: '2023-05-05' })).status).toBe(200);
    expect((await t.historie()).statusVerlauf.map((e) => [e.status, e.ab])).toEqual([
      ['mitglied', '2023-05-05'],
      ['anwaerter', heuteBerlin()],
    ]);
    // without ab: overwrites today's entry
    expect((await setze({ status: 'em' })).status).toBe(200);
    expect((await t.historie()).statusVerlauf.map((e) => [e.status, e.ab])).toEqual([
      ['mitglied', '2023-05-05'],
      ['em', heuteBerlin()],
    ]);
    expect((await t.mitglieder.holen('r'))?.status).toBe('em');
  });

  it('creates an entry with today when an admin invites', async () => {
    const t = await setup();
    t.userAdmin.createUser.mockResolvedValueOnce({
      username: 'u',
      email: 'x@example.de',
      sub: 'neu',
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
      groups: [],
    });
    await t.app.request(
      '/api/admin/users',
      json('admin-token', 'POST', { email: 'x@example.de', status: 'mitglied' }),
    );
    expect(await t.mitglieder.statusVerlauf('neu')).toMatchObject([
      { status: 'mitglied', ab: heuteBerlin() },
    ]);
  });
});
