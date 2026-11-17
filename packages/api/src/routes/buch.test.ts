import { describe, expect, it } from 'vitest';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('buch', () => {
  const json = (token: string, method: string, body?: unknown) => ({
    method,
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  /** v may read the Finanzen, admin (a) may do everything; m2 is a plain member; all have a profile. */
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
    t.posten.rechteVon.mockImplementation(async (sub: string) =>
      sub === 'v' ? ['finanzen:lesen' as const] : [],
    );
    const roh = (token: string, method: string, pfad: string, body?: unknown) =>
      t.app.request(`/api/buch${pfad}`, json(token, method, body));
    const anfrage = (token: string, method: string, pfad: string, body?: unknown) =>
      roh(
        token,
        method,
        pfad,
        method === 'POST' &&
          (pfad === '/abrechnungen' || pfad.endsWith('/storno')) &&
          body &&
          typeof body === 'object' &&
          !('idempotenzSchluessel' in body)
          ? { idempotenzSchluessel: crypto.randomUUID(), ...body }
          : body,
      );
    const lesen = async <T>(token: string, pfad: string): Promise<T> => {
      const res = await roh(token, 'GET', pfad);
      expect(res.status, pfad).toBe(200);
      return (await res.json()) as T;
    };
    const seite = async (daten: Record<string, unknown>) => {
      const res = await anfrage('admin-token', 'POST', '/seiten', daten);
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };
    const tarif = async (status = 'anwaerter', strichwertCent = 150, maxUeberzugCent = 3000) => {
      const res = await anfrage('admin-token', 'POST', '/tarife', {
        status,
        strichwertCent,
        maxUeberzugCent,
        gueltigAb: '2020-01-01',
      });
      expect(res.status).toBe(201);
    };
    const abrechnen = (zeilen: Record<string, unknown>[], body: Record<string, unknown> = {}) =>
      anfrage('admin-token', 'POST', '/abrechnungen', { zeilen, ...body });
    return { ...t, anfrage, roh, lesen, seite, tarif, abrechnen };
  }

  type Seite = {
    id: string;
    nummer: number;
    saldoCent: number;
    ueberzug: boolean;
    tarif: unknown;
    verlauf?: { id: string; storniert: boolean; betragCent: number; stornoVon: string | null }[];
  };

  it('requires the matching right on every route', async () => {
    const t = await setup();
    const routen: [string, string, string[]][] = [
      ['GET', '/seiten', ['member-token']],
      ['GET', '/seiten/x', ['member-token']],
      ['POST', '/seiten', ['member-token', 'vorstand-token']],
      ['POST', '/seiten/x/archivieren', ['member-token', 'vorstand-token']],
      ['POST', '/seiten/x/nummer', ['member-token', 'vorstand-token']],
      ['POST', '/seiten/x/reaktivieren', ['member-token', 'vorstand-token']],
      ['GET', '/tarife', ['member-token']],
      ['POST', '/tarife', ['member-token', 'vorstand-token']],
      ['POST', '/abrechnungen', ['member-token', 'vorstand-token']],
      ['POST', '/eintraege/x/storno', ['member-token', 'vorstand-token']],
    ];
    for (const [method, pfad, tokens] of routen) {
      for (const token of tokens) {
        const res = await t.anfrage(token, method, pfad, method === 'GET' ? undefined : {});
        expect(res.status, `${method} ${pfad} ${token}`).toBe(403);
      }
    }
    // Everybody with a profile reads their own page and the Rangliste; Lesen alone reads the pages.
    expect((await t.anfrage('member-token', 'GET', '/meine')).status).toBe(200);
    expect((await t.anfrage('member-token', 'GET', '/rangliste')).status).toBe(200);
    expect((await t.anfrage('vorstand-token', 'GET', '/seiten')).status).toBe(200);
    expect((await t.anfrage('vorstand-token', 'GET', '/tarife')).status).toBe(200);
  });

  it('has no update or delete routes', async () => {
    const t = await setup();
    const id = await t.seite({ nummer: 1, externName: 'Gast' });
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      for (const pfad of [`/seiten/${id}`, '/tarife', '/abrechnungen', `/eintraege/${id}`]) {
        const res = await t.anfrage('admin-token', method, pfad, {});
        expect(res.status, `${method} ${pfad}`).toBe(404);
      }
    }
  });

  it('keeps page numbers unique among active pages and frees them on archiving', async () => {
    const t = await setup();
    const id = await t.seite({ nummer: 5, externName: 'Gast' });
    const doppelt = await t.anfrage('admin-token', 'POST', '/seiten', {
      nummer: 5,
      mitgliedSub: 'm2',
    });
    expect(doppelt.status).toBe(409);
    expect(((await doppelt.json()) as { error: string }).error).toContain('Nummer');
    expect((await t.anfrage('admin-token', 'POST', `/seiten/${id}/archivieren`)).status).toBe(200);
    await t.seite({ nummer: 5, mitgliedSub: 'm2' });
    const aktiv = await t.lesen<Seite[]>('vorstand-token', '/seiten');
    expect(aktiv.map((s) => s.nummer)).toEqual([5]);
    const archiv = await t.lesen<Seite[]>('vorstand-token', '/seiten?archiviert=true');
    expect(archiv.map((s) => s.id)).toEqual([id]);
    expect((await t.anfrage('admin-token', 'POST', '/seiten/nope/archivieren')).status).toBe(404);
  });

  it('allows one active page per member and validates the owner', async () => {
    const t = await setup();
    await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    const zweite = await t.anfrage('admin-token', 'POST', '/seiten', {
      nummer: 2,
      mitgliedSub: 'm2',
    });
    expect(zweite.status).toBe(409);
    const unbekannt = await t.anfrage('admin-token', 'POST', '/seiten', {
      nummer: 3,
      mitgliedSub: 'niemand',
    });
    expect(unbekannt.status).toBe(400);
    const beides = await t.anfrage('admin-token', 'POST', '/seiten', {
      nummer: 4,
      mitgliedSub: 'r',
      externName: 'Gast',
    });
    expect(beides.status).toBe(400);
  });

  it('books an Abrechnung with the Strichwert of the tarif, ignoring empty rows', async () => {
    const t = await setup();
    await t.tarif('anwaerter', 150);
    const s1 = await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    const s2 = await t.seite({ nummer: 2, mitgliedSub: 'r' });
    const res = await t.abrechnen([
      { seiteId: s1, striche: 4, barCent: 100, abzahlungCent: 300 },
      { seiteId: s2, striche: 0, barCent: 0, abzahlungCent: 0 },
    ]);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { eintraege: number }).eintraege).toBe(1);
    const seiten = await t.lesen<Seite[]>('vorstand-token', '/seiten');
    expect(seiten.find((s) => s.id === s1)?.saldoCent).toBe(300 - 4 * 150 - 100);
    expect(seiten.find((s) => s.id === s2)?.saldoCent).toBe(0);
    const eigene = await t.lesen<{ seiten: Seite[] }>('member-token', '/meine');
    expect(eigene.seiten).toHaveLength(1);
    expect(eigene.seiten[0]?.saldoCent).toBe(-400);
    expect(eigene.seiten[0]?.verlauf).toHaveLength(1);
    expect(eigene.seiten[0]?.tarif).toEqual({ strichwertCent: 150, maxUeberzugCent: 3000 });
  });

  it('rejects an all-empty Abrechnung and pages that are unknown or archived', async () => {
    const t = await setup();
    const id = await t.seite({ nummer: 1, externName: 'Gast' });
    expect(
      (await t.abrechnen([{ seiteId: id, striche: 0, barCent: 0, abzahlungCent: 0 }])).status,
    ).toBe(400);
    expect((await t.abrechnen([])).status).toBe(400);
    expect(
      (await t.abrechnen([{ seiteId: 'nope', striche: 0, barCent: 100, abzahlungCent: 0 }])).status,
    ).toBe(409);
    await t.anfrage('admin-token', 'POST', `/seiten/${id}/archivieren`);
    expect(
      (await t.abrechnen([{ seiteId: id, striche: 0, barCent: 100, abzahlungCent: 0 }])).status,
    ).toBe(409);
  });

  it('rejects Striche without a tarif but accepts Bar and Abzahlung', async () => {
    const t = await setup();
    const id = await t.seite({ nummer: 1, externName: 'Gast' });
    const ohne = await t.abrechnen([{ seiteId: id, striche: 2, barCent: 0, abzahlungCent: 0 }]);
    expect(ohne.status).toBe(400);
    expect(((await ohne.json()) as { error: string }).error).toContain('Tarif');
    await t.tarif('mitglied', 100); // not the tarif of an external page
    expect(
      (await t.abrechnen([{ seiteId: id, striche: 2, barCent: 0, abzahlungCent: 0 }])).status,
    ).toBe(400);
    expect(
      (await t.abrechnen([{ seiteId: id, striche: 0, barCent: 250, abzahlungCent: 100 }])).status,
    ).toBe(201);
    await t.tarif('extern', 200);
    expect(
      (await t.abrechnen([{ seiteId: id, striche: 2, barCent: 0, abzahlungCent: 0 }])).status,
    ).toBe(201);
    const seiten = await t.lesen<Seite[]>('vorstand-token', '/seiten');
    expect(seiten[0]?.saldoCent).toBe(-250 + 100 - 400);
  });

  it('returns the balance of each settled page', async () => {
    const t = await setup();
    await t.tarif();
    const id = await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    const res = await t.abrechnen([{ seiteId: id, striche: 2, barCent: 0, abzahlungCent: 100 }]);
    expect(((await res.json()) as { saldi: unknown[] }).saldi).toEqual([
      { seiteId: id, nummer: 1, saldoCent: -200 },
    ]);
  });

  it('is idempotent: the same key books once and answers 200', async () => {
    const t = await setup();
    await t.tarif();
    const id = await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    const body = {
      idempotenzSchluessel: crypto.randomUUID(),
      zeilen: [{ seiteId: id, striche: 2, barCent: 0, abzahlungCent: 0 }],
    };
    const erste = await t.anfrage('admin-token', 'POST', '/abrechnungen', body);
    expect(erste.status).toBe(201);
    const zweite = await t.anfrage('admin-token', 'POST', '/abrechnungen', body);
    expect(zweite.status).toBe(200);
    const a = (await erste.json()) as { id: string };
    const b = (await zweite.json()) as { id: string; wiederholt?: boolean };
    expect(b.id).toBe(a.id);
    expect(b.wiederholt).toBe(true);
    expect((await t.lesen<Seite[]>('vorstand-token', '/seiten'))[0]?.saldoCent).toBe(-300);
    expect(t.gesendet).toHaveLength(0);
  });

  it('reverses an entry once, with a reason, and never a reversal', async () => {
    const t = await setup();
    await t.tarif();
    const id = await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    await t.abrechnen([{ seiteId: id, striche: 2, barCent: 0, abzahlungCent: 0 }]);
    const eintragId = (await t.lesen<Seite>('vorstand-token', `/seiten/${id}`)).verlauf![0]!.id;
    expect(
      (await t.anfrage('admin-token', 'POST', `/eintraege/${eintragId}/storno`, {})).status,
    ).toBe(400);
    const key = crypto.randomUUID();
    const storno = await t.anfrage('admin-token', 'POST', `/eintraege/${eintragId}/storno`, {
      idempotenzSchluessel: key,
      text: 'Vertippt',
    });
    expect(storno.status).toBe(201);
    const wieder = await t.anfrage('admin-token', 'POST', `/eintraege/${eintragId}/storno`, {
      idempotenzSchluessel: key,
      text: 'Vertippt',
    });
    expect(wieder.status).toBe(200);
    const nochmal = await t.anfrage('admin-token', 'POST', `/eintraege/${eintragId}/storno`, {
      text: 'Nochmal',
    });
    expect(nochmal.status).toBe(409);
    const detail = await t.lesen<Seite>('vorstand-token', `/seiten/${id}`);
    expect(detail.saldoCent).toBe(0);
    expect(detail.verlauf).toHaveLength(2);
    expect(detail.verlauf?.find((e) => e.id === eintragId)?.storniert).toBe(true);
    const stornoEintrag = detail.verlauf!.find((e) => e.stornoVon === eintragId)!;
    const storniereStorno = await t.anfrage(
      'admin-token',
      'POST',
      `/eintraege/${stornoEintrag.id}/storno`,
      {
        text: 'Storno vom Storno',
      },
    );
    expect(storniereStorno.status).toBe(409);
    expect(
      (await t.anfrage('admin-token', 'POST', '/eintraege/nope/storno', { text: 'x' })).status,
    ).toBe(404);
  });

  it('notifies only members whose page is over the limit', async () => {
    const t = await setup();
    await t.tarif('anwaerter', 1000, 3000);
    const knapp = await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    const drueber = await t.seite({ nummer: 2, mitgliedSub: 'r' });
    const extern = await t.seite({ nummer: 3, externName: 'Gast' });
    await t.tarif('extern', 1000, 0);
    const res = await t.abrechnen([
      { seiteId: knapp, striche: 3, barCent: 0, abzahlungCent: 0 }, // exactly -30,00: allowed
      { seiteId: drueber, striche: 4, barCent: 0, abzahlungCent: 0 }, // -40,00: over
      { seiteId: extern, striche: 1, barCent: 0, abzahlungCent: 0 }, // external: no push
    ]);
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { ueberzug: { seiteId: string; nummer: number }[] };
    expect(dto.ueberzug.map((u) => u.nummer).sort()).toEqual([2, 3]);
    expect(t.gesendet.map((g) => g.endpoint)).toEqual(['https://push.example/r']);
    expect(t.gesendet[0]?.url).toBe('/app/buch');
    expect(t.gesendet[0]?.text).toContain('-40,00');
    const seiten = await t.lesen<Seite[]>('vorstand-token', '/seiten');
    expect(seiten.filter((s) => s.ueberzug).map((s) => s.nummer)).toEqual([2, 3]);
  });

  it('manages tarife and shows the latest one', async () => {
    const t = await setup();
    const falsch = await t.anfrage('admin-token', 'POST', '/tarife', {
      status: 'mitglied',
      strichwertCent: 0,
      maxUeberzugCent: 0,
      gueltigAb: '2026-01-01',
    });
    expect(falsch.status).toBe(400);
    await t.tarif('mitglied', 100);
    const liste = await t.lesen<{ status: string; strichwertCent: number }[]>(
      'vorstand-token',
      '/tarife',
    );
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ status: 'mitglied', strichwertCent: 100 });
  });

  it('ranks by turnover per year without exposing balances', async () => {
    const t = await setup();
    await t.tarif('anwaerter', 100, 100000);
    await t.tarif('extern', 100, 100000);
    const s1 = await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    const s2 = await t.seite({ nummer: 2, externName: 'Gast' });
    await t.abrechnen([
      { seiteId: s1, striche: 5, barCent: 0, abzahlungCent: 10000 },
      { seiteId: s2, striche: 1, barCent: 300, abzahlungCent: 0 },
    ]);
    type R = {
      aktuellesJahr: number;
      jahre: number[];
      rangliste: {
        mitglied: { sub: string } | null;
        externName: string | null;
        umsatzCent: number;
        striche: number;
      }[];
    };
    const r = await t.lesen<R>('member-token', '/rangliste');
    expect(r.rangliste.map((z) => [z.mitglied?.sub ?? null, z.externName, z.umsatzCent])).toEqual([
      ['m2', null, 500],
      [null, 'Gast', 400],
    ]);
    expect(JSON.stringify(r)).not.toContain('saldo');
    expect(r.jahre).toEqual([r.aktuellesJahr]);
    const leer = await t.lesen<R>('member-token', `/rangliste?jahr=${r.aktuellesJahr - 1}`);
    expect(leer.rangliste).toEqual([]);
    expect((await t.roh('member-token', 'GET', '/rangliste?jahr=abc')).status).toBe(400);
  });

  type Ereignis = { art: string; nummer: number | null; erstelltVon: { sub: string } | null };
  const verlaufVon = async (t: Awaited<ReturnType<typeof setup>>, id: string) =>
    (await t.lesen<Seite & { nummernVerlauf: Ereignis[] }>('vorstand-token', `/seiten/${id}`))
      .nummernVerlauf;

  it('renumbers an active page and keeps the number history', async () => {
    const t = await setup();
    const id = await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    await t.seite({ nummer: 2, externName: 'Gast' });
    const nummer = (token: string, n: number, pfad = id) =>
      t.anfrage(token, 'POST', `/seiten/${pfad}/nummer`, { nummer: n });
    expect((await nummer('admin-token', 1)).status).toBe(400);
    expect((await nummer('admin-token', 2)).status).toBe(409);
    expect((await nummer('admin-token', 6, 'nope')).status).toBe(404);
    expect((await nummer('vorstand-token', 6)).status).toBe(403);
    expect((await nummer('member-token', 6)).status).toBe(403);
    expect((await nummer('admin-token', 6)).status).toBe(200);
    const detail = await t.lesen<Seite>('vorstand-token', `/seiten/${id}`);
    expect(detail.nummer).toBe(6);
    expect((await verlaufVon(t, id)).map((e) => [e.art, e.nummer])).toEqual([
      ['nummer', 6],
      ['angelegt', 1],
    ]);
    expect((await verlaufVon(t, id))[0]?.erstelltVon?.sub).toBe('a');
    // The old number is free again.
    await t.seite({ nummer: 1, externName: 'Neu' });
    await t.anfrage('admin-token', 'POST', `/seiten/${id}/archivieren`);
    expect((await nummer('admin-token', 7)).status).toBe(409);
  });

  it('reactivates an archived page under a chosen number', async () => {
    const t = await setup();
    const id = await t.seite({ nummer: 1, mitgliedSub: 'm2' });
    const reaktivieren = (token: string, n: number, pfad = id) =>
      t.anfrage(token, 'POST', `/seiten/${pfad}/reaktivieren`, { nummer: n });
    expect((await reaktivieren('admin-token', 1)).status).toBe(409); // still active
    await t.anfrage('admin-token', 'POST', `/seiten/${id}/archivieren`);
    await t.seite({ nummer: 1, externName: 'Gast' }); // took the old number
    expect((await reaktivieren('admin-token', 1)).status).toBe(409);
    const zweite = await t.seite({ nummer: 2, mitgliedSub: 'm2' }); // member has another page
    const anderes = await reaktivieren('admin-token', 3);
    expect(anderes.status).toBe(409);
    expect(((await anderes.json()) as { error: string }).error).toContain(
      'schon eine aktive Seite',
    );
    await t.anfrage('admin-token', 'POST', `/seiten/${zweite}/archivieren`);
    expect((await reaktivieren('vorstand-token', 3)).status).toBe(403);
    expect((await reaktivieren('admin-token', 6, 'nope')).status).toBe(404);
    expect((await reaktivieren('admin-token', 3)).status).toBe(200);
    const detail = await t.lesen<Seite & { archiviert: boolean }>(
      'vorstand-token',
      `/seiten/${id}`,
    );
    expect(detail).toMatchObject({ nummer: 3, archiviert: false });
    expect((await verlaufVon(t, id)).map((e) => [e.art, e.nummer])).toEqual([
      ['reaktiviert', 3],
      ['archiviert', null],
      ['angelegt', 1],
    ]);
  });

  it('shows nothing for members without a page', async () => {
    const t = await setup();
    const eigene = await t.lesen<{ seiten: Seite[] }>('member-token', '/meine');
    expect(eigene.seiten).toEqual([]);
  });
});
