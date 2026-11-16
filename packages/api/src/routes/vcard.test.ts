import { describe, expect, it } from 'vitest';
import { type Konto } from '../admin';
import { vcardTokenHash, type MitgliedDaten } from '../mitglieder';
import { makeApp, bearer } from '../test/appTestHelfer';

describe('vCard links', () => {
  const daten: MitgliedDaten = {
    vorname: 'Erika',
    nachname: 'Muster',
    anrede: 'weiblich',
    kontaktkanaele: 'whatsapp',
    discordName: null,
    adresse: null,
    telefon: '0171 1234567',
    ueberMich: null,
    profilbildKey: 'profilbilder/m2/bild.jpg',
    geburtsdatum: null,
    geburtstagImKalender: null,
    wohnheim: null,
  };

  async function setup() {
    const t = makeApp();
    await t.mitglieder.speichern('r', { ...daten, profilbildKey: null });
    await t.mitglieder.speichern('m2', daten);
    t.userAdmin.konten.mockResolvedValue(
      new Map<string, Konto>([
        [
          'm2',
          {
            sub: 'm2',
            kontoName: 'k2',
            username: 'erika',
            email: 'e@example.de',
            aktiviert: true,
            enabled: true,
          },
        ],
      ]),
    );
    const token = async (bearerToken = 'reader-token') =>
      (await (
        await t.app.request('/api/me/vcard-token', { method: 'POST', headers: bearer(bearerToken) })
      ).json()) as { token: string; ablauf: string };
    return { t, token };
  }

  it('issues a token valid for 24 hours and replaces the old one', async () => {
    const { t, token } = await setup();
    const first = await token();
    const ablauf = new Date(first.ablauf).getTime() - Date.now();
    expect(ablauf).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(ablauf).toBeLessThanOrEqual(24 * 3600 * 1000);
    const second = await token();
    expect(second.token).not.toBe(first.token);
    expect((await t.app.request(`/api/vcard/${first.token}/erika.vcf`)).status).toBe(404);
    expect((await t.app.request(`/api/vcard/${second.token}/erika.vcf`)).status).toBe(200);
  });

  it('requires authentication to issue a token', async () => {
    const { t } = await setup();
    expect((await t.app.request('/api/me/vcard-token', { method: 'POST' })).status).toBe(401);
  });

  it('serves the vCard with picture and the right headers, by username or sub', async () => {
    const { t, token } = await setup();
    const { token: tok } = await token();
    for (const datei of ['erika.vcf', 'ERIKA.vcf', 'm2.vcf']) {
      const res = await t.app.request(`/api/vcard/${tok}/${datei}`);
      expect(res.status, datei).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/vcard; charset=utf-8');
      expect(res.headers.get('content-disposition')).toBe('inline; filename="erika.vcf"');
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.text();
      expect(body).toContain('BEGIN:VCARD');
      expect(body).toContain('FN:Erika Muster');
      expect(body).toContain('NICKNAME:erika');
      expect(body).toContain('TEL;TYPE=CELL:+491711234567');
      expect(body).toContain('EMAIL;TYPE=INTERNET:e@example.de');
      expect(body).toContain('PHOTO;ENCODING=b;TYPE=JPEG:AQID');
    }
    expect(t.profilbilder.lesen).toHaveBeenCalledWith('profilbilder/m2/bild-klein.jpg');
  });

  it('leaves the photo out when it cannot be read', async () => {
    const { t, token } = await setup();
    t.profilbilder.lesen.mockRejectedValue(new Error('weg'));
    const { token: tok } = await token();
    const res = await t.app.request(`/api/vcard/${tok}/erika.vcf`);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('PHOTO');
  });

  it('answers 404 for unknown and expired tokens and unknown members', async () => {
    const { t, token } = await setup();
    expect((await t.app.request('/api/vcard/unbekannt/erika.vcf')).status).toBe(404);
    const { token: tok } = await token();
    expect((await t.app.request(`/api/vcard/${tok}/niemand.vcf`)).status).toBe(404);
    t.mitglieder.vcardTokens.set(vcardTokenHash(tok), {
      sub: 'r',
      ablauf: new Date(Date.now() - 1000),
    });
    expect((await t.app.request(`/api/vcard/${tok}/erika.vcf`)).status).toBe(404);
  });

  it('answers 404 for a deactivated member', async () => {
    const { t, token } = await setup();
    const { token: tok } = await token();
    await t.mitglieder.deaktiviertSetzen('m2', true);
    expect((await t.app.request(`/api/vcard/${tok}/erika.vcf`)).status).toBe(404);
  });

  it('stops working when the token owner is deactivated', async () => {
    const { t, token } = await setup();
    const { token: tok } = await token();
    expect((await t.app.request(`/api/vcard/${tok}/erika.vcf`)).status).toBe(200);
    await t.mitglieder.deaktiviertSetzen('r', true);
    expect((await t.app.request(`/api/vcard/${tok}/erika.vcf`)).status).toBe(404);
  });

  it('answers 404 for a malformed percent-encoded file name', async () => {
    const { t, token } = await setup();
    const { token: tok } = await token();
    expect((await t.app.request(`/api/vcard/${tok}/%E0%A4%A.vcf`)).status).toBe(404);
  });
});
