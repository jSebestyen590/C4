import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type EventDto,
  type ProtokollDokument,
  type EventKategorieDto,
  type ProtokollAktionenAntwort,
  type ProtokollAktionenAusfuehrenAntwort,
  type ProtokollDto,
  type ProtokollStatusAntwort,
  type ProtokollListeEintragDto,
  bausteinErzeugen,
  bausteinLeer,
  protokollKopfLeer,
  protokollLeer,
  type ProtokollKnoten,
} from '@c4/shared';
import { EntfernungBestaetigen, KalenderUngueltig, type EventKurz } from '../kalender';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('protokolle', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const sitzungsKategorie = { id: 'k1', name: 'Sitzung', farbe: 'red' };
  const sitzung = (id: string, beginn: string, extra: Partial<EventKurz> = {}): EventKurz => ({
    id,
    titel: 'Sitzung',
    beginn,
    ende: new Date(Date.parse(beginn) + 2 * 3600_000).toISOString(),
    abgesagt: false,
    kategorie: sitzungsKategorie,
    protokoll: true,
    protokollArt: 'sitzung',
    ...extra,
  });

  /**
   * Members: `a` (admin), `r` (reader, Anwärter:in), `v` (holds the right `protokolle:schreiben`), `m2`
   * (Mitglied), `e1`/`e2` (EMs), `x` (deactivated Mitglied). Events: `s1` and `s2` are Sitzungen, `b1` a
   * Barabend (no protocol), `s3` a Sitzung of another day that is cancelled.
   */
  async function setup() {
    const t = makeApp();
    const subs = ['a', 'r', 'v', 'm2', 'e1', 'e2', 'x'];
    t.userAdmin.konten.mockResolvedValue(
      new Map(
        subs.map((sub) => [
          sub,
          { sub, kontoName: sub, username: `user-${sub}`, aktiviert: true, enabled: true },
        ]),
      ),
    );
    for (const sub of subs) {
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
    for (const sub of ['m2', 'x']) await t.mitglieder.statusSetzen(sub, 'mitglied');
    for (const sub of ['e1', 'e2']) await t.mitglieder.statusSetzen(sub, 'em');
    await t.mitglieder.deaktiviertSetzen('x', true);
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['protokolle:schreiben' as const] : [],
    );
    const events = new Map<string, EventKurz>(
      [
        sitzung('s1', '2026-10-06T17:00:00.000Z'),
        sitzung('s2', '2026-11-03T18:00:00.000Z'),
        sitzung('s3', '2026-11-10T18:00:00.000Z', { abgesagt: true }),
        sitzung('b1', '2026-10-20T18:00:00.000Z', { titel: 'Barabend', protokoll: false }),
      ].map((e) => [e.id, e]),
    );
    t.kalender.eventsKurz.mockImplementation(async (ids) =>
      ids.flatMap((id) => (events.has(id) ? [events.get(id)!] : [])),
    );
    const antworten: Record<string, 'teilnahme' | 'absage'> = {};
    t.kalender.teilnahmeAntworten.mockImplementation(async () => ({ ...antworten }));

    const anlegen = (token: string, body: Record<string, unknown>) =>
      t.app.request('/api/protokolle', json(token, 'POST', body));
    const holen = async (id: string) =>
      (await (
        await t.app.request(`/api/protokolle/${id}`, json('reader-token', 'GET'))
      ).json()) as ProtokollDto;
    const absatz = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    /** A document with a future Event block with the given text in "Zukünftiges". */
    const mitEvent = (
      datum: string,
      text: string,
      extra: Record<string, unknown> = {},
    ): ProtokollDokument => {
      const doc = protokollLeer();
      doc.content[2]!.content = [
        bausteinErzeugen(
          'bausteinEvent',
          { ...bausteinLeer('bausteinEvent'), name: 'Barabend', datum, ...extra },
          [absatz(text)],
        ),
      ];
      return doc;
    };
    // Saving and changing the status need the edit lock: unless a test sends its own `X-Tab-Id`,
    // the request runs with a lock taken (and released) for the same caller around it.
    const basis = t.app;
    const sperreAnfrage = async (
      url: string,
      methode: string,
      kopf: HeadersInit | undefined,
    ): Promise<void> => {
      await basis.request(`${url}/sperre`, {
        method: methode,
        headers: { ...(kopf as Record<string, string>), 'x-tab-id': 'auto-tab' },
      });
    };
    const app = Object.assign(Object.create(basis) as typeof basis, {
      request: async (input: string | Request | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : '';
        const treffer = /^(\/api\/protokolle\/[^/]+)(\/status)?$/.exec(url);
        const headers = init?.headers as Record<string, string> | undefined;
        if (!treffer || init?.method !== 'PUT' || headers?.['x-tab-id']) {
          return basis.request(input, init);
        }
        await sperreAnfrage(treffer[1]!, 'POST', headers);
        try {
          return await basis.request(input, {
            ...init,
            headers: { ...headers, 'x-tab-id': 'auto-tab' },
          });
        } finally {
          await sperreAnfrage(treffer[1]!, 'DELETE', headers);
        }
      },
    });
    return { ...t, app, events, antworten, anlegen, holen, mitEvent };
  }

  it('lets everybody read but only writers change protocols', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    expect((await t.app.request('/api/protokolle', json('reader-token', 'GET'))).status).toBe(200);
    expect((await t.app.request(`/api/protokolle/${id}`, json('reader-token', 'GET'))).status).toBe(
      200,
    );
    const dto = await t.holen(id);
    for (const [url, method, body] of [
      ['/api/protokolle', 'POST', { eventId: 's2' }],
      [`/api/protokolle/${id}`, 'PUT', { inhalt: dto.inhalt, kopf: dto.kopf, version: 1 }],
      [`/api/protokolle/${id}/status`, 'PUT', { status: 'abgeschlossen' }],
      [`/api/protokolle/${id}`, 'DELETE', undefined],
      ['/api/protokolle/sitzungen', 'GET', undefined],
      ['/api/protokolle/vorschlag?eventId=s2', 'GET', undefined],
    ] as const) {
      for (const token of ['reader-token', 'member-token']) {
        const res = await t.app.request(url, json(token, method, body));
        expect(res.status, `${token} ${method} ${url}`).toBe(403);
      }
    }
    expect((await t.app.request('/api/protokolle')).status).toBe(401);
    // A Posten with the right is enough.
    expect((await t.anlegen('vorstand-token', { eventId: 's2' })).status).toBe(201);
    expect(t.protokollListe.size).toBe(2);
  });

  describe('Bearbeitungssperre', () => {
    const tab = (token: string, methode: string, tabId: string, body?: unknown) => {
      const o = json(token, methode, body);
      return { ...o, headers: { ...o.headers, 'x-tab-id': tabId } };
    };
    const url = (id: string, pfad = '') => `/api/protokolle/${id}${pfad}`;
    const nehmen = (
      t: Awaited<ReturnType<typeof setup>>,
      id: string,
      token: string,
      tabId: string,
    ) => t.app.request(url(id, '/sperre'), tab(token, 'POST', tabId));
    const gesperrt = async (res: Response) => {
      expect(res.status).toBe(409);
      return (await res.json()) as {
        error: string;
        sperre: { von: { username: string | null; status: string } | null; eigene: boolean };
      };
    };
    afterEach(() => vi.useRealTimers());

    async function mitEntwurf() {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      return { t, id, dto: await t.holen(id) };
    }

    it('lets one tab take and extend the lock; a second tab of the same person is locked out', async () => {
      const { t, id } = await mitEntwurf();
      expect((await nehmen(t, id, 'admin-token', 'tab-1')).status).toBe(200);
      expect((await nehmen(t, id, 'admin-token', 'tab-1')).status).toBe(200);
      const body = await gesperrt(await nehmen(t, id, 'admin-token', 'tab-2'));
      expect(body.error).toBe('Das Protokoll wird gerade von jemand anderem bearbeitet.');
      expect(body.sperre.eigene).toBe(true);
      expect(body.sperre.von?.username).toBe('user-a');
    });

    it('locks out other people, admins included, who see who edits', async () => {
      const { t, id } = await mitEntwurf();
      expect((await nehmen(t, id, 'vorstand-token', 'tab-v')).status).toBe(200);
      const body = await gesperrt(await nehmen(t, id, 'admin-token', 'tab-a'));
      expect(body.sperre.eigene).toBe(false);
      expect(body.sperre.von?.username).toBeTruthy();
      expect(body.sperre.von?.status).toBeTruthy();
    });

    it('needs the writing right and a tab id', async () => {
      const { t, id } = await mitEntwurf();
      expect((await nehmen(t, id, 'reader-token', 'tab-1')).status).toBe(403);
      expect((await t.app.request(url(id, '/sperre'), json('admin-token', 'POST'))).status).toBe(
        400,
      );
      expect((await nehmen(t, 'gibtsnicht', 'admin-token', 'tab-1')).status).toBe(404);
    });

    it('expires two minutes after the last heartbeat', async () => {
      const { t, id } = await mitEntwurf();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
      await nehmen(t, id, 'vorstand-token', 'tab-v');
      vi.setSystemTime(new Date('2026-11-01T10:01:30Z'));
      await nehmen(t, id, 'vorstand-token', 'tab-v');
      vi.setSystemTime(new Date('2026-11-01T10:03:00Z'));
      await gesperrt(await nehmen(t, id, 'admin-token', 'tab-a'));
      vi.setSystemTime(new Date('2026-11-01T10:03:31Z'));
      expect((await nehmen(t, id, 'admin-token', 'tab-a')).status).toBe(200);
    });

    it('releases only for the holding tab', async () => {
      const { t, id } = await mitEntwurf();
      await nehmen(t, id, 'admin-token', 'tab-1');
      await t.app.request(url(id, '/sperre'), tab('admin-token', 'DELETE', 'tab-2'));
      await gesperrt(await nehmen(t, id, 'admin-token', 'tab-2'));
      await t.app.request(url(id, '/sperre'), tab('vorstand-token', 'DELETE', 'tab-1'));
      await gesperrt(await nehmen(t, id, 'vorstand-token', 'tab-1'));
      expect(
        (await t.app.request(url(id, '/sperre'), tab('admin-token', 'DELETE', 'tab-1'))).status,
      ).toBe(200);
      expect((await nehmen(t, id, 'vorstand-token', 'tab-v')).status).toBe(200);
    });

    it('rejects saving and closing without the lock', async () => {
      const { t, id, dto } = await mitEntwurf();
      const speichern = (token: string, tabId: string, version = dto.version) =>
        t.app.request(
          url(id),
          tab(token, 'PUT', tabId, { inhalt: dto.inhalt, kopf: dto.kopf, version }),
        );
      const schliessen = (token: string, tabId: string) =>
        t.app.request(url(id, '/status'), tab(token, 'PUT', tabId, { status: 'abgeschlossen' }));
      // Nobody holds it: nobody may save.
      const frei = await gesperrt(await speichern('admin-token', 'tab-1'));
      expect(frei.sperre).toEqual({ von: null, eigene: false });
      await gesperrt(await schliessen('admin-token', 'tab-1'));
      await nehmen(t, id, 'admin-token', 'tab-1');
      // Another tab, another person: locked out.
      expect((await gesperrt(await speichern('admin-token', 'tab-2'))).sperre.eigene).toBe(true);
      expect((await gesperrt(await speichern('vorstand-token', 'tab-1'))).sperre.eigene).toBe(
        false,
      );
      await gesperrt(await schliessen('admin-token', 'tab-2'));
      expect(t.protokollListe.get(id)?.version).toBe(dto.version);
      // The holder may.
      expect((await speichern('admin-token', 'tab-1')).status).toBe(200);
      expect((await schliessen('admin-token', 'tab-1')).status).toBe(200);
      expect(t.protokollListe.get(id)?.status).toBe('abgeschlossen');
    });

    it('refuses deleting a draft while another tab holds the lock', async () => {
      const { t, id } = await mitEntwurf();
      const loeschen = (token: string, tabId: string) =>
        t.app.request(url(id), tab(token, 'DELETE', tabId));
      await nehmen(t, id, 'vorstand-token', 'tab-v');
      const body = await gesperrt(await loeschen('admin-token', 'tab-a'));
      expect(body.sperre.eigene).toBe(false);
      expect(t.protokollListe.has(id)).toBe(true);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 3 * 60_000);
      expect((await loeschen('admin-token', 'tab-a')).status).toBe(200);
      expect(t.protokollListe.has(id)).toBe(false);
    });

    it('lets the holding tab delete its draft', async () => {
      const { t, id } = await mitEntwurf();
      await nehmen(t, id, 'admin-token', 'tab-1');
      await gesperrt(await t.app.request(url(id), tab('admin-token', 'DELETE', 'tab-2')));
      expect((await t.app.request(url(id), tab('admin-token', 'DELETE', 'tab-1'))).status).toBe(
        200,
      );
    });

    it('does not lock closed protocols and clears the lock on closing', async () => {
      const { t, id, dto } = await mitEntwurf();
      await nehmen(t, id, 'admin-token', 'tab-1');
      expect(
        (
          await t.app.request(
            url(id, '/status'),
            tab('admin-token', 'PUT', 'tab-1', { status: 'abgeschlossen' }),
          )
        ).status,
      ).toBe(200);
      expect(t.protokollListe.get(id)?.sperreBis).toBeNull();
      const res = await nehmen(t, id, 'admin-token', 'tab-1');
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe(
        'Das Protokoll ist abgeschlossen.',
      );
      // Reopening needs no lock (there is none to hold).
      expect(
        (
          await t.app.request(
            url(id, '/status'),
            tab('admin-token', 'PUT', 'tab-9', { status: 'entwurf' }),
          )
        ).status,
      ).toBe(200);
      expect(dto.status).toBe('entwurf');
    });
  });

  it('creates a protocol only for a Sitzung and only once', async () => {
    const t = await setup();
    const fehler = async (eventId: string) => {
      const res = await t.anlegen('admin-token', { eventId });
      return [res.status, ((await res.json()) as { error: string }).error] as const;
    };
    expect((await fehler('unbekannt'))[0]).toBe(400);
    expect((await fehler('b1'))[0]).toBe(400);
    expect(await fehler('s3')).toEqual([400, 'Die Sitzung ist abgesagt.']);
    const ok = await t.anlegen('admin-token', { eventId: 's1' });
    expect(ok.status).toBe(201);
    expect(t.protokollListe.get(((await ok.json()) as { id: string }).id)).toMatchObject({
      eventId: 's1',
      status: 'entwurf',
      version: 1,
      erstelltVon: 'a',
    });
    expect(await fehler('s1')).toEqual([409, 'Für diese Sitzung gibt es schon ein Protokoll.']);
    expect(
      (await t.anlegen('admin-token', { eventId: 's2', inhalt: { type: 'doc' } })).status,
    ).toBe(400);
  });

  it('lists the protocols, newest Sitzung first', async () => {
    const t = await setup();
    await t.anlegen('admin-token', { eventId: 's1' });
    await t.anlegen('vorstand-token', { eventId: 's2' });
    const liste = (await (
      await t.app.request('/api/protokolle', json('reader-token', 'GET'))
    ).json()) as ProtokollListeEintragDto[];
    expect(liste.map((p) => p.eventId)).toEqual(['s2', 's1']);
    expect(liste[0]).toMatchObject({
      titel: 'Sitzung',
      beginn: '2026-11-03T18:00:00.000Z',
      status: 'entwurf',
      geaendertVon: { sub: 'v', username: 'user-v', status: 'anwaerter' },
    });
  });

  it('offers past and upcoming Sitzungen without protocol, newest first', async () => {
    const t = await setup();
    await t.anlegen('admin-token', { eventId: 's1' });
    t.kalender.sitzungen.mockImplementation(async (zeitraum) =>
      zeitraum.nach
        ? [sitzung('s9', '2030-01-01T18:00:00.000Z')]
        : [sitzung('s2', '2026-11-03T18:00:00.000Z')],
    );
    const res = await t.app.request('/api/protokolle/sitzungen', json('vorstand-token', 'GET'));
    const liste = (await res.json()) as { id: string }[];
    expect(liste.map((e) => e.id)).toEqual(['s9', 's2']);
    const [vergangen, kommend] = t.kalender.sitzungen.mock.calls;
    expect(Math.abs(vergangen![0].bis!.getTime() - Date.now())).toBeLessThan(60_000);
    expect(vergangen![1]).toBe(20);
    expect(vergangen![2]).toEqual(['s1']);
    expect(Math.abs(kommend![0].nach!.getTime() - Date.now())).toBeLessThan(60_000);
    expect(kommend![1]).toBe(5);
    expect(kommend![3]).toBe(true);
  });

  it('refuses closing before the Sitzung has begun, but allows it afterwards', async () => {
    const t = await setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
      const { id } = (await (await t.anlegen('admin-token', { eventId: 's2' })).json()) as {
        id: string;
      };
      const schliessen = () =>
        t.app.request(`/api/protokolle/${id}/status`, {
          ...json('admin-token', 'PUT', { status: 'abgeschlossen' }),
        });
      const frueh = await schliessen();
      expect(frueh.status).toBe(400);
      expect(JSON.stringify(await frueh.json())).toContain('erst, wenn die Sitzung begonnen');
    } finally {
      vi.useRealTimers();
    }
  });

  it('derives the attendance from the answers and lets overrides win', async () => {
    const t = await setup();
    t.antworten.m2 = 'teilnahme';
    t.antworten.r = 'absage';
    t.antworten.e1 = 'teilnahme';
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    let dto = await t.holen(id);
    expect(dto.sitzung).toMatchObject({ id: 's1', titel: 'Sitzung', kategorie: sitzungsKategorie });
    // Active Anwärter:innen and Mitglieder only: not the EMs and not the deactivated one.
    expect(dto.teilnahme.map((p) => [p.sub, p.abgeleitet, p.wert, p.ueberschrieben])).toEqual([
      ['a', 'unentschuldigt', 'unentschuldigt', false],
      ['m2', 'anwesend', 'anwesend', false],
      ['r', 'entschuldigt', 'entschuldigt', false],
      ['v', 'unentschuldigt', 'unentschuldigt', false],
    ]);
    expect(dto.teilnahme[0]).toMatchObject({ username: 'user-a', status: 'anwaerter' });
    expect(dto.ems.map((e) => [e.sub, e.abgeleitet, e.ausgewaehlt])).toEqual([
      ['e1', true, true],
      ['e2', false, false],
    ]);

    const speichern = await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', {
        inhalt: dto.inhalt,
        kopf: {
          ...protokollKopfLeer(),
          teilnahme: { r: 'verspaetet' },
          ems: ['e2'],
          gaeste: ['Gast'],
        },
        version: 1,
      }),
    );
    expect(speichern.status).toBe(200);
    dto = await t.holen(id);
    expect(dto.teilnahme.find((p) => p.sub === 'r')).toMatchObject({
      abgeleitet: 'entschuldigt',
      wert: 'anwesend',
      ueberschrieben: true,
    });
    expect(dto.ems.map((e) => [e.sub, e.ausgewaehlt])).toEqual([
      ['e1', false],
      ['e2', true],
    ]);
    expect(dto.kopf.gaeste).toEqual(['Gast']);
  });

  it('pre-fills a new protocol from the latest earlier one', async () => {
    const t = await setup();
    const erstes = (
      await (
        await t.anlegen('admin-token', {
          eventId: 's1',
          inhalt: t.mitEvent('2026-11-20', 'Wer bringt Musik mit?'),
        })
      ).json()
    ).id as string;
    expect(erstes).toBeTruthy();
    const res = await t.app.request(
      '/api/protokolle/vorschlag?eventId=s2',
      json('admin-token', 'GET'),
    );
    const vorschlag = (await res.json()) as { inhalt: ProtokollDokument; kopf: unknown };
    expect(vorschlag.kopf).toEqual(protokollKopfLeer());
    const zukunft = vorschlag.inhalt.content[2]!.content!;
    expect(zukunft).toHaveLength(1);
    expect(zukunft[0]).toMatchObject({
      type: 'bausteinEvent',
      attrs: { daten: { name: 'Barabend', datum: '2026-11-20' } },
      content: [{ type: 'paragraph', content: [{ text: 'Wer bringt Musik mit?' }] }],
    });

    // Creating without a document takes the suggestion.
    const neu = (await (await t.anlegen('admin-token', { eventId: 's2' })).json()).id as string;
    expect((await t.holen(neu)).inhalt.content[2]!.content).toHaveLength(1);

    // The first Sitzung has no predecessor: empty document.
    const leer = (await (
      await t.app.request('/api/protokolle/vorschlag?eventId=s1', json('admin-token', 'GET'))
    ).json()) as { inhalt: ProtokollDokument };
    expect(leer.inhalt).toEqual(protokollLeer());
    expect(
      (await t.app.request('/api/protokolle/vorschlag?eventId=b1', json('admin-token', 'GET')))
        .status,
    ).toBe(400);
    expect(
      (await t.app.request('/api/protokolle/vorschlag', json('admin-token', 'GET'))).status,
    ).toBe(400);
  });

  it('repeats votes that were not beschlussfähig in the next Sitzung', async () => {
    const t = await setup();
    // m2 is the only member and did not answer: 0 of 1 present, so the Sitzung is not beschlussfähig.
    const aufnahme = bausteinErzeugen('bausteinAufnahme', {
      sub: 'r',
      name: '',
      abstimmung: { ja: 0, nein: 0, enthaltung: 0, ergebnis: 'angenommen' },
      wiederholung: null,
    });
    const doc = protokollLeer();
    doc.content[1]!.content = [aufnahme, { type: 'paragraph' }];
    const id = (await (await t.anlegen('admin-token', { eventId: 's1', inhalt: doc })).json())
      .id as string;

    // The Aktion still runs, but provisionally.
    const aktionen = (await (
      await t.app.request(`/api/protokolle/${id}/aktionen`, json('admin-token', 'GET'))
    ).json()) as { aktionen: { art: string; ausfuehrbar: boolean; vorlaeufig?: boolean }[] };
    expect(aktionen.aktionen).toMatchObject([
      { art: 'aufnahme.status', ausfuehrbar: true, vorlaeufig: true },
    ]);

    const zu = await t.app.request(
      `/api/protokolle/${id}/status`,
      json('admin-token', 'PUT', { status: 'abgeschlossen' }),
    );
    expect(zu.status).toBe(200);

    const vorschlag = (await (
      await t.app.request('/api/protokolle/vorschlag?eventId=s2', json('admin-token', 'GET'))
    ).json()) as { inhalt: ProtokollDokument };
    const gegenwart = vorschlag.inhalt.content[1]!.content!.filter((k) =>
      k.type.startsWith('baustein'),
    );
    expect(gegenwart).toHaveLength(1);
    expect(gegenwart[0]).toMatchObject({
      type: 'bausteinAufnahme',
      attrs: {
        daten: {
          sub: 'r',
          abstimmung: { ja: 0, nein: 0, enthaltung: 0, ergebnis: null },
          wiederholung: { datum: '2026-10-06', sitzung: 'Sitzung' },
        },
      },
    });
    expect(gegenwart[0]!.attrs!.id).not.toBe(aufnahme.attrs.id);
  });

  it('does not repeat votes of a beschlussfähige Sitzung', async () => {
    const t = await setup();
    t.antworten.m2 = 'teilnahme';
    const beschluss = bausteinErzeugen('bausteinBeschluss', {
      antrag: 'Bier',
      ja: 1,
      nein: 0,
      enthaltung: 0,
      ergebnis: 'angenommen',
      wiederholung: null,
    });
    const doc = protokollLeer();
    doc.content[1]!.content = [beschluss, { type: 'paragraph' }];
    await t.anlegen('admin-token', { eventId: 's1', inhalt: doc });
    const vorschlag = (await (
      await t.app.request('/api/protokolle/vorschlag?eventId=s2', json('admin-token', 'GET'))
    ).json()) as { inhalt: ProtokollDokument };
    expect(vorschlag.inhalt.content[1]!.content).toEqual([{ type: 'paragraph' }]);
  });

  it('turns events that are over by the next Sitzung into past ones', async () => {
    const t = await setup();
    await t.anlegen('admin-token', {
      eventId: 's1',
      inhalt: t.mitEvent('2026-10-20', 'Rückblick-Stoff', { eventId: 'b1' }),
    });
    const vorschlag = (await (
      await t.app.request('/api/protokolle/vorschlag?eventId=s2', json('admin-token', 'GET'))
    ).json()) as { inhalt: ProtokollDokument };
    expect(vorschlag.inhalt.content[2]!.content).toEqual([{ type: 'paragraph' }]);
    expect(vorschlag.inhalt.content[0]!.content).toMatchObject([
      {
        type: 'bausteinVergangenesEvent',
        // Name and date follow the calendar event b1.
        attrs: { daten: { eventId: 'b1', name: 'Barabend', datum: '2026-10-20' } },
        content: [{ type: 'paragraph' }],
      },
    ]);
  });

  it('saves with optimistic locking and validates the document', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const dto = await t.holen(id);
    const put = (token: string, body: Record<string, unknown>) =>
      t.app.request(`/api/protokolle/${id}`, json(token, 'PUT', body));
    const inhalt = t.mitEvent('2026-12-01', 'Neu');
    const ok = await put('admin-token', { inhalt, kopf: dto.kopf, version: 1 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ version: 2, geaendertAm: expect.any(String) });
    expect((await t.holen(id)).inhalt).toEqual(inhalt);

    // A second editor still has version 1.
    const veraltet = await put('vorstand-token', {
      inhalt: dto.inhalt,
      kopf: dto.kopf,
      version: 1,
    });
    expect(veraltet.status).toBe(409);
    expect(await veraltet.json()).toEqual({
      error: 'Jemand anderes hat das Protokoll inzwischen geändert.',
      version: 2,
      // Who saved version 2 (for the hint on the page).
      geaendertVon: expect.objectContaining({ sub: 'a', username: 'user-a' }),
    });
    expect((await t.holen(id)).inhalt).toEqual(inhalt);

    const kaputt = protokollLeer();
    kaputt.content.splice(1);
    expect((await put('admin-token', { inhalt: kaputt, kopf: dto.kopf, version: 2 })).status).toBe(
      400,
    );
    expect(
      (await put('admin-token', { inhalt, kopf: { teilnahme: { r: 'da' } }, version: 2 })).status,
    ).toBe(400);
    expect(
      (
        await t.app.request(
          '/api/protokolle/gibtsnicht',
          json('admin-token', 'PUT', {
            inhalt,
            kopf: dto.kopf,
            version: 1,
          }),
        )
      ).status,
    ).toBe(404);
  });

  it('never lets a draft carry a snapshot', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const dto = await t.holen(id);
    await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', {
        inhalt: dto.inhalt,
        kopf: {
          ...dto.kopf,
          schnappschuss: { r: 'anwesend' },
          emsSchnappschuss: ['e1'],
          statusSchnappschuss: { r: 'mitglied' },
          artSchnappschuss: 'sitzung',
        },
        version: 1,
      }),
    );
    expect((await t.holen(id)).kopf).toMatchObject({
      schnappschuss: null,
      emsSchnappschuss: null,
      statusSchnappschuss: null,
      artSchnappschuss: null,
    });
  });

  it('sets the Protokollführung to the creator unless the input has one', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const dto = await t.holen(id);
    expect(dto.kopf).toMatchObject({
      protokollfuehrung: 'a',
      sitzungsleitung: null,
      eroeffnung: '',
    });
    expect(dto.sitzung.art).toBe('sitzung');
    // Snapshots from the input are dropped, an explicit Protokollführung stays.
    const id2 = (
      await (
        await t.anlegen('admin-token', {
          eventId: 's2',
          inhalt: protokollLeer(),
          kopf: {
            ...protokollKopfLeer(),
            protokollfuehrung: 'm2',
            sitzungsleitung: 'r',
            eroeffnung: '19:30',
            verspaetung: { r: '20:15' },
            statusSchnappschuss: { r: 'mitglied' },
            artSchnappschuss: 'mitgliederversammlung',
          },
        })
      ).json()
    ).id as string;
    expect((await t.holen(id2)).kopf).toMatchObject({
      protokollfuehrung: 'm2',
      sitzungsleitung: 'r',
      eroeffnung: '19:30',
      verspaetung: { r: '20:15' },
      statusSchnappschuss: null,
      artSchnappschuss: null,
    });
    // Invalid times are refused.
    expect(
      (
        await t.anlegen('admin-token', {
          eventId: 's2',
          inhalt: protokollLeer(),
          kopf: { ...protokollKopfLeer(), eroeffnung: '25:00' },
        })
      ).status,
    ).toBe(400);
  });

  it('still loads a kopf stored before the new fields existed', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const p = t.protokollListe.get(id)!;
    t.protokollListe.set(id, {
      ...p,
      kopf: JSON.stringify({ teilnahme: { r: 'anwesend' }, ems: null, gaeste: 'Gast' }),
    });
    const dto = await t.holen(id);
    expect(dto.kopf).toEqual({
      ...protokollKopfLeer(),
      teilnahme: { r: 'anwesend' },
      gaeste: ['Gast'],
    });
    expect(dto.teilnahme.find((x) => x.sub === 'r')?.wert).toBe('anwesend');
  });

  describe('PDF in OneDrive', () => {
    const PDF = Buffer.from('%PDF-1.7\n%binary \u00e4\u00f6\u00fc\n%%EOF').toString('base64');
    async function geschlossen() {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      const pdf = (token: string, body: unknown) =>
        t.app.request(`/api/protokolle/${id}/pdf`, json(token, 'PUT', body));
      const zu = () =>
        t.app.request(
          `/api/protokolle/${id}/status`,
          json('admin-token', 'PUT', { status: 'abgeschlossen' }),
        );
      return { ...t, id, pdf, zu };
    }

    it('stores the PDF of a closed protocol under Cloud4/Sitzungen/C4/Protokolle/<Jahr>', async () => {
      const t = await geschlossen();
      expect((await t.zu()).status).toBe(200);
      const res = await t.pdf('admin-token', {
        dateiname: '2026-11-04_Sitzung: A/B.pdf',
        base64: PDF,
      });
      expect(res.status).toBe(200);
      const pfad = 'Cloud4/Sitzungen/C4/Protokolle/2026/2026-11-04_Sitzung AB.pdf';
      expect(await res.json()).toEqual({ gespeichert: true, pfad });
      const datei = t.onedrive.dateien.get(pfad);
      expect(datei?.contentType).toBe('application/pdf');
      expect(Buffer.from(datei!.inhalt).toString('base64')).toBe(PDF);
    });

    it('only takes PDFs of closed protocols from writers', async () => {
      const t = await geschlossen();
      expect((await t.pdf('admin-token', { dateiname: 'a.pdf', base64: PDF })).status).toBe(409);
      expect((await t.zu()).status).toBe(200);
      expect((await t.pdf('reader-token', { dateiname: 'a.pdf', base64: PDF })).status).toBe(403);
      expect((await t.pdf('admin-token', { dateiname: '///', base64: PDF })).status).toBe(400);
      const kaputt = Buffer.from('kein pdf').toString('base64');
      expect((await t.pdf('admin-token', { dateiname: 'a.pdf', base64: kaputt })).status).toBe(400);
      expect(t.onedrive.dateien.size).toBe(0);
    });

    it('rejects PDFs over 4 MB', async () => {
      const t = await geschlossen();
      await t.zu();
      const gross = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(4 * 1024 * 1024)]).toString(
        'base64',
      );
      const res = await t.pdf('admin-token', { dateiname: 'a.pdf', base64: gross });
      expect(res.status).toBe(413);
      expect(((await res.json()) as { error: string }).error).toContain('zu groß');
    });

    it('answers 503 when OneDrive is not connected or fails', async () => {
      const t = await geschlossen();
      await t.zu();
      t.onedrive.zustand.verbunden = false;
      const a = await t.pdf('admin-token', { dateiname: 'a.pdf', base64: PDF });
      expect(a.status).toBe(503);
      expect(((await a.json()) as { error: string }).error).toContain('OneDrive');
      t.onedrive.zustand.verbunden = true;
      t.onedrive.zustand.ausfall = true;
      expect((await t.pdf('admin-token', { dateiname: 'a.pdf', base64: PDF })).status).toBe(503);
    });
  });

  it('freezes member status and art when closing and drops them when reopening', async () => {
    const t = await setup();
    t.events.set('s1', {
      ...t.events.get('s1')!,
      protokollArt: 'mitgliederversammlung',
    });
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    expect((await t.holen(id)).sitzung.art).toBe('mitgliederversammlung');
    const status = (wert: string) =>
      t.app.request(`/api/protokolle/${id}/status`, json('admin-token', 'PUT', { status: wert }));
    expect((await status('abgeschlossen')).status).toBe(200);
    let dto = await t.holen(id);
    expect(dto.kopf.statusSchnappschuss).toEqual({
      a: 'anwaerter',
      m2: 'mitglied',
      r: 'anwaerter',
      v: 'anwaerter',
    });
    expect(dto.kopf.artSchnappschuss).toBe('mitgliederversammlung');

    // Later changes of the status and of the Kategorie do not touch the closed protocol.
    await t.mitglieder.statusSetzen('m2', 'anwaerter');
    await t.mitglieder.statusSetzen('r', 'mitglied');
    t.events.set('s1', { ...t.events.get('s1')!, protokollArt: 'sitzung' });
    dto = await t.holen(id);
    expect(dto.sitzung.art).toBe('mitgliederversammlung');
    expect(dto.teilnahme.map((p) => [p.sub, p.status])).toEqual([
      ['a', 'anwaerter'],
      ['m2', 'mitglied'],
      ['r', 'anwaerter'],
      ['v', 'anwaerter'],
    ]);

    expect((await status('entwurf')).status).toBe(200);
    dto = await t.holen(id);
    expect(dto.kopf).toMatchObject({
      statusSchnappschuss: null,
      artSchnappschuss: null,
      schnappschuss: null,
    });
    expect(dto.sitzung.art).toBe('sitzung');
    expect(dto.teilnahme.find((p) => p.sub === 'm2')?.status).toBe('anwaerter');
    expect(dto.teilnahme.find((p) => p.sub === 'r')?.status).toBe('mitglied');
  });

  it('freezes the attendance when closing and releases it when reopening', async () => {
    const t = await setup();
    t.antworten.m2 = 'teilnahme';
    t.antworten.e1 = 'teilnahme';
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json().then((j) => j))
      .id as string;
    const status = (token: string, wert: string) =>
      t.app.request(`/api/protokolle/${id}/status`, json(token, 'PUT', { status: wert }));
    await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', {
        inhalt: (await t.holen(id)).inhalt,
        kopf: { ...protokollKopfLeer(), teilnahme: { v: 'verspaetet' } },
        version: 1,
      }),
    );

    const zu = await status('admin-token', 'abgeschlossen');
    expect(zu.status).toBe(200);
    expect(await zu.json()).toMatchObject({ status: 'abgeschlossen', version: 3 });
    let dto = await t.holen(id);
    expect(dto.status).toBe('abgeschlossen');
    expect(dto.kopf.schnappschuss).toEqual({
      a: 'unentschuldigt',
      m2: 'anwesend',
      r: 'unentschuldigt',
      v: 'anwesend',
    });
    expect(dto.kopf.emsSchnappschuss).toEqual(['e1']);

    // Later answers do not change a closed protocol.
    t.antworten.r = 'teilnahme';
    t.antworten.m2 = 'absage';
    delete t.antworten.e1;
    dto = await t.holen(id);
    expect(dto.teilnahme.map((p) => [p.sub, p.wert])).toEqual([
      ['a', 'unentschuldigt'],
      ['m2', 'anwesend'],
      ['r', 'unentschuldigt'],
      ['v', 'anwesend'],
    ]);
    expect(dto.teilnahme.find((p) => p.sub === 'r')?.abgeleitet).toBe('anwesend');
    expect(dto.ems.map((e) => [e.sub, e.ausgewaehlt])).toEqual([['e1', true]]);

    // Closed: no saving, no deleting.
    const put = await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', { inhalt: dto.inhalt, kopf: dto.kopf, version: dto.version }),
    );
    expect(put.status).toBe(409);
    expect(await put.json()).toEqual({ error: 'Das Protokoll ist abgeschlossen.' });
    const loeschen = await t.app.request(`/api/protokolle/${id}`, json('admin-token', 'DELETE'));
    expect(loeschen.status).toBe(409);
    expect(t.protokollListe.has(id)).toBe(true);

    expect((await status('admin-token', 'entwurf')).status).toBe(200);
    dto = await t.holen(id);
    expect(dto.status).toBe('entwurf');
    expect(dto.kopf).toMatchObject({ schnappschuss: null, emsSchnappschuss: null });
    expect(dto.teilnahme.find((p) => p.sub === 'r')?.wert).toBe('anwesend');
    expect(dto.teilnahme.find((p) => p.sub === 'v')?.wert).toBe('anwesend');
    expect((await status('admin-token', 'entwurf')).status).toBe(200);
    expect((await status('admin-token', 'offen')).status).toBe(400);
  });

  it('only closes when every Abstimmung and Wahl has as many votes as members present', async () => {
    const t = await setup();
    t.antworten.m2 = 'teilnahme'; // the only Mitglied, so one member is present
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const status = () =>
      t.app.request(
        `/api/protokolle/${id}/status`,
        json('admin-token', 'PUT', { status: 'abgeschlossen' }),
      );
    const speichern = async (...bausteine: ProtokollKnoten[]) => {
      const dto = await t.holen(id);
      const inhalt = protokollLeer();
      inhalt.content[1]!.content = [...bausteine, { type: 'paragraph' }];
      const res = await t.app.request(
        `/api/protokolle/${id}`,
        json('admin-token', 'PUT', { inhalt, kopf: dto.kopf, version: dto.version }),
      );
      expect(res.status).toBe(200);
    };
    const beschluss = (ja: number) =>
      bausteinErzeugen('bausteinBeschluss', {
        ...bausteinLeer('bausteinBeschluss'),
        antrag: 'Bier',
        ja,
      });
    const wahl = (stimmen: number) =>
      bausteinErzeugen('bausteinWahl', {
        ...bausteinLeer('bausteinWahl'),
        posten: 'Kasse',
        anzahl: 2,
        kandidaten: [{ id: 'k1', sub: 'm2', name: '', stimmen }],
      });
    const meinungsbild = bausteinErzeugen('bausteinMeinungsbild', {
      frage: 'Pizza?',
      optionen: [{ text: 'Ja', stimmen: 40 }],
    });

    // Too many votes for one present member.
    await speichern(beschluss(2));
    let res = await status();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(
      'Abstimmung „Bier“: 2 Stimmen, aber 1 Mitglied anwesend.',
    );
    expect((await t.holen(id)).status).toBe('entwurf');

    // A Wahl: one member, two votes (anzahl 2).
    await speichern(beschluss(1), wahl(1));
    res = await status();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(
      'Wahl „Kasse“: 1 Stimme, erwartet 2 (1 Mitglied × 2 Stimmen).',
    );

    // Everything correct, a Meinungsbild with any count is ignored.
    await speichern(beschluss(1), wahl(2), meinungsbild);
    expect((await status()).status).toBe(200);
    expect((await t.holen(id)).status).toBe('abgeschlossen');
  });

  it('suggests the next Sitzung live in a draft, freezes it on closing and restores it on reopening', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const status = (wert: string) =>
      t.app.request(`/api/protokolle/${id}/status`, json('admin-token', 'PUT', { status: wert }));
    // No later Sitzung known.
    let dto = await t.holen(id);
    expect(dto.naechsteSitzungVorschlag).toBeNull();
    expect(dto.naechsteSitzungen).toEqual([]);
    expect(dto.kopf.naechsteSitzung).toBeNull();

    t.kalender.kommendeSitzungen.mockResolvedValue([
      sitzung('s2', '2026-11-03T18:00:00.000Z'),
      sitzung('s4', '2026-12-01T19:00:00.000Z', {
        titel: 'MV',
        protokollArt: 'mitgliederversammlung',
      }),
    ]);
    dto = await t.holen(id);
    const [nach, limit] = t.kalender.kommendeSitzungen.mock.calls.at(-1)!;
    expect(nach.toISOString()).toBe('2026-10-06T17:00:00.000Z');
    expect(limit).toBe(10);
    const s2 = { eventId: 's2', titel: 'Sitzung', beginn: '2026-11-03T18:00:00.000Z' };
    expect(dto.naechsteSitzungVorschlag).toEqual(s2);
    expect(dto.naechsteSitzungen.map((e) => e.eventId)).toEqual(['s2', 's4']);

    // An override is stored as written and does not change the suggestion.
    const kopf = {
      ...dto.kopf,
      naechsteSitzung: { eventId: null, datum: '2026-11-17', uhrzeit: '20:00' },
    };
    const put = await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', { inhalt: dto.inhalt, kopf, version: dto.version }),
    );
    expect(put.status).toBe(200);
    dto = await t.holen(id);
    expect(dto.kopf.naechsteSitzung).toEqual(kopf.naechsteSitzung);
    expect(dto.naechsteSitzungVorschlag).toEqual(s2);
    const kaputt = await t.app.request(
      `/api/protokolle/${id}`,
      json('admin-token', 'PUT', {
        inhalt: dto.inhalt,
        kopf: { ...kopf, naechsteSitzung: { eventId: null, datum: 'morgen', uhrzeit: '' } },
        version: dto.version,
      }),
    );
    expect(kaputt.status).toBe(400);

    // Closing freezes the suggestion; later calendar changes do not matter.
    expect((await status('abgeschlossen')).status).toBe(200);
    t.kalender.kommendeSitzungen.mockResolvedValue([sitzung('s5', '2026-10-20T18:00:00.000Z')]);
    dto = await t.holen(id);
    expect(dto.naechsteSitzungVorschlag).toEqual(s2);
    expect(dto.naechsteSitzungen).toEqual([]);
    expect(dto.kopf.naechsteSitzung).toEqual(kopf.naechsteSitzung);

    // Reopening is automatic again.
    expect((await status('entwurf')).status).toBe(200);
    dto = await t.holen(id);
    expect(dto.kopf.naechsteSitzungSchnappschuss).toBeNull();
    expect(dto.naechsteSitzungVorschlag).toMatchObject({ eventId: 's5' });
  });

  it('adds the empty section Sonstiges to documents stored with three sections', async () => {
    const t = await setup();
    const alt = protokollLeer();
    alt.content.pop();
    const id = (
      await (
        await t.anlegen('admin-token', { eventId: 's1', inhalt: alt, kopf: protokollKopfLeer() })
      ).json()
    ).id as string;
    const dto = await t.holen(id);
    expect(dto.inhalt.content.map((a) => a.attrs?.art)).toEqual([
      'vergangenes',
      'gegenwaertiges',
      'zukuenftiges',
      'sonstiges',
    ]);
    const zwei = protokollLeer();
    zwei.content.splice(2);
    const res = await t.anlegen('admin-token', {
      eventId: 's2',
      inhalt: zwei,
      kopf: protokollKopfLeer(),
    });
    expect(res.status).toBe(400);
  });

  it('deletes drafts', async () => {
    const t = await setup();
    const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
    const res = await t.app.request(`/api/protokolle/${id}`, json('vorstand-token', 'DELETE'));
    expect(res.status).toBe(200);
    expect(t.protokollListe.size).toBe(0);
    expect(
      (await t.app.request(`/api/protokolle/${id}`, json('admin-token', 'DELETE'))).status,
    ).toBe(404);
    expect((await t.app.request(`/api/protokolle/${id}`, json('reader-token', 'GET'))).status).toBe(
      404,
    );
  });

  describe('Bilder', () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    const bild = (id: string, schluessel = `protokollbilder/${id}/${uuid}.jpg`) => ({
      type: 'protokollBild',
      attrs: { schluessel, breite: 'voll', ausrichtung: 'mitte', beschreibung: 'Tafel' },
    });
    const mitBild = (dto: { inhalt: ProtokollDokument }, knoten: unknown) => {
      const inhalt = structuredClone(dto.inhalt);
      inhalt.content[0]!.content!.push(knoten as never);
      return inhalt;
    };

    it('prepares an upload for a draft, limited to 5 MB and the right to write', async () => {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      const post = (token: string, body: unknown, pid = id) =>
        t.app.request(`/api/protokolle/${pid}/bilder`, json(token, 'POST', body));
      const res = await post('vorstand-token', { groesse: 1234 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        uploadUrl: 'https://s3.example/upload?size=1234',
        schluessel: `protokollbilder/${id}/${uuid}.jpg`,
      });
      expect(t.protokollbilder.uploadVorbereiten).toHaveBeenCalledWith(id, 1234);
      expect((await post('reader-token', { groesse: 10 })).status).toBe(403);
      expect((await post('admin-token', { groesse: 5 * 1024 * 1024 + 1 })).status).toBe(400);
      expect((await post('admin-token', { groesse: 0 })).status).toBe(400);
      expect((await post('admin-token', { groesse: 10 }, 'gibtsnicht')).status).toBe(404);
      await t.app.request(
        `/api/protokolle/${id}/status`,
        json('admin-token', 'PUT', { status: 'abgeschlossen' }),
      );
      expect((await post('admin-token', { groesse: 10 })).status).toBe(409);
    });

    it('refuses images when creating a protocol', async () => {
      const t = await setup();
      const inhalt = mitBild({ inhalt: protokollLeer() }, bild('fremd'));
      const res = await t.anlegen('admin-token', { eventId: 's1', inhalt, kopf: undefined });
      expect(res.status).toBe(400);
      expect(t.protokollListe.size).toBe(0);
    });

    it('saves images of this protocol and returns URLs only for those', async () => {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      const dto = await t.holen(id);
      expect(dto.bilder).toEqual({});
      const put = (inhalt: unknown, version: number) =>
        t.app.request(
          `/api/protokolle/${id}`,
          json('admin-token', 'PUT', { inhalt, kopf: dto.kopf, version }),
        );
      expect((await put(mitBild(dto, bild(id)), 1)).status).toBe(200);
      const neu = await t.holen(id);
      const key = `protokollbilder/${id}/${uuid}.jpg`;
      expect(neu.bilder).toEqual({ [key]: `https://s3.example/${key}` });
    });

    it('rejects images of another protocol or with a bad shape', async () => {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      const dto = await t.holen(id);
      const put = (inhalt: unknown) =>
        t.app.request(
          `/api/protokolle/${id}`,
          json('admin-token', 'PUT', { inhalt, kopf: dto.kopf, version: 1 }),
        );
      expect((await put(mitBild(dto, bild('anderes-protokoll')))).status).toBe(400);
      expect((await put(mitBild(dto, bild(id, 'profilbilder/x/y.jpg')))).status).toBe(400);
      expect((await put(mitBild(dto, bild(id, `protokollbilder/${id}/../x.jpg`)))).status).toBe(
        400,
      );
    });

    it('deletes the images together with the protocol', async () => {
      const t = await setup();
      const id = (await (await t.anlegen('admin-token', { eventId: 's1' })).json()).id as string;
      t.protokollbilder.loeschen.mockRejectedValueOnce(new Error('s3 down'));
      const res = await t.app.request(`/api/protokolle/${id}`, json('admin-token', 'DELETE'));
      expect(res.status).toBe(200);
      expect(t.protokollbilder.loeschen).toHaveBeenCalledWith(id);
    });
  });

  it('refuses to delete a Sitzung that has a protocol', async () => {
    const t = await setup();
    await t.anlegen('admin-token', { eventId: 's1' });
    const res = await t.app.request('/api/kalender/events/s1', json('admin-token', 'DELETE'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Zu dieser Sitzung gibt es ein Protokoll.' });
    expect(t.kalender.eventLoeschen).not.toHaveBeenCalled();
    expect(
      (await t.app.request('/api/kalender/events/s2', json('admin-token', 'DELETE'))).status,
    ).toBe(200);
  });

  it('allows the "Sitzung mit Protokoll" flag only on categories with participation', async () => {
    const t = makeApp();
    const post = (body: Record<string, unknown>) =>
      t.app.request('/api/kalender/kategorien', json('admin-token', 'POST', body));
    const sitzung = {
      name: 'Sitzung',
      farbe: 'red',
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
    };
    expect((await post({ ...sitzung, protokoll: true })).status).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokoll: true }),
    );
    expect((await post(sitzung)).status).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokoll: false }),
    );
    const bar = { name: 'Bar', farbe: 'blue', art: 'dienste' };
    expect((await post({ ...bar, protokoll: true })).status).toBe(400);
    expect((await post({ ...bar, protokoll: false })).status).toBe(201);
    expect(
      (
        await t.app.request(
          '/api/kalender/kategorien/k1',
          json('admin-token', 'PUT', { ...bar, protokoll: true }),
        )
      ).status,
    ).toBe(400);
  });

  it('stores the art of a Sitzung at the Kategorie', async () => {
    const t = makeApp();
    const post = (body: Record<string, unknown>) =>
      t.app.request('/api/kalender/kategorien', json('admin-token', 'POST', body));
    const mv = {
      name: 'MV',
      farbe: 'red',
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
      protokoll: true,
    };
    expect((await post({ ...mv, protokollArt: 'mitgliederversammlung' })).status).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokoll: true, protokollArt: 'mitgliederversammlung' }),
    );
    expect((await post(mv)).status).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokollArt: 'sitzung' }),
    );
    // Without the Sitzung flag the art falls back to 'sitzung'.
    expect(
      (await post({ ...mv, protokoll: false, protokollArt: 'mitgliederversammlung' })).status,
    ).toBe(201);
    expect(t.kalender.kategorieAnlegen).toHaveBeenLastCalledWith(
      expect.objectContaining({ protokoll: false, protokollArt: 'sitzung' }),
    );
    expect((await post({ ...mv, protokollArt: 'vollversammlung' })).status).toBe(400);
    const put = await t.app.request(
      '/api/kalender/kategorien/k1',
      json('admin-token', 'PUT', { ...mv, protokollArt: 'mitgliederversammlung' }),
    );
    expect(put.status).toBe(200);
    expect(t.kalender.kategorieAktualisieren).toHaveBeenLastCalledWith(
      'k1',
      expect.objectContaining({ protokollArt: 'mitgliederversammlung' }),
    );
  });

  it('adds the permissions to the Posten rights', async () => {
    const t = makeApp();
    const me = (await (await t.app.request('/api/me', json('admin-token', 'GET'))).json()) as {
      permissions: string[];
    };
    expect(me.permissions).toEqual(
      expect.arrayContaining(['protokolle:lesen', 'protokolle:schreiben']),
    );
  });

  describe('Offizielles Protokoll', () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    const todoBaustein = bausteinErzeugen(
      'bausteinTodo',
      {
        ...bausteinLeer('bausteinTodo'),
        titel: 'Kasse prüfen',
        faelligAm: '2026-11-14',
        zustaendig: [{ art: 'person', sub: 'm2' }],
      },
      [absatzKnoten('Zählen')],
    );

    function absatzKnoten(text: string) {
      return { type: 'paragraph', content: [{ type: 'text', text }] };
    }

    /** A closed normal protocol of `s1` with a Todo Baustein and an image. */
    async function geschlossen() {
      const t = await setup();
      const doc = protokollLeer();
      doc.content[1]!.content = [
        bausteinErzeugen('bausteinThema', { ...bausteinLeer('bausteinThema'), titel: 'Kasse' }, [
          todoBaustein,
        ]),
      ];
      const id = (await (await t.anlegen('admin-token', { eventId: 's1', inhalt: doc })).json())
        .id as string;
      const mitBild = structuredClone((await t.holen(id)).inhalt);
      mitBild.content[0]!.content!.push({
        type: 'protokollBild',
        attrs: {
          schluessel: `protokollbilder/${id}/${uuid}.jpg`,
          breite: 'voll',
          ausrichtung: 'mitte',
          beschreibung: 'Tafel',
        },
      } as never);
      const stand = await t.holen(id);
      expect(
        (
          await t.app.request(
            `/api/protokolle/${id}`,
            json('admin-token', 'PUT', {
              inhalt: mitBild,
              kopf: stand.kopf,
              version: stand.version,
            }),
          )
        ).status,
      ).toBe(200);
      const status = (pid: string, status: string, aktionen?: string[]) =>
        t.app.request(
          `/api/protokolle/${pid}/status`,
          json('admin-token', 'PUT', { status, aktionen }),
        );
      const offiziell = (pid: string, token = 'admin-token') =>
        t.app.request(`/api/protokolle/${pid}/offiziell`, json(token, 'POST'));
      return { ...t, id, status, offiziell };
    }

    it('copies a closed protocol, including its images, and links both ways', async () => {
      const t = await geschlossen();
      expect((await t.offiziell(t.id)).status).toBe(400); // still a draft
      expect((await t.status(t.id, 'abgeschlossen')).status).toBe(200);
      expect((await t.offiziell(t.id, 'reader-token')).status).toBe(403);
      const res = await t.offiziell(t.id);
      expect(res.status).toBe(201);
      const { id: offId } = (await res.json()) as { id: string };
      const kopie = await t.holen(offId);
      const quelle = await t.holen(t.id);
      expect(kopie).toMatchObject({
        eventId: 's1',
        status: 'entwurf',
        offiziellVon: t.id,
        offiziellId: null,
      });
      expect(quelle).toMatchObject({ offiziellVon: null, offiziellId: offId });
      expect(kopie.kopf.schnappschuss).toEqual(quelle.kopf.schnappschuss);
      // The images are copied to the prefix of the copy and the keys rewritten.
      expect(t.protokollbilder.kopieren).toHaveBeenCalledWith(t.id, offId, [
        `protokollbilder/${t.id}/${uuid}.jpg`,
      ]);
      const json1 = JSON.stringify(kopie.inhalt);
      expect(json1).toContain(`protokollbilder/${offId}/${uuid}.jpg`);
      expect(json1).not.toContain(`protokollbilder/${t.id}/`);
      expect(Object.keys(kopie.bilder)).toEqual([`protokollbilder/${offId}/${uuid}.jpg`]);
      // The list shows both with their links.
      const liste = (await (
        await t.app.request('/api/protokolle', json('reader-token', 'GET'))
      ).json()) as ProtokollListeEintragDto[];
      expect(liste.map((p) => [p.id, p.offiziellVon, p.offiziellId]).sort()).toEqual(
        [
          [t.id, null, offId],
          [offId, t.id, null],
        ].sort(),
      );
    });

    it('allows one official copy per protocol and none of an official one', async () => {
      const t = await geschlossen();
      await t.status(t.id, 'abgeschlossen');
      const { id: offId } = (await (await t.offiziell(t.id)).json()) as { id: string };
      const zweite = await t.offiziell(t.id);
      expect(zweite.status).toBe(409);
      expect(await zweite.json()).toMatchObject({
        error: 'Zu diesem Protokoll gibt es schon ein offizielles Protokoll.',
        offiziellId: offId,
      });
      await t.status(offId, 'abgeschlossen');
      expect((await t.offiziell(offId)).status).toBe(400);
      expect((await t.offiziell('gibtsnicht')).status).toBe(404);
    });

    it('runs no Aktionen when closing the copy and refuses them', async () => {
      const t = await geschlossen();
      await t.status(t.id, 'abgeschlossen');
      const { id: offId } = (await (await t.offiziell(t.id)).json()) as { id: string };
      const bausteinId = (todoBaustein.attrs as { id: string }).id;
      const res = await t.status(offId, 'abgeschlossen', [`${bausteinId}:todo.anlegen`]);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: 'abgeschlossen', aktionen: [] });
      expect(t.todosListe.size).toBe(0);
      expect((await t.holen(offId)).status).toBe('abgeschlossen');
      // Reopening keeps the snapshot of the source.
      expect((await t.status(offId, 'entwurf')).status).toBe(200);
      expect((await t.holen(offId)).kopf.schnappschuss).not.toBeNull();
      const liste = await t.app.request(
        `/api/protokolle/${offId}/aktionen`,
        json('admin-token', 'GET'),
      );
      expect(await liste.json()).toEqual({ aktionen: [] });
      await t.status(offId, 'abgeschlossen');
      const lauf = await t.app.request(
        `/api/protokolle/${offId}/aktionen`,
        json('admin-token', 'POST', { aktionen: [`${bausteinId}:todo.anlegen`] }),
      );
      expect(lauf.status).toBe(409);
      expect(t.todosListe.size).toBe(0);
    });

    it('leaves the normal protocol the one of the Sitzung', async () => {
      const t = await geschlossen();
      await t.status(t.id, 'abgeschlossen');
      const { id: offId } = (await (await t.offiziell(t.id)).json()) as { id: string };
      // No second normal protocol for the Sitzung, and the Sitzung stays taken.
      expect((await t.anlegen('admin-token', { eventId: 's1' })).status).toBe(409);
      t.kalender.sitzungen.mockResolvedValue([]);
      await t.app.request('/api/protokolle/sitzungen', json('admin-token', 'GET'));
      expect(t.kalender.sitzungen.mock.calls[0]![2]).toContain('s1');
      // The Vorschlag for the next Sitzung builds on the normal protocol.
      const vorschlag = await t.app.request(
        '/api/protokolle/vorschlag?eventId=s2',
        json('admin-token', 'GET'),
      );
      expect(vorschlag.status).toBe(200);
      expect(t.protokollListe.get(offId)?.offiziellVon).toBe(t.id);
    });

    it('refuses deleting the source while a copy exists; the copy can be deleted', async () => {
      const t = await geschlossen();
      await t.status(t.id, 'abgeschlossen');
      const { id: offId } = (await (await t.offiziell(t.id)).json()) as { id: string };
      await t.status(t.id, 'entwurf');
      const abgelehnt = await t.app.request(
        `/api/protokolle/${t.id}`,
        json('admin-token', 'DELETE'),
      );
      expect(abgelehnt.status).toBe(409);
      expect(await abgelehnt.json()).toMatchObject({ offiziellId: offId });
      const geloescht = await t.app.request(
        `/api/protokolle/${offId}`,
        json('admin-token', 'DELETE'),
      );
      expect(geloescht.status).toBe(200);
      expect(t.protokollbilder.loeschen).toHaveBeenCalledWith(offId);
      expect(
        (await t.app.request(`/api/protokolle/${t.id}`, json('admin-token', 'DELETE'))).status,
      ).toBe(200);
    });
  });

  describe('Todos beim Abschließen', () => {
    const todoBaustein = (daten: Record<string, unknown>) =>
      bausteinErzeugen(
        'bausteinTodo',
        {
          ...bausteinLeer('bausteinTodo'),
          titel: 'Kasse prüfen',
          faelligAm: '2026-11-14',
          ...daten,
        },
        [
          {
            type: 'bulletList',
            content: ['Beleg holen', 'Zählen'].map((text) => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            })),
          },
        ],
      );

    async function todoSetup(daten: Record<string, unknown>) {
      const t = await setup();
      const baustein = todoBaustein(daten);
      const doc = protokollLeer();
      // A Todo may only stand in the notes of another Baustein.
      doc.content[1]!.content = [
        bausteinErzeugen('bausteinThema', { ...bausteinLeer('bausteinThema'), titel: 'Kasse' }, [
          baustein,
        ]),
      ];
      const id = (await (await t.anlegen('admin-token', { eventId: 's1', inhalt: doc })).json())
        .id as string;
      const bausteinId = (baustein.attrs as { id: string }).id;
      const schliessen = (aktionen: string[]) =>
        t.app.request(
          `/api/protokolle/${id}/status`,
          json('vorstand-token', 'PUT', { status: 'abgeschlossen', aktionen }),
        );
      return { ...t, id, bausteinId, schliessen };
    }

    it('creates the Todo for the resolved people and writes the id back', async () => {
      const t = await todoSetup({
        modus: 'gemeinsam',
        // Group by current status (EMs), a person, the same person again, a deactivated member.
        zustaendig: [
          { art: 'gruppe', gruppe: 'ems' },
          { art: 'person', sub: 'm2' },
          { art: 'person', sub: 'm2' },
          { art: 'person', sub: 'x' },
        ],
      });
      const { aktionen } = (await (
        await t.app.request(`/api/protokolle/${t.id}/aktionen`, json('vorstand-token', 'GET'))
      ).json()) as ProtokollAktionenAntwort;
      expect(aktionen).toMatchObject([
        {
          id: `${t.bausteinId}:todo.anlegen`,
          ausfuehrbar: true,
          text: 'Todo „Kasse prüfen“ für 3 Personen, bis 14.11.2026',
          subs: ['e1', 'e2', 'm2'],
        },
      ]);

      const res = await t.schliessen([`${t.bausteinId}:todo.anlegen`]);
      expect(res.status).toBe(200);
      expect(((await res.json()) as ProtokollStatusAntwort).aktionen).toMatchObject([
        { art: 'todo.anlegen', status: 'erledigt' },
      ]);
      expect([...t.todosListe.values()]).toMatchObject([
        {
          titel: 'Kasse prüfen',
          notizen: 'Beleg holen\nZählen',
          faelligAm: '2026-11-14',
          modus: 'gemeinsam',
          protokollId: t.id,
          bausteinId: t.bausteinId,
          erstelltVon: 'v',
          zustaendige: [{ sub: 'e1' }, { sub: 'e2' }, { sub: 'm2' }],
        },
      ]);
      const todoId = [...t.todosListe.keys()][0]!;
      expect(JSON.stringify((await t.holen(t.id)).inhalt)).toContain(`"todoId":"${todoId}"`);
    });

    it('changes the Todo when the protocol is closed again and keeps the ticks of those who stay', async () => {
      const t = await todoSetup({
        zustaendig: [
          { art: 'person', sub: 'm2' },
          { art: 'person', sub: 'e1' },
        ],
      });
      await t.schliessen([`${t.bausteinId}:todo.anlegen`]);
      const todoId = [...t.todosListe.keys()][0]!;
      await t.todos.abhaken(todoId, 'm2', true);
      await t.todos.abhaken(todoId, 'e1', true);

      // Reopen, change title and deadline, drop `e1`, add `e2`.
      await t.app.request(
        `/api/protokolle/${t.id}/status`,
        json('vorstand-token', 'PUT', { status: 'entwurf' }),
      );
      const dto = await t.holen(t.id);
      const inhalt = JSON.parse(JSON.stringify(dto.inhalt)) as ProtokollDokument;
      const daten = (
        inhalt.content[1]!.content![0]!.content![0] as unknown as {
          attrs: { daten: Record<string, unknown> };
        }
      ).attrs.daten;
      Object.assign(daten, {
        titel: 'Kasse zählen',
        faelligAm: '2026-11-20',
        zustaendig: [
          { art: 'person', sub: 'm2' },
          { art: 'person', sub: 'e2' },
        ],
      });
      const gespeichert = await t.app.request(
        `/api/protokolle/${t.id}`,
        json('admin-token', 'PUT', { inhalt, kopf: dto.kopf, version: dto.version }),
      );
      expect(gespeichert.status).toBe(200);
      const { aktionen } = (await (
        await t.app.request(`/api/protokolle/${t.id}/aktionen`, json('vorstand-token', 'GET'))
      ).json()) as ProtokollAktionenAntwort;
      expect(aktionen.filter((a) => a.zustand !== 'erledigt')).toMatchObject([
        { id: `${t.bausteinId}:todo.aendern`, art: 'todo.aendern', ausfuehrbar: true },
      ]);

      await t.schliessen([`${t.bausteinId}:todo.aendern`]);
      expect(t.todosListe.size).toBe(1);
      const todo = t.todosListe.get(todoId)!;
      expect(todo).toMatchObject({ titel: 'Kasse zählen', faelligAm: '2026-11-20' });
      expect(todo.zustaendige.map((z) => [z.sub, z.erledigtAm !== null])).toEqual([
        ['e2', false],
        ['m2', true],
      ]);
    });

    it('does not run when the deadline or the people are missing', async () => {
      const t = await todoSetup({ faelligAm: null, zustaendig: [{ art: 'person', sub: 'm2' }] });
      const res = await t.schliessen([`${t.bausteinId}:todo.anlegen`]);
      expect(((await res.json()) as ProtokollStatusAntwort).aktionen).toMatchObject([
        { status: 'uebersprungen', meldung: 'Die Deadline fehlt.' },
      ]);
      expect(t.todosListe.size).toBe(0);
    });
  });

  describe('Aktionen', () => {
    const kategorien: EventKategorieDto[] = [
      {
        id: 'k1',
        name: 'Sitzung',
        farbe: 'red',
        art: 'teilnahme',
        teilnahmeStatus: ['mitglied'],
        dauer: 'eintaegig',
        protokoll: true,
        protokollArt: 'sitzung',
        benutzt: true,
        archiviert: false,
      },
      {
        id: 'kd',
        name: 'Barabend',
        farbe: 'blue',
        art: 'dienste',
        teilnahmeStatus: null,
        dauer: 'eintaegig',
        protokoll: false,
        protokollArt: 'sitzung',
        benutzt: true,
        archiviert: false,
      },
    ];
    const bestehend = {
      id: 'e9',
      titel: 'Altes Event',
      anzeigeTitel: 'Altes Event',
      beschreibung: null,
      kategorie: { id: 'kd', name: 'Barabend', farbe: 'blue' },
      art: 'dienste',
      dauer: 'eintaegig',
      beginn: '2026-12-01T18:00:00.000Z',
      ende: '2026-12-01T21:00:00.000Z',
      abgesagt: false,
      serie: null,
      schichten: [],
      teilnahmeStatus: null,
      verantwortlich: null,
      teilnahmen: [],
    } as unknown as EventDto;

    /**
     * A protocol of Sitzung `s1` (2026-10-06) with one block per Aktion: new event, change of `e9`,
     * invitation, Aufnahme of `r`, Wahl of `m2` for the Posten `p1`. `m2` is present (one vote each).
     */
    async function aktionenSetup() {
      const t = await setup();
      t.antworten.m2 = 'teilnahme';
      // `r` has been Anwärter:in since long before the Sitzung (the new profile's entry starts today).
      await t.mitglieder.statusEintragAnlegen('r', { status: 'anwaerter', ab: '2026-01-01' });
      for (const e of await t.mitglieder.statusVerlauf('r')) {
        if (e.ab !== '2026-01-01') await t.mitglieder.statusEintragLoeschen('r', e.id);
      }
      t.kalender.kategorien.mockResolvedValue(kategorien);
      let e9 = bestehend;
      t.kalender.event.mockImplementation(async (id) => (id === 'e9' ? e9 : undefined));
      t.kalender.eventAktualisieren.mockImplementation(async (_id, daten) => {
        e9 = { ...e9, titel: daten.titel, anzeigeTitel: daten.titel };
        return {
          zeitGeaendert: false,
          geaenderteSchichten: [],
          entfernteDienste: [],
          mitgliedSubs: [],
          teilnehmerSubs: [],
          verantwortlichNeu: null,
        };
      });
      t.kalender.eventAnlegen.mockResolvedValue('e-neu');
      t.userAdmin.createUser.mockResolvedValue({
        username: 'uuid-neu',
        sub: 'uuid-neu',
        email: 'neu@example.de',
        status: 'FORCE_CHANGE_PASSWORD',
        enabled: true,
        groups: [],
      });
      const postenId = await t.posten.anlegen({ name: 'Kasse', beschreibung: null } as never);
      const stimme = { ja: 1, nein: 0, enthaltung: 0 };
      const doc = protokollLeer();
      const bausteine = {
        neu: bausteinErzeugen('bausteinEvent', {
          ...bausteinLeer('bausteinEvent'),
          name: 'Sommerfest',
          datum: '2026-12-12',
          beginnZeit: '18:00',
          endeZeit: '23:00',
          kategorieId: 'kd',
        }),
        aender: bausteinErzeugen('bausteinEvent', {
          ...bausteinLeer('bausteinEvent'),
          name: 'Neuer Name',
          datum: '2026-12-01',
          beginnZeit: '19:00',
          endeZeit: '22:00',
          kategorieId: 'kd',
          eventId: 'e9',
        }),
        einladung: bausteinErzeugen('bausteinAnwaerter', {
          vorname: 'Neu',
          nachname: 'Mensch',
          email: 'neu@example.de',
          sub: null,
        }),
        aufnahme: bausteinErzeugen('bausteinAufnahme', {
          ...bausteinLeer('bausteinAufnahme'),
          sub: 'r',
          abstimmung: { ...stimme, ergebnis: 'angenommen' },
        }),
        wahl: bausteinErzeugen('bausteinWahl', {
          ...bausteinLeer('bausteinWahl'),
          posten: 'Kasse',
          postenId,
          gueltigAb: '2026-11-01',
          kandidaten: [{ id: 'c1', sub: 'm2', name: 'M', stimmen: 1 }],
        }),
      };
      doc.content[1]!.content = [bausteine.einladung, bausteine.aufnahme, bausteine.wahl];
      doc.content[2]!.content = [bausteine.neu, bausteine.aender];
      const id = (await (await t.anlegen('admin-token', { eventId: 's1', inhalt: doc })).json())
        .id as string;
      const aktionId = (b: { attrs: { id: string } }, art: string) => `${b.attrs.id}:${art}`;
      const ids = {
        neu: aktionId(bausteine.neu, 'event.anlegen'),
        aender: aktionId(bausteine.aender, 'event.aendern'),
        einladung: aktionId(bausteine.einladung, 'anwaerter.einladen'),
        aufnahme: aktionId(bausteine.aufnahme, 'aufnahme.status'),
        wahl: aktionId(bausteine.wahl, 'wahl.posten'),
      };
      const alleIds = Object.values(ids);
      const aktionenLesen = async (token = 'vorstand-token') =>
        (await (
          await t.app.request(`/api/protokolle/${id}/aktionen`, json(token, 'GET'))
        ).json()) as ProtokollAktionenAntwort;
      const schliessen = (aktionen?: string[], token = 'vorstand-token') =>
        t.app.request(
          `/api/protokolle/${id}/status`,
          json(token, 'PUT', { status: 'abgeschlossen', aktionen }),
        );
      const oeffnen = () =>
        t.app.request(
          `/api/protokolle/${id}/status`,
          json('vorstand-token', 'PUT', { status: 'entwurf' }),
        );
      const wiederholen = (aktionen: string[], token = 'vorstand-token') =>
        t.app.request(`/api/protokolle/${id}/aktionen`, json(token, 'POST', { aktionen }));
      return { ...t, id, ids, alleIds, postenId, aktionenLesen, schliessen, oeffnen, wiederholen };
    }

    it('lists the Aktionen of the stored document for writers only', async () => {
      const t = await aktionenSetup();
      const { aktionen } = await t.aktionenLesen();
      expect(aktionen.map((a) => [a.art, a.zustand, a.ausfuehrbar])).toEqual([
        ['anwaerter.einladen', 'offen', true],
        ['aufnahme.status', 'offen', true],
        ['wahl.posten', 'offen', true],
        ['event.anlegen', 'offen', true],
        ['event.aendern', 'offen', true],
      ]);
      expect(aktionen.map((a) => a.id)).toEqual([
        t.ids.einladung,
        t.ids.aufnahme,
        t.ids.wahl,
        t.ids.neu,
        t.ids.aender,
      ]);
      expect(aktionen[1]!.personen).toMatchObject([
        { sub: 'r', username: 'user-r', status: 'anwaerter' },
      ]);
      expect('plan' in aktionen[0]!).toBe(false);
      for (const token of ['reader-token', 'member-token']) {
        const res = await t.app.request(`/api/protokolle/${t.id}/aktionen`, json(token, 'GET'));
        expect(res.status).toBe(403);
        expect((await t.wiederholen(t.alleIds, token)).status).toBe(403);
      }
      expect(
        (await t.app.request('/api/protokolle/gibtsnicht/aktionen', json('admin-token', 'GET')))
          .status,
      ).toBe(404);
    });

    it('closes with the chosen Aktionen using only the right protocolle:schreiben', async () => {
      const t = await aktionenSetup();
      // The writer cannot manage events, members or Posten through the normal routes.
      expect(
        (
          await t.app.request(
            '/api/kalender/events',
            json('vorstand-token', 'POST', { titel: 'x' }),
          )
        ).status,
      ).toBe(403);

      const res = await t.schliessen(t.alleIds);
      expect(res.status).toBe(200);
      const antwort = (await res.json()) as ProtokollStatusAntwort;
      // Claimed (version 2), then the results are written (version 3).
      expect(antwort).toMatchObject({ status: 'abgeschlossen', version: 3 });
      expect(antwort.aktionen.map((a) => [a.art, a.status])).toEqual([
        ['anwaerter.einladen', 'erledigt'],
        ['aufnahme.status', 'erledigt'],
        ['wahl.posten', 'erledigt'],
        ['event.anlegen', 'erledigt'],
        ['event.aendern', 'erledigt'],
      ]);

      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({
          titel: 'Sommerfest',
          kategorieId: 'kd',
          beginn: '2026-12-12T17:00:00.000Z',
          ende: '2026-12-12T22:00:00.000Z',
        }),
        'v',
      );
      expect(t.kalender.eventAktualisieren).toHaveBeenCalledWith(
        'e9',
        expect.objectContaining({ titel: 'Neuer Name', kategorieId: 'kd' }),
      );
      expect(t.userAdmin.createUser).toHaveBeenCalledWith('neu@example.de', []);
      expect(t.mitglieder.speichern).toHaveBeenCalledWith(
        'uuid-neu',
        expect.objectContaining({ vorname: 'Neu', nachname: 'Mensch' }),
        'anwaerter',
        '2026-10-06',
      );
      expect(t.mitglieder.statusSetzen).toHaveBeenCalledWith('r', 'mitglied', '2026-10-06');
      expect(t.posten.besetzungAnlegen).toHaveBeenCalledWith(
        t.postenId,
        { mitgliedSub: 'm2', start: '2026-11-01', ende: null },
        [],
      );

      // The ids are written back into the document (one save, one version) and the results kept.
      const dto = await t.holen(t.id);
      expect(dto.status).toBe('abgeschlossen');
      expect(dto.version).toBe(3);
      expect(JSON.stringify(dto.inhalt)).toContain('"eventId":"e-neu"');
      expect(JSON.stringify(dto.inhalt)).toContain('"sub":"uuid-neu"');
      expect(Object.keys(dto.kopf.aktionen).sort()).toEqual([...t.alleIds].sort());
      expect(dto.kopf.aktionen[t.ids.neu]).toMatchObject({ status: 'erledigt', von: 'v' });
      // The snapshot shows the status before the Aufnahme.
      expect(dto.kopf.statusSchnappschuss?.r).toBe('anwaerter');

      // The list now shows what was done.
      const { aktionen } = await t.aktionenLesen();
      expect(aktionen.every((a) => a.zustand === 'erledigt')).toBe(true);

      // The created event is not computed any more: its entry keeps the original text and the
      // event, and stands where its Baustein is (before the change of `e9`).
      expect(aktionen.map((a) => a.id)).toEqual([
        t.ids.einladung,
        t.ids.aufnahme,
        t.ids.wahl,
        t.ids.neu,
        t.ids.aender,
      ]);
      expect(aktionen[3]).toMatchObject({
        art: 'event.anlegen',
        text: expect.stringContaining('Sommerfest'),
        eventId: 'e-neu',
        ergebnis: { text: 'Event im Kalender angelegt.' },
      });
    });

    it('creates events of old blocks without kategorieId from the Kategorie of their Vorlage', async () => {
      const t = await aktionenSetup();
      t.kalender.vorlagen.mockResolvedValue([
        {
          id: 'v1',
          titel: 'Barabend',
          kategorieId: 'kd',
          archiviert: false,
          schichten: [],
        } as never,
      ]);
      const alt = bausteinErzeugen('bausteinEvent', {
        ...bausteinLeer('bausteinEvent'),
        name: 'Altes Fest',
        datum: '2026-12-12',
        beginnZeit: '18:00',
        endeZeit: '23:00',
        vorlageId: 'v1',
        kategorieId: null,
      });
      const doc = protokollLeer();
      doc.content[2]!.content = [alt];
      const dto = await t.holen(t.id);
      const res = await t.app.request(
        `/api/protokolle/${t.id}`,
        json('admin-token', 'PUT', { inhalt: doc, kopf: dto.kopf, version: dto.version }),
      );
      expect(res.status).toBe(200);
      const { aktionen } = await t.aktionenLesen();
      expect(aktionen).toHaveLength(1);
      expect(aktionen[0]).toMatchObject({ zustand: 'offen', ausfuehrbar: true });
      await t.schliessen([aktionen[0]!.id]);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledWith(
        expect.objectContaining({ titel: 'Altes Fest', kategorieId: 'kd' }),
        'v',
      );
    });

    it('does not run anything twice when the protocol is reopened and closed again', async () => {
      const t = await aktionenSetup();
      await t.schliessen(t.alleIds);
      expect((await t.oeffnen()).status).toBe(200);
      expect((await t.aktionenLesen()).aktionen.every((a) => a.zustand === 'erledigt')).toBe(true);
      const antwort = (await (await t.schliessen(t.alleIds)).json()) as ProtokollStatusAntwort;
      expect(antwort.aktionen.map((a) => a.status)).toEqual(Array(5).fill('uebersprungen'));
      expect(t.kalender.eventAnlegen).toHaveBeenCalledTimes(1);
      expect(t.userAdmin.createUser).toHaveBeenCalledTimes(1);
      expect(
        t.mitglieder.statusSetzen.mock.calls.filter((c) => c[0] === 'r' && c[2] === '2026-10-06'),
      ).toHaveLength(1);
      expect(t.posten.besetzungAnlegen).toHaveBeenCalledTimes(1);
      expect(t.kalender.eventAktualisieren).toHaveBeenCalledTimes(1);
      // Nothing recorded earlier is lost.
      expect(Object.keys((await t.holen(t.id)).kopf.aktionen)).toHaveLength(5);
    });

    it('closes although an Aktion fails and lets it run again later', async () => {
      const t = await aktionenSetup();
      t.kalender.eventAnlegen.mockRejectedValueOnce(new KalenderUngueltig('Kaputtes Event'));
      t.kalender.eventAktualisieren.mockRejectedValueOnce(new EntfernungBestaetigen([], []));
      const antwort = (await (await t.schliessen(t.alleIds)).json()) as ProtokollStatusAntwort;
      const nach = Object.fromEntries(antwort.aktionen.map((a) => [a.art, a]));
      expect(nach['event.anlegen']).toMatchObject({ status: 'fehler', meldung: 'Kaputtes Event' });
      expect(nach['event.aendern']).toMatchObject({ status: 'fehler' });
      expect(nach['event.aendern']!.meldung).toContain('Dienste');
      expect(nach['wahl.posten']!.status).toBe('erledigt');
      const dto = await t.holen(t.id);
      expect(dto.status).toBe('abgeschlossen');
      expect(dto.kopf.aktionen[t.ids.neu]).toMatchObject({
        status: 'fehler',
        text: 'Kaputtes Event',
      });
      expect(JSON.stringify(dto.inhalt)).not.toContain('e-neu');

      const { aktionen } = await t.aktionenLesen();
      expect(aktionen.filter((a) => a.zustand === 'fehler').map((a) => a.id)).toEqual([
        t.ids.neu,
        t.ids.aender,
      ]);

      // Retry for the closed protocol: the id is written back and the version counts up.
      const res = await t.wiederholen([t.ids.neu, t.ids.einladung, 'x:unbekannt']);
      expect(res.status).toBe(200);
      const wieder = (await res.json()) as ProtokollAktionenAusfuehrenAntwort;
      expect(wieder.ergebnisse.map((e) => [e.id, e.status])).toEqual([
        [t.ids.neu, 'erledigt'],
        [t.ids.einladung, 'uebersprungen'],
        ['x:unbekannt', 'uebersprungen'],
      ]);
      expect(wieder.version).toBe(5);
      expect(wieder.aktionen.find((a) => a.id === t.ids.neu)).toMatchObject({
        zustand: 'erledigt',
      });
      const nachher = await t.holen(t.id);
      expect(nachher.version).toBe(5);
      expect(JSON.stringify(nachher.inhalt)).toContain('"eventId":"e-neu"');
      expect(nachher.kopf.aktionen[t.ids.neu]).toMatchObject({ status: 'erledigt' });
      expect(t.kalender.eventAnlegen).toHaveBeenCalledTimes(2);
    });

    it('runs the Aktionen once when two closes use the same version', async () => {
      const t = await aktionenSetup();
      const [a, b] = await Promise.all([t.schliessen(t.alleIds), t.schliessen(t.alleIds)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const verloren = a.status === 409 ? a : b;
      expect(await verloren.json()).toMatchObject({
        error: 'Das Protokoll wurde inzwischen geändert. Bitte lade es neu.',
      });
      expect(t.kalender.eventAnlegen).toHaveBeenCalledTimes(1);
      expect(t.userAdmin.createUser).toHaveBeenCalledTimes(1);
      expect((await t.holen(t.id)).status).toBe('abgeschlossen');
    });

    it('runs the Aktionen once when "Ausführen" is called in parallel', async () => {
      const t = await aktionenSetup();
      expect((await t.schliessen([])).status).toBe(200);
      const [a, b] = await Promise.all([t.wiederholen(t.alleIds), t.wiederholen(t.alleIds)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(t.kalender.eventAnlegen).toHaveBeenCalledTimes(1);
      expect(t.userAdmin.createUser).toHaveBeenCalledTimes(1);
    });

    it('keeps the protocol closed and stores the failure when an Aktion fails after the claim', async () => {
      const t = await aktionenSetup();
      t.kalender.eventAnlegen.mockRejectedValueOnce(new Error('boom'));
      const res = await t.schliessen([t.ids.neu]);
      expect(res.status).toBe(200);
      const dto = await t.holen(t.id);
      expect(dto.status).toBe('abgeschlossen');
      expect(dto.kopf.aktionen[t.ids.neu]).toMatchObject({ status: 'fehler' });
      expect((await t.schliessen([t.ids.neu])).status).toBe(200);
    });

    it('reports an email address that is taken and does not create a profile', async () => {
      const t = await aktionenSetup();
      t.userAdmin.createUser.mockRejectedValueOnce(
        Object.assign(new Error('exists'), { name: 'AliasExistsException' }),
      );
      const antwort = (await (
        await t.schliessen([t.ids.einladung])
      ).json()) as ProtokollStatusAntwort;
      expect(antwort.aktionen).toMatchObject([
        { art: 'anwaerter.einladen', status: 'fehler', meldung: 'E-Mail-Adresse bereits vergeben' },
      ]);
      expect(t.mitglieder.speichern.mock.calls.filter((c) => c[0] === 'uuid-neu')).toEqual([]);
    });

    it('closes without Aktionen when none are chosen and only retries closed protocols', async () => {
      const t = await aktionenSetup();
      expect((await t.wiederholen(t.alleIds)).status).toBe(409);
      const antwort = (await (await t.schliessen()).json()) as ProtokollStatusAntwort;
      expect(antwort.aktionen).toEqual([]);
      expect(t.kalender.eventAnlegen).not.toHaveBeenCalled();
      expect((await t.holen(t.id)).kopf.aktionen).toEqual({});
      expect((await t.wiederholen([])).status).toBe(400);
    });

    it('skips Aktionen that cannot run and keeps the results when a draft is saved', async () => {
      const t = await aktionenSetup();
      const dto = await t.holen(t.id);
      // The Sitzung date is over, but the Posten does not exist any more.
      t.posten.holen.mockResolvedValueOnce(undefined);
      const antwort = (await (
        await t.schliessen([t.ids.wahl, t.ids.neu])
      ).json()) as ProtokollStatusAntwort;
      expect(antwort.aktionen.map((a) => [a.art, a.status])).toEqual([
        ['wahl.posten', 'uebersprungen'],
        ['event.anlegen', 'erledigt'],
      ]);
      expect(antwort.aktionen[0]!.meldung).toBe('Den Posten gibt es nicht mehr.');
      await t.oeffnen();
      const offen = await t.holen(t.id);
      expect(Object.keys(offen.kopf.aktionen)).toEqual([t.ids.neu]);
      // The editor sends back its own kopf; the results stay.
      const put = await t.app.request(
        `/api/protokolle/${t.id}`,
        json('vorstand-token', 'PUT', {
          inhalt: offen.inhalt,
          kopf: { ...dto.kopf, aktionen: {} },
          version: offen.version,
        }),
      );
      expect(put.status).toBe(200);
      expect(Object.keys((await t.holen(t.id)).kopf.aktionen)).toEqual([t.ids.neu]);
    });

    it('pre-fills a new protocol from the calendar', async () => {
      const t = await setup();
      t.kalender.kategorien.mockResolvedValue(kategorien);
      const ereignis = (id: string, beginn: string, extra: object = {}) =>
        ({
          ...bestehend,
          id,
          titel: id,
          anzeigeTitel: id,
          beginn,
          ende: new Date(Date.parse(beginn) + 3 * 3600_000).toISOString(),
          ...extra,
        }) as EventDto;
      t.kalender.events.mockResolvedValue([
        ereignis('vorbei', '2026-10-20T18:00:00.000Z'),
        ereignis('kommt', '2026-11-20T18:00:00.000Z', { verantwortlich: { sub: 'm2' } }),
        ereignis('serie', '2026-11-21T18:00:00.000Z', { serie: 'barabend' }),
        ereignis('sitzung', '2026-11-22T18:00:00.000Z', {
          kategorie: { id: 'k1', name: 'Sitzung', farbe: 'red' },
        }),
        ereignis('abgesagt', '2026-11-23T18:00:00.000Z', { abgesagt: true }),
      ]);
      const vorschlag = (await (
        await t.app.request('/api/protokolle/vorschlag?eventId=s2', json('admin-token', 'GET'))
      ).json()) as { inhalt: ProtokollDokument };
      const ids = (i: number) =>
        vorschlag.inhalt.content[i]!.content!.map(
          (k) => (k.attrs?.daten as { eventId?: string } | undefined)?.eventId,
        );
      expect(ids(0)).toEqual(['vorbei']);
      expect(ids(2)).toEqual(['kommt']);
      expect(vorschlag.inhalt.content[2]!.content![0]).toMatchObject({
        attrs: { daten: { name: 'kommt', kategorieId: 'kd', verantwortlichSub: 'm2' } },
      });
      // The calendar is asked from the earlier Sitzung on, or for 92 days without one.
      expect(t.kalender.events).toHaveBeenLastCalledWith('2026-08-03', expect.any(String));
    });
  });
});
