import { describe, expect, it } from 'vitest';
import { heuteBerlin, tagNachher } from '@c4/shared';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('schluessel anfragen und planungen', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const mitglied = (sub: string) => ({ art: 'mitglied', sub }) as const;
  const heute = heuteBerlin();
  const morgen = tagNachher(heute, 1);

  /** Profiles for a, r, v, m2 (v and m2 live in the Wohnheim), push for all, key "Haupttür" at r. */
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
        wohnheim: sub === 'v' || sub === 'm2' ? true : null,
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
    const { id } = (await res.json()) as { id: string };
    t.gesendet.length = 0;
    const anfrage = async (token: string, body: unknown) => {
      const r = await t.app.request('/api/schluessel/anfragen', json(token, 'POST', body));
      return { status: r.status, id: ((await r.json()) as { id?: string }).id ?? '' };
    };
    const antwort = (token: string, anfrageId: string, body: unknown) =>
      t.app.request(`/api/schluessel/anfragen/${anfrageId}/antwort`, json(token, 'PUT', body));
    const planungen = async () =>
      (await (
        await t.app.request(`/api/schluessel/${id}`, json('member-token', 'GET'))
      ).json()) as { planungen: { an: { sub: string }; zeitfenster: { datum: string } }[] };
    const empfaenger = () => t.gesendet.map((g) => g.endpoint.split('/').pop()).sort();
    return { ...t, id, anfrage, antwort, planungen, empfaenger };
  }

  const bedarf = (extra: Record<string, unknown> = {}) => ({
    art: 'bedarf',
    datum: heute,
    ab: '18:00',
    ...extra,
  });

  it('asks the holder of the named key, or the holders of all keys, for a Bedarf', async () => {
    const t = await setup();
    const r1 = await t.anfrage('member-token', bedarf({ schluesselId: t.id }));
    expect(r1.status).toBe(201);
    expect(t.empfaenger()).toEqual(['r']);
    expect(t.gesendet[0]).toMatchObject({
      text: 'user-m2 braucht den Schlüssel „Haupttür“ heute ab 18:00.',
      url: `/app/schluessel/anfragen/${r1.id}`,
    });
    t.gesendet.length = 0;
    await t.anfrage('member-token', bedarf());
    expect(t.empfaenger()).toEqual(['r']);
    expect(t.gesendet[0]!.text).toContain('einen Schlüssel');
  });

  it('asks the expected holder at the request time and never the creator', async () => {
    const t = await setup();
    const plan = await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: heute, ab: '20:00' }),
    );
    expect(plan.status).toBe(201);
    expect(t.empfaenger()).toEqual(['v']);
    // The plan is after the request: still the current holder.
    t.gesendet.length = 0;
    await t.anfrage('member-token', bedarf({ schluesselId: t.id }));
    expect(t.empfaenger()).toEqual(['r']);
    // The plan is before the request: the recipient.
    t.gesendet.length = 0;
    await t.anfrage('member-token', bedarf({ schluesselId: t.id, ab: '21:00' }));
    expect(t.empfaenger()).toEqual(['v']);
    // Same day without a time: unclear, ask both.
    t.gesendet.length = 0;
    await t.anfrage('member-token', bedarf({ schluesselId: t.id, ab: null }));
    expect(t.empfaenger()).toEqual(['r', 'v']);
    // Never the creator.
    t.gesendet.length = 0;
    await t.anfrage('vorstand-token', bedarf({ schluesselId: t.id, ab: null }));
    expect(t.empfaenger()).toEqual(['r']);
  });

  it('lets only the expected holder answer a Bedarf of "irgendeiner" with that key', async () => {
    const t = await setup();
    await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: heute, ab: '12:00' }),
    );
    // At 18:00 v holds the key, r no longer.
    const { id } = await t.anfrage('member-token', bedarf());
    expect(
      (await t.antwort('reader-token', id, { art: 'zusage', schluesselId: t.id })).status,
    ).toBe(403);
    expect(
      (await t.antwort('vorstand-token', id, { art: 'zusage', schluesselId: t.id })).status,
    ).toBe(200);
  });

  it('asks only Wohnheim members for an Abgabe, and only from a holder', async () => {
    const t = await setup();
    const ok = await t.anfrage('reader-token', {
      art: 'abgabe',
      schluesselId: t.id,
      datum: morgen,
    });
    expect(ok.status).toBe(201);
    expect(t.empfaenger()).toEqual(['m2', 'v']);
    expect(t.gesendet[0]!.text).toContain(
      'möchte den Schlüssel „Haupttür“ morgen im Laufe des Tages abgeben',
    );
    expect(
      (await t.anfrage('member-token', { art: 'abgabe', schluesselId: t.id, datum: morgen }))
        .status,
    ).toBe(409);
    expect((await t.anfrage('reader-token', { art: 'abgabe', datum: morgen })).status).toBe(400);
  });

  it('lets the first Zusage win and creates a planned handover', async () => {
    const t = await setup();
    await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: heute, ab: '20:00' }),
    );
    const { id } = await t.anfrage('member-token', bedarf({ schluesselId: t.id }));
    t.gesendet.length = 0;
    expect((await t.antwort('member-token', id, { art: 'zusage' })).status).toBe(403);
    expect((await t.antwort('admin-token', id, { art: 'zusage' })).status).toBe(403);
    expect((await t.antwort('reader-token', id, { art: 'zusage' })).status).toBe(200);
    expect(t.gesendet.map((g) => [g.endpoint.split('/').pop(), g.text])).toEqual([
      ['m2', 'user-r hat zugesagt.'],
    ]);
    expect((await t.antwort('vorstand-token', id, { art: 'zusage' })).status).toBe(409);
    const plaene = (await t.planungen()).planungen;
    expect(plaene.map((p) => p.an.sub)).toEqual(['m2', 'v']);
    expect(plaene[0]!.zeitfenster.datum).toBe(heute);
    const a = (await (
      await t.app.request(`/api/schluessel/anfragen/${id}`, json('member-token', 'GET'))
    ).json()) as { status: string; darfAntworten: boolean };
    expect(a).toMatchObject({ status: 'vergeben', darfAntworten: false });
  });

  it('tells the others that a request is settled', async () => {
    const t = await setup();
    await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: heute, ab: '20:00' }),
    );
    const { id } = await t.anfrage('member-token', bedarf({ schluesselId: t.id, ab: null }));
    await t.antwort('vorstand-token', id, { art: 'ablehnung' });
    t.gesendet.length = 0;
    await t.antwort('reader-token', id, { art: 'zusage' });
    expect(t.gesendet.map((g) => [g.endpoint.split('/').pop(), g.text])).toEqual([
      ['m2', 'user-r hat zugesagt.'],
      ['v', 'Die Anfrage von user-m2 hat sich erledigt.'],
    ]);
  });

  it('lets the creator accept a Gegenvorschlag', async () => {
    const t = await setup();
    const { id } = await t.anfrage('member-token', bedarf({ schluesselId: t.id }));
    expect((await t.antwort('reader-token', id, { art: 'gegenvorschlag' })).status).toBe(400);
    expect(
      (await t.antwort('reader-token', id, { art: 'gegenvorschlag', datum: morgen, ab: '10:00' }))
        .status,
    ).toBe(200);
    const detail = (await (
      await t.app.request(`/api/schluessel/anfragen/${id}`, json('member-token', 'GET'))
    ).json()) as { antworten: { id: string; art: string }[] };
    const vorschlag = detail.antworten[0]!;
    const annehmen = (token: string) =>
      t.app.request(
        `/api/schluessel/anfragen/${id}/antworten/${vorschlag.id}/annehmen`,
        json(token, 'POST'),
      );
    expect((await annehmen('reader-token')).status).toBe(403);
    t.gesendet.length = 0;
    expect((await annehmen('member-token')).status).toBe(200);
    expect(t.gesendet.map((g) => [g.endpoint.split('/').pop(), g.text])).toEqual([
      ['r', 'user-m2 hat deinen Vorschlag angenommen.'],
    ]);
    const plaene = (await t.planungen()).planungen;
    expect(plaene).toHaveLength(1);
    expect(plaene[0]).toMatchObject({ an: { sub: 'm2' }, zeitfenster: { datum: morgen } });
    expect((await annehmen('member-token')).status).toBe(409);
  });

  it('needs the key from the responder when the Bedarf names none', async () => {
    const t = await setup();
    const { id } = await t.anfrage('member-token', bedarf());
    expect((await t.antwort('reader-token', id, { art: 'zusage' })).status).toBe(400);
    expect(
      (await t.antwort('reader-token', id, { art: 'zusage', schluesselId: t.id })).status,
    ).toBe(200);
    expect((await t.planungen()).planungen[0]!.an.sub).toBe('m2');
  });

  it('plans the Abgabe for the responder, and only the creator may withdraw', async () => {
    const t = await setup();
    const { id } = await t.anfrage('reader-token', {
      art: 'abgabe',
      schluesselId: t.id,
      datum: heute,
    });
    expect(
      (await t.app.request(`/api/schluessel/anfragen/${id}/rueckzug`, json('member-token', 'PUT')))
        .status,
    ).toBe(403);
    expect((await t.antwort('vorstand-token', id, { art: 'zusage' })).status).toBe(200);
    expect((await t.planungen()).planungen.map((p) => p.an.sub)).toEqual(['v']);
    expect(
      (await t.app.request(`/api/schluessel/anfragen/${id}/rueckzug`, json('reader-token', 'PUT')))
        .status,
    ).toBe(409);
  });

  it('lists open requests and never withdrawn ones', async () => {
    const t = await setup();
    const a = await t.anfrage('member-token', bedarf());
    await t.anfrage('vorstand-token', bedarf());
    await t.app.request(`/api/schluessel/anfragen/${a.id}/rueckzug`, json('member-token', 'PUT'));
    const lesen = async (token: string) =>
      (await (await t.app.request('/api/schluessel/anfragen', json(token, 'GET'))).json()) as {
        id: string;
        darfAntworten: boolean;
      }[];
    expect(await lesen('reader-token')).toHaveLength(1);
    expect(await lesen('member-token')).toHaveLength(1);
    expect((await lesen('reader-token'))[0]!.darfAntworten).toBe(true);
  });

  it('hides a withdrawn request from its creator list but keeps the detail', async () => {
    const t = await setup();
    const { id } = await t.anfrage('member-token', bedarf());
    expect(
      (await t.app.request(`/api/schluessel/anfragen/${id}/rueckzug`, json('member-token', 'PUT')))
        .status,
    ).toBe(200);
    const liste = (await (
      await t.app.request('/api/schluessel/anfragen', json('member-token', 'GET'))
    ).json()) as { id: string }[];
    expect(liste.map((a) => a.id)).not.toContain(id);
    expect(
      (await t.app.request(`/api/schluessel/anfragen/${id}`, json('member-token', 'GET'))).status,
    ).toBe(200);
  });

  it('uses up the earliest planned handover when the key really moves', async () => {
    const t = await setup();
    const plan = (anSub: string, datum: string) =>
      t.app.request(
        `/api/schluessel/${t.id}/planungen`,
        json('reader-token', 'POST', { anSub, datum }),
      );
    await plan('m2', morgen);
    await plan('m2', tagNachher(heute, 3));
    await plan('v', tagNachher(heute, 2));
    const res = await t.app.request(
      `/api/schluessel/${t.id}/uebergaben`,
      json('reader-token', 'POST', { von: mitglied('r'), an: mitglied('m2') }),
    );
    expect(res.status).toBe(200);
    const rest = (await t.planungen()).planungen;
    expect(rest.map((p) => [p.an.sub, p.zeitfenster.datum])).toEqual([
      ['v', tagNachher(heute, 2)],
      ['m2', tagNachher(heute, 3)],
    ]);
  });

  it('drops the earliest planned handover when the key goes to someone else', async () => {
    const t = await setup();
    const plan = (anSub: string, datum: string) =>
      t.app.request(
        `/api/schluessel/${t.id}/planungen`,
        json('reader-token', 'POST', { anSub, datum }),
      );
    await plan('v', morgen);
    await plan('m2', tagNachher(heute, 3));
    const res = await t.app.request(
      `/api/schluessel/${t.id}/uebergaben`,
      json('reader-token', 'POST', { von: mitglied('r'), an: { art: 'person', name: 'ute' } }),
    );
    expect(res.status).toBe(200);
    expect((await t.planungen()).planungen.map((p) => p.an.sub)).toEqual(['m2']);
  });

  it('keeps Planungen when the key goes to nobody', async () => {
    const t = await setup();
    await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('reader-token', 'POST', { anSub: 'v', datum: morgen }),
    );
    const res = await t.app.request(
      `/api/schluessel/${t.id}/uebergaben`,
      json('admin-token', 'POST', { von: mitglied('r'), an: null }),
    );
    expect(res.status).toBe(200);
    expect((await t.planungen()).planungen).toHaveLength(1);
  });

  it('hides a Planung from the day after its date', async () => {
    const t = await setup();
    const gestern = tagNachher(heute, -1);
    for (const datum of [gestern, heute]) {
      await t.anfragenFake.store.planungAnlegen({
        schluesselId: t.id,
        anSub: 'v',
        datum,
        ab: null,
        bis: null,
        notiz: null,
        anfrageId: null,
        erstelltVon: 'r',
      });
    }
    expect((await t.planungen()).planungen.map((p) => p.zeitfenster.datum)).toEqual([heute]);
  });

  it('tells holder, previous and next holder about changed and deleted plans', async () => {
    const t = await setup();
    const angelegt = await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('admin-token', 'POST', { anSub: 'v', datum: heute, ab: '18:00' }),
    );
    const { id } = (await angelegt.json()) as { id: string };
    expect(t.empfaenger()).toEqual(['r', 'v']);
    t.gesendet.length = 0;
    await t.app.request(
      `/api/schluessel/planungen/${id}`,
      json('admin-token', 'PUT', { anSub: 'v', datum: heute, ab: '19:00' }),
    );
    expect(t.gesendet[0]!.text).toContain('geändert');
    t.gesendet.length = 0;
    expect(
      (await t.app.request(`/api/schluessel/planungen/${id}`, json('admin-token', 'DELETE')))
        .status,
    ).toBe(200);
    expect(t.empfaenger()).toEqual(['r', 'v']);
    expect((await t.planungen()).planungen).toHaveLength(0);
  });

  it('refuses to change a plan to the current holder or onto an archived key', async () => {
    const t = await setup();
    const angelegt = await t.app.request(
      `/api/schluessel/${t.id}/planungen`,
      json('admin-token', 'POST', { anSub: 'v', datum: heute, ab: '18:00' }),
    );
    const { id } = (await angelegt.json()) as { id: string };
    const aendern = (anSub: string) =>
      t.app.request(
        `/api/schluessel/planungen/${id}`,
        json('admin-token', 'PUT', { anSub, datum: heute, ab: '19:00' }),
      );
    expect((await aendern('r')).status).toBe(409);
    expect((await aendern('v')).status).toBe(200);
    await t.app.request(
      `/api/schluessel/${t.id}/archiv`,
      json('admin-token', 'PUT', { archiviert: true }),
    );
    expect((await aendern('v')).status).toBe(404);
  });

  it('refuses past days', async () => {
    const t = await setup();
    expect((await t.anfrage('member-token', bedarf({ datum: tagNachher(heute, -1) }))).status).toBe(
      400,
    );
  });
});
