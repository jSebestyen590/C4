import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  emailAendernSchema,
  emailBestaetigenSchema,
  mitgliedAktualisierenSchema,
  profilbildAnfrageSchema,
  setUsernameSchema,
  type Me,
} from '@c4/shared';
import { UsernameTakenError } from '../admin';
import { CodeUngueltig, EmailVergeben, NeuAnmeldungNoetig } from '../emailaenderung';
import { kanaeleSchreiben } from '../mitglieder';
import { profilbildPrefix } from '../profilbilder';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

/** Maps the email-change errors to HTTP statuses the web app can tell apart. */
async function emailAenderung(aktion: () => Promise<void>): Promise<void> {
  try {
    await aktion();
  } catch (err) {
    if (err instanceof NeuAnmeldungNoetig)
      throw new HTTPException(403, { message: 'Erneute Anmeldung erforderlich' });
    if (err instanceof EmailVergeben)
      throw new HTTPException(409, { message: 'E-Mail-Adresse bereits vergeben' });
    if (err instanceof CodeUngueltig) throw new HTTPException(400, { message: 'Ungültiger Code' });
    throw err;
  }
}

export const meRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, profilBearbeiten, alsMitglied } = ctx;

  const eigenePosten = async (sub: string) =>
    (await deps.posten.aktuelleNachMitglied()).get(sub) ?? [];

  return new Hono<AuthEnv>()
    .get('/me', auth, async (c) => {
      const user = c.get('user');
      const me: Me = {
        sub: user.sub,
        anrede: (await deps.mitglieder.holen(user.sub))?.anrede ?? 'neutral',
        preferredUsername: await deps.userAdmin.getPreferredUsername(user.username ?? user.sub),
        groups: user.groups,
        permissions: c.get('permissions'),
      };
      return c.json(me);
    })
    .put('/me/username', auth, zValidator('json', setUsernameSchema), async (c) => {
      const user = c.get('user');
      const { username } = c.req.valid('json');
      try {
        await deps.userAdmin.setPreferredUsername(user.username ?? user.sub, username);
      } catch (err) {
        if (err instanceof UsernameTakenError) {
          throw new HTTPException(409, { message: 'Username already taken' });
        }
        throw err;
      }
      return c.json({ username });
    })
    .put('/me/email', auth, profilBearbeiten, zValidator('json', emailAendernSchema), async (c) => {
      await emailAenderung(() =>
        deps.emailAenderung.anfordern(c.get('accessToken'), c.req.valid('json').email),
      );
      return c.json({ ok: true });
    })
    .post(
      '/me/email/bestaetigen',
      auth,
      profilBearbeiten,
      zValidator('json', emailBestaetigenSchema),
      async (c) => {
        await emailAenderung(() =>
          deps.emailAenderung.bestaetigen(c.get('accessToken'), c.req.valid('json').code),
        );
        return c.json({ ok: true });
      },
    )
    .get('/me/mitglied', auth, profilBearbeiten, async (c) => {
      const row = await deps.mitglieder.holen(c.get('user').sub);
      if (!row) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
      return c.json(
        await alsMitglied(
          row.sub,
          row,
          (await deps.userAdmin.konten()).get(row.sub),
          undefined,
          await eigenePosten(row.sub),
        ),
      );
    })
    .put(
      '/me/mitglied',
      auth,
      profilBearbeiten,
      zValidator('json', mitgliedAktualisierenSchema),
      async (c) => {
        const { sub } = c.get('user');
        const { profilbildKey, kontaktkanaele, ...daten } = c.req.valid('json');
        if (profilbildKey && !profilbildKey.startsWith(profilbildPrefix(sub))) {
          throw new HTTPException(400, { message: 'Ungültiges Profilbild' });
        }
        const vorher = await deps.mitglieder.holen(sub);
        await deps.mitglieder.speichern(sub, {
          ...daten,
          kontaktkanaele: kanaeleSchreiben(kontaktkanaele),
          profilbildKey,
        });
        if (vorher?.profilbildKey && vorher.profilbildKey !== profilbildKey) {
          await deps.profilbilder.loeschen(vorher.profilbildKey).catch((err) => {
            console.error('profilbild: delete failed', err);
          });
        }
        const row = await deps.mitglieder.holen(sub);
        if (!row) throw new Error('Mitglied nach dem Speichern nicht gefunden');
        return c.json(
          await alsMitglied(
            sub,
            row,
            (await deps.userAdmin.konten()).get(sub),
            undefined,
            await eigenePosten(sub),
          ),
        );
      },
    )
    .post(
      '/me/profilbild',
      auth,
      profilBearbeiten,
      zValidator('json', profilbildAnfrageSchema),
      async (c) =>
        c.json(await deps.profilbilder.uploadVorbereiten(c.get('user').sub, c.req.valid('json'))),
    );
};
