import { describe, expect, it } from 'vitest';
import { type Konto } from '../admin';
import { type MitgliedDaten } from '../mitglieder';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('kalender: Geburtstage', () => {
  const get = (app: ReturnType<typeof makeApp>['app'], query: string, token = 'reader-token') =>
    app.request(`/api/kalender/geburtstage${query}`, { headers: bearer(token) });
  const profil = (extra: Partial<MitgliedDaten>): MitgliedDaten => ({
    vorname: 'Eva',
    nachname: 'Muster',
    anrede: 'weiblich',
    kontaktkanaele: null,
    discordName: null,
    adresse: null,
    telefon: null,
    ueberMich: null,
    profilbildKey: null,
    geburtsdatum: null,
    geburtstagImKalender: null,
    wohnheim: null,
    ...extra,
  });

  it('requires authentication', async () => {
    expect((await makeApp().app.request('/api/kalender/geburtstage')).status).toBe(401);
  });

  it('lists visible birthdays in the range with age and username', async () => {
    const t = makeApp();
    t.userAdmin.konten.mockResolvedValue(
      new Map([['m1', { sub: 'm1', username: 'eva' } as Konto]]),
    );
    await t.mitglieder.speichern('m1', profil({ geburtsdatum: '1990-06-20' }));
    await t.mitglieder.speichern(
      'm3',
      profil({ vorname: 'Max', geburtsdatum: '1985-06-10', geburtstagImKalender: true }),
    );
    await t.mitglieder.speichern(
      'm4',
      profil({ vorname: 'Hidden', geburtsdatum: '1985-06-12', geburtstagImKalender: false }),
    );
    await t.mitglieder.speichern('m5', profil({ vorname: 'Ohne' }));
    const res = await get(t.app, '?von=2026-06-01&bis=2026-06-30');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        datum: '2026-06-10',
        alter: 41,
        mitglied: {
          sub: 'm3',
          username: null,
          vorname: 'Max',
          nachname: 'Muster',
          status: 'anwaerter',
          anrede: 'weiblich',
        },
      },
      {
        datum: '2026-06-20',
        alter: 36,
        mitglied: {
          sub: 'm1',
          username: 'eva',
          vorname: 'Eva',
          nachname: 'Muster',
          status: 'anwaerter',
          anrede: 'weiblich',
        },
      },
    ]);
  });

  it('includes the own hidden birthday never: hidden from the calendar even though the profile shows it', async () => {
    const t = makeApp();
    await t.mitglieder.speichern(
      'r',
      profil({ geburtsdatum: '1990-06-20', geburtstagImKalender: false }),
    );
    expect(await (await get(t.app, '?von=2026-06-01&bis=2026-06-30')).json()).toEqual([]);
  });

  it('validates the range', async () => {
    const { app } = makeApp();
    expect((await get(app, '')).status).toBe(400);
    expect((await get(app, '?von=2026-06-01&bis=2026-06-31')).status).toBe(400);
    expect((await get(app, '?von=2026-06-10&bis=2026-06-01')).status).toBe(400);
    expect((await get(app, '?von=2026-01-01&bis=2027-02-05')).status).toBe(200);
    expect((await get(app, '?von=2026-01-01&bis=2027-02-06')).status).toBe(400);
  });
});
