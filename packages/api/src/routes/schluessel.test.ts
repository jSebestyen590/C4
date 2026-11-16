import { describe, expect, it } from 'vitest';
import { SCHLUESSEL_VERLAUF_MAX } from '@c4/shared';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('schluessel', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const mitglied = (sub: string) => ({ art: 'mitglied', sub }) as const;

  /** App with profiles for a, r, v, m2 (usernames = sub), push devices for all and one key at `r`. */
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
      await t.push.store.aboSpeichern(sub, {
        endpoint: `https://push.example/${sub}`,
        keys: { p256dh: 'p', auth: 'a' },
      });
    }
    const res = await t.app.request(
      '/api/schluessel',
      json('admin-token', 'POST', { name: 'Haupttür', halter: mitglied('r') }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    t.gesendet.length = 0;
    const uebergeben = (token: string, body: unknown) =>
      t.app.request(`/api/schluessel/${id}/uebergaben`, json(token, 'POST', body));
    return { ...t, id, uebergeben };
  }

  it('lets every member read but only the key management write', async () => {
    const t = await setup();
    const liste = await t.app.request('/api/schluessel', json('member-token', 'GET'));
    expect(liste.status).toBe(200);
    expect(await liste.json()).toEqual([
      expect.objectContaining({
        name: 'Haupttür',
        halter: expect.objectContaining({ art: 'mitglied', sub: 'r', username: 'user-r' }),
      }),
    ]);
    expect(
      (await t.app.request('/api/schluessel', json('member-token', 'POST', { name: 'X' }))).status,
    ).toBe(403);
    expect(
      (
        await t.app.request(
          `/api/schluessel/${t.id}/archiv`,
          json('member-token', 'PUT', { archiviert: true }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await t.app.request('/api/schluessel?archiv=1', json('member-token', 'GET'))).status,
    ).toBe(403);
    expect(
      (
        await t.app.request(
          `/api/schluessel/${t.id}`,
          json('admin-token', 'PUT', { name: 'Hinten' }),
        )
      ).status,
    ).toBe(200);
  });

  it('lets only the key management enter the first holder', async () => {
    const t = await setup();
    const res = await t.app.request(
      '/api/schluessel',
      json('admin-token', 'POST', { name: 'Keller', halter: null }),
    );
    const { id } = (await res.json()) as { id: string };
    const uebergeben = (token: string) =>
      t.app.request(
        `/api/schluessel/${id}/uebergaben`,
        json(token, 'POST', { von: null, an: mitglied('m2') }),
      );
    const nein = await uebergeben('member-token');
    expect(nein.status).toBe(403);
    expect(await nein.json()).toEqual({
      error: 'Den ersten Halter trägt die Schlüsselverwaltung ein.',
    });
    const ja = await uebergeben('admin-token');
    expect(ja.status).toBe(200);
    expect(await ja.json()).toMatchObject({ halter: { art: 'mitglied', sub: 'm2' } });
  });

  it('tells the receiver when the holder hands the key over', async () => {
    const t = await setup();
    const res = await t.uebergeben('reader-token', { von: mitglied('r'), an: mitglied('m2') });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ halter: { art: 'mitglied', sub: 'm2' } });
    expect(t.gesendet).toEqual([
      {
        endpoint: 'https://push.example/m2',
        titel: 'Schlüssel „Haupttür“',
        text: 'user-r hat dir den Schlüssel übergeben.',
        url: `/app/schluessel/${t.id}`,
      },
    ]);
  });

  it('tells the previous holder when someone records receiving the key, even if switched off', async () => {
    const t = await setup();
    await t.push.store.einstellungSetzen('r', 'schluessel.uebergabe', false, null);
    const res = await t.uebergeben('member-token', { von: mitglied('r'), an: mitglied('m2') });
    expect(res.status).toBe(200);
    expect(t.gesendet).toEqual([
      expect.objectContaining({
        endpoint: 'https://push.example/r',
        text: 'user-m2 hat den Schlüssel von dir bekommen.',
      }),
    ]);
  });

  it('tells both parties when a third member records the Übergabe', async () => {
    const t = await setup();
    const res = await t.uebergeben('vorstand-token', { von: mitglied('r'), an: mitglied('m2') });
    expect(res.status).toBe(200);
    expect(t.gesendet.map((g) => [g.endpoint, g.text])).toEqual([
      [
        'https://push.example/m2',
        'user-v hat eingetragen, dass du den Schlüssel von user-r bekommen hast.',
      ],
      [
        'https://push.example/r',
        'user-v hat eingetragen, dass du den Schlüssel an user-m2 weitergegeben hast.',
      ],
    ]);
  });

  it('allows persons without the app, but nobody as holder only for the key management', async () => {
    const t = await setup();
    const res = await t.uebergeben('reader-token', {
      von: mitglied('r'),
      an: { art: 'person', name: 'Ute' },
    });
    expect(res.status).toBe(200);
    expect(t.gesendet).toHaveLength(0);
    expect(
      (await t.uebergeben('member-token', { von: { art: 'person', name: 'ute' }, an: null }))
        .status,
    ).toBe(403);
    expect(
      (await t.uebergeben('admin-token', { von: { art: 'person', name: 'ute' }, an: null })).status,
    ).toBe(200);
  });

  it('refuses an Übergabe from a holder that is no longer current', async () => {
    const t = await setup();
    expect(
      (await t.uebergeben('member-token', { von: mitglied('v'), an: mitglied('m2') })).status,
    ).toBe(409);
    expect(
      (await t.uebergeben('member-token', { von: mitglied('r'), an: mitglied('r') })).status,
    ).toBe(400);
    expect(
      (await t.uebergeben('member-token', { von: mitglied('r'), an: mitglied('unbekannt') }))
        .status,
    ).toBe(400);
    expect(t.gesendet).toHaveLength(0);
  });

  it('keeps only the newest Übergaben', async () => {
    const t = await setup();
    let von = 'r';
    for (let i = 0; i < 12; i++) {
      const an = von === 'r' ? 'm2' : 'r';
      expect(
        (await t.uebergeben('admin-token', { von: mitglied(von), an: mitglied(an) })).status,
      ).toBe(200);
      von = an;
    }
    const detail = (await (
      await t.app.request(`/api/schluessel/${t.id}`, json('member-token', 'GET'))
    ).json()) as { uebergaben: { eingetragenVon: { username: string } }[] };
    expect(detail.uebergaben).toHaveLength(SCHLUESSEL_VERLAUF_MAX);
    expect(detail.uebergaben[0]!.eingetragenVon).toMatchObject({ username: 'user-a' });
  });
});
