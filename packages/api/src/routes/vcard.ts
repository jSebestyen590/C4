import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { vcardErstellen, permissionsFor } from '@c4/shared';
import { istDeaktiviert, vcardTokenHash } from '../mitglieder';
import { kleinKey } from '../profilbilder';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const vcardRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, mitgliederLesen, alleMitglieder } = ctx;

  return (
    new Hono<AuthEnv>()
      .post('/me/vcard-token', auth, mitgliederLesen, async (c) => {
        const sub = c.get('user').sub;
        if (!(await deps.mitglieder.holen(sub)))
          throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        const { token, ablauf } = await deps.mitglieder.vcardTokenErzeugen(sub);
        return c.json({ token, ablauf: ablauf.toISOString() });
      })
      // Public on purpose (no `auth`); API Gateway needs a matching route without authorizer.
      .get('/vcard/:token/:datei', async (c) => {
        const nichtGefunden = new HTTPException(404, { message: 'Kontakt nicht gefunden' });
        const eintrag = await deps.mitglieder.vcardTokenSuchen(
          vcardTokenHash(c.req.param('token')),
        );
        if (!eintrag || eintrag.ablauf.getTime() <= Date.now()) throw nichtGefunden;
        // The token owner must still be active and allowed to read members.
        const [inhaber, rollen, rechte] = await Promise.all([
          deps.mitglieder.holen(eintrag.sub),
          deps.userAdmin.rollen(),
          deps.posten.rechteVon(eintrag.sub),
        ]);
        if (!inhaber || istDeaktiviert(inhaber)) throw nichtGefunden;
        const erlaubt = permissionsFor(rollen.get(eintrag.sub) ?? [], inhaber.status, rechte);
        if (!erlaubt.includes('mitglieder:lesen')) throw nichtGefunden;
        let datei: string;
        try {
          datei = decodeURIComponent(c.req.param('datei'));
        } catch {
          throw nichtGefunden;
        }
        const kennung = datei.replace(/\.vcf$/i, '');
        const liste = await alleMitglieder(false, true);
        const mitglied =
          liste.find((m) => m.sub === kennung) ??
          liste.find((m) => m.username?.toLowerCase() === kennung.toLowerCase());
        if (!mitglied || mitglied.deaktiviert) throw nichtGefunden;
        let fotoBase64: string | null = null;
        if (mitglied.profilbildKey) {
          try {
            const bytes = await deps.profilbilder.lesen(kleinKey(mitglied.profilbildKey));
            fotoBase64 = Buffer.from(bytes).toString('base64');
          } catch (err) {
            console.error('vcard: profile picture not readable', err);
          }
        }
        const name =
          mitglied.username ?? (`${mitglied.vorname} ${mitglied.nachname}`.trim() || 'kontakt');
        const dateiname = `${name.replace(/[^\w.-]+/g, '_')}.vcf`;
        return c.body(vcardErstellen({ ...mitglied, fotoBase64 }), 200, {
          'Content-Type': 'text/vcard; charset=utf-8',
          'Content-Disposition': `inline; filename="${dateiname}"`,
          'Cache-Control': 'no-store',
        });
      })
  );
  // ----- Push notifications (generic module, see docs/benachrichtigungen.md);
};
