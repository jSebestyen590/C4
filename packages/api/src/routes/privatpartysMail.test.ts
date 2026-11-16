import { describe, expect, it, vi } from 'vitest';
import { type PrivatpartyDetailDto } from '@c4/shared';
import { type EingehendeMail } from '../partymailTypen';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('privatpartys: Party-Mail', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let uid = 0;
  const mail = (extra: Partial<EingehendeMail> = {}): EingehendeMail => ({
    uid: ++uid,
    messageId: `<m${uid}@kunde.example>`,
    inReplyTo: null,
    referenzen: [],
    vonAdresse: 'eva@kunde.example',
    vonName: 'Eva Muster',
    anAdresse: 'party@party.example',
    betreff: 'Anfrage Geburtstag',
    text: 'Hallo, habt ihr am 14.3. Platz?',
    anhaenge: [],
    zeitpunkt: new Date(Date.UTC(2020, 0, 1, 10, uid)),
    ...extra,
  });

  async function setup() {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        ['a', 'v', 'm2'].map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of ['a', 'v', 'm2']) {
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
    // 'a' is admin (right via role), 'v' holds the right through a Posten, 'm2' has no right.
    t.userAdmin.rollen.mockResolvedValue(new Map([['a', ['admin']]]));
    t.posten.inhaberMitRecht.mockResolvedValue(['v']);
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['privatpartys:verwalten' as const] : [],
    );
    // Prime the position (first run imports nothing).
    t.partymail.uidValidity = '1';
    await t.privatpartys.abrufStandSetzen({ uidValidity: '1', letzteUid: 0 });
    t.gesendet.length = 0;
    const abrufen = async () =>
      t.app.request('/api/privatpartys/mail/abrufen', json('admin-token', 'POST'));
    const liste = async () =>
      (await (
        await t.app.request('/api/privatpartys?status=alle', json('admin-token', 'GET'))
      ).json()) as {
        id: string;
        unbeantwortet: boolean;
        mailAdresse: string | null;
        person: unknown;
      }[];
    const holen = async (id: string) =>
      (await (
        await t.app.request(`/api/privatpartys/${id}`, json('admin-token', 'GET'))
      ).json()) as PrivatpartyDetailDto;
    return { ...t, abrufen, liste, holen };
  }

  it('skips a run while another one holds the lease and takes over an expired lease', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail());
    const jetzt = new Date();
    expect(await t.privatpartys.abrufBelegen(jetzt, new Date(jetzt.getTime() + 60_000))).toBe(true);
    const res = await t.abrufen();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'Der Abruf läuft gerade schon.' });
    expect(await t.liste()).toHaveLength(0);
    // Expired lease: the next run takes over and releases it afterwards.
    await t.privatpartys.abrufFreigeben();
    expect(await t.privatpartys.abrufBelegen(jetzt, new Date(jetzt.getTime() - 1))).toBe(true);
    const res2 = await t.abrufen();
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ neu: 1 });
    expect(await t.privatpartys.abrufBelegen(new Date(), new Date(Date.now() + 1000))).toBe(true);
  });

  it('creates a blank entry for a new thread and notifies only the right holders', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail());
    const res = await t.abrufen();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ neu: 1 });
    const [eintrag] = await t.liste();
    expect(eintrag).toMatchObject({
      unbeantwortet: true,
      mailAdresse: 'eva@kunde.example',
      person: null,
    });
    const d = await t.holen(eintrag!.id);
    expect(d).toMatchObject({ status: 'offen', mailEingerichtet: true, termine: [] });
    expect(d.nachrichten).toMatchObject([{ richtung: 'ein', betreff: 'Anfrage Geburtstag' }]);
    expect(t.gesendet.map((g) => g.endpoint).sort()).toEqual([
      'https://push.example/a',
      'https://push.example/v',
    ]);
    expect(t.gesendet[0]).toMatchObject({ url: `/app/privatpartys/${eintrag!.id}` });
  });

  it('adds a reply in the thread to the same entry and skips duplicates', async () => {
    const t = await setup();
    const erste = mail();
    t.partymail.eingang.push(erste);
    await t.abrufen();
    t.gesendet.length = 0;
    const [eintrag] = await t.liste();
    t.partymail.eingang.push(
      mail({ inReplyTo: '<unbekannt@x>', referenzen: [erste.messageId, '<unbekannt@x>'] }),
    );
    // The same Message-ID again (e.g. a copy) is ignored.
    t.partymail.eingang.push(mail({ messageId: erste.messageId }));
    expect(await (await t.abrufen()).json()).toEqual({ neu: 1 });
    expect(await t.liste()).toHaveLength(1);
    expect((await t.holen(eintrag!.id)).nachrichten).toHaveLength(2);
    expect(t.gesendet.length).toBe(2);
    // The notification text of a follow-up differs from a new request.
    expect(t.gesendet[0]!.titel).toBe('Neue Nachricht zu einer Privatparty');
    // Unthreaded mail = new entry.
    t.partymail.eingang.push(mail());
    await t.abrufen();
    expect(await t.liste()).toHaveLength(2);
  });

  it('imports nothing when the mailbox was replaced and reports errors', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail());
    t.partymail.uidValidity = '2';
    expect(await (await t.abrufen()).json()).toEqual({ neu: 0 });
    expect(await t.liste()).toHaveLength(0);
    t.partymail.fehler = 'IMAP down';
    expect((await t.abrufen()).status).toBe(502);
    const status = await (
      await t.app.request('/api/privatpartys/mail-status', json('admin-token', 'GET'))
    ).json();
    expect(status).toMatchObject({ eingerichtet: true, fehler: 'IMAP down' });
  });

  it('stops at a mail that cannot be stored and retries it in the next run', async () => {
    const t = await setup();
    const [a, kaputt, c] = [mail(), mail(), mail()];
    t.partymail.eingang.push(a, kaputt, c);
    const echt = t.privatpartys.nachrichtAnlegen.bind(t.privatpartys);
    let ausfall = true;
    vi.spyOn(t.privatpartys, 'nachrichtAnlegen').mockImplementation(async (daten) => {
      if (ausfall && daten.messageId === kaputt.messageId) throw new Error('insert failed');
      return echt(daten);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await (await t.abrufen()).json()).toEqual({ neu: 1 });
    const stand = await t.privatpartys.abrufStand();
    expect(stand.letzteUid).toBe(a.uid);
    expect(stand.fehler).toBe(
      'Eine Mail konnte nicht gespeichert werden. Der Abruf versucht es beim nächsten Mal erneut.',
    );
    // The empty request created for the failing mail is removed again.
    expect(await t.liste()).toHaveLength(1);
    ausfall = false;
    expect(await (await t.abrufen()).json()).toEqual({ neu: 2 });
    expect(await t.liste()).toHaveLength(3);
    const danach = await t.privatpartys.abrufStand();
    expect(danach.letzteUid).toBe(c.uid);
    expect(danach.fehler).toBeNull();
  });

  it('truncates an oversized mail text to the outgoing limit', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail({ text: 'x'.repeat(30000) }));
    await t.abrufen();
    const d = await t.holen((await t.liste())[0]!.id);
    expect(d.nachrichten[0]!.text).toHaveLength(20000);
  });

  it('answers with thread headers, the sender and no notification', async () => {
    const t = await setup();
    const erste = mail({ betreff: 'Re: Anfrage' });
    t.partymail.eingang.push(erste);
    await t.abrufen();
    t.gesendet.length = 0;
    const id = (await t.liste())[0]!.id;
    const res = await t.app.request(
      `/api/privatpartys/${id}/nachrichten`,
      json('admin-token', 'POST', { text: 'Ja, der 14.3. geht.' }),
    );
    expect(res.status).toBe(201);
    expect(t.partymail.gesendet).toMatchObject([
      {
        an: 'eva@kunde.example',
        betreff: 'Re: Anfrage',
        inReplyTo: erste.messageId,
        referenzen: [erste.messageId],
        text: 'Ja, der 14.3. geht.',
      },
    ]);
    expect(t.partymail.abgelegt).toHaveLength(1);
    expect(t.gesendet).toHaveLength(0);
    const d = await t.holen(id);
    expect(d.unbeantwortet).toBe(false);
    expect(d.antwortAn).toBe('eva@kunde.example');
    expect(d.nachrichten[1]).toMatchObject({
      richtung: 'aus',
      gesendetVon: { sub: 'a', username: 'user-a' },
    });
    // A mail answering ours lands in the same entry.
    t.partymail.eingang.push(mail({ inReplyTo: t.partymail.gesendet[0]!.messageId }));
    await t.abrufen();
    expect(await t.liste()).toHaveLength(1);
  });

  it('refuses to answer without Party-Mail or address', async () => {
    const t = await setup();
    const personRes = await t.app.request(
      '/api/privatpartys/personen',
      json('admin-token', 'POST', { name: 'Ohne Mail' }),
    );
    const personId = ((await personRes.json()) as { id: string }).id;
    const neu = await t.app.request(
      '/api/privatpartys',
      json('admin-token', 'POST', {
        personId,
        termine: [{ datum: '2099-03-14', beginn: '19:00', ende: '02:00', stufe: 'bevorzugt' }],
      }),
    );
    const id = ((await neu.json()) as { id: string }).id;
    const antwort = (token = 'admin-token') =>
      t.app.request(`/api/privatpartys/${id}/nachrichten`, json(token, 'POST', { text: 'Hi' }));
    expect((await antwort()).status).toBe(400);
    expect((await antwort('member-token')).status).toBe(403);
    t.partymail.eingerichtet = false;
    const res = await antwort();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'Die Party-Mail ist nicht eingerichtet.' });
    expect((await t.abrufen()).status).toBe(409);
    expect((await t.holen(id)).mailEingerichtet).toBe(false);
    expect((await t.holen(id)).antwortAn).toBeNull();
  });

  it('uses the person address and a default subject for the first mail', async () => {
    const t = await setup();
    const personRes = await t.app.request(
      '/api/privatpartys/personen',
      json('admin-token', 'POST', { name: 'Eva', email: 'eva@x.de' }),
    );
    const personId = ((await personRes.json()) as { id: string }).id;
    const neu = await t.app.request(
      '/api/privatpartys',
      json('admin-token', 'POST', {
        personId,
        termine: [{ datum: '2099-03-14', beginn: '19:00', ende: '02:00', stufe: 'bevorzugt' }],
      }),
    );
    const id = ((await neu.json()) as { id: string }).id;
    await t.app.request(
      `/api/privatpartys/${id}/nachrichten`,
      json('admin-token', 'POST', { text: 'Hallo' }),
    );
    expect(t.partymail.gesendet[0]).toMatchObject({
      an: 'eva@x.de',
      betreff: 'Deine Anfrage beim C4',
      inReplyTo: null,
      referenzen: [],
    });
  });

  it('clamps the time of a mail with a Date header in the future to now', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail({ zeitpunkt: new Date('2099-01-01T00:00:00Z') }));
    const vorher = Date.now();
    await t.abrufen();
    const [eintrag] = await t.liste();
    const nachricht = (await t.holen(eintrag!.id)).nachrichten[0]!;
    expect(Date.parse(nachricht.zeitpunkt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(nachricht.zeitpunkt)).toBeGreaterThanOrEqual(vorher - 1000);
  });

  it('refuses to reply to an invalid reply address', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail({ vonAdresse: 'kein mail@' }));
    await t.abrufen();
    const [eintrag] = await t.liste();
    const res = await t.app.request(
      `/api/privatpartys/${eintrag!.id}/nachrichten`,
      json('admin-token', 'POST', { text: 'Hi' }),
    );
    expect(res.status).toBe(400);
    expect(t.partymail.gesendet).toHaveLength(0);
  });

  it('moves a message to another open request and deletes the emptied entry', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail(), mail({ vonAdresse: 'x@y.de' }));
    await t.abrufen();
    const alle = await t.liste();
    expect(alle).toHaveLength(2);
    const quelle = alle.find((e) => e.mailAdresse === 'x@y.de')!;
    const ziel = alle.find((e) => e.id !== quelle.id)!;
    const nachricht = (await t.holen(quelle.id)).nachrichten[0]!;
    const zuordnen = (nid: string, pid: string) =>
      t.app.request(
        `/api/privatpartys/nachrichten/${nid}/zuordnen`,
        json('admin-token', 'POST', { privatpartyId: pid }),
      );
    expect((await zuordnen(nachricht.id, quelle.id)).status).toBe(400);
    // Not open: refused.
    await t.app.request(
      `/api/privatpartys/${ziel.id}/status`,
      json('admin-token', 'PUT', { status: 'abgesagt' }),
    );
    expect((await zuordnen(nachricht.id, ziel.id)).status).toBe(409);
    await t.app.request(
      `/api/privatpartys/${ziel.id}/status`,
      json('admin-token', 'PUT', { status: 'offen' }),
    );
    const res = await zuordnen(nachricht.id, ziel.id);
    expect(await res.json()).toEqual({ ok: true, geloescht: true, id: ziel.id });
    expect(await t.liste()).toHaveLength(1);
    const d = await t.holen(ziel.id);
    expect(d.nachrichten).toHaveLength(2);
    expect(d.mailAdresse).toBe('x@y.de');
  });

  it('moves a message into a new blank request', async () => {
    const t = await setup();
    t.partymail.eingang.push(mail({ vonAdresse: 'alt@y.de' }));
    await t.abrufen();
    const quelle = (await t.liste())[0]!;
    const nachricht = (await t.holen(quelle.id)).nachrichten[0]!;
    const post = (body: unknown) =>
      t.app.request(
        `/api/privatpartys/nachrichten/${nachricht.id}/zuordnen`,
        json('admin-token', 'POST', body),
      );
    expect((await post({})).status).toBe(400);
    const res = await post({ neu: true });
    const antwort = (await res.json()) as { ok: boolean; geloescht: boolean; id: string };
    expect(antwort).toMatchObject({ ok: true, geloescht: true });
    const alle = await t.liste();
    expect(alle).toHaveLength(1);
    const d = await t.holen(antwort.id);
    expect(antwort.id).not.toBe(quelle.id);
    expect(d.status).toBe('offen');
    expect(d.person).toBeNull();
    expect(d.termine).toHaveLength(0);
    expect(d.mailAdresse).toBe('alt@y.de');
    expect(d.nachrichten).toHaveLength(1);
  });
});
