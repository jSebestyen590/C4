import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { type MitgliedHistorie, heuteBerlin } from '@c4/shared';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const mitgliederRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, mitgliederLesen, alleMitglieder } = ctx;

  return (
    new Hono<AuthEnv>()
      .get('/mitglieder', auth, mitgliederLesen, async (c) => {
        const verwaltet = c.get('permissions').includes('users:manage');
        // Deactivated members are only listed on request, and only for admins.
        const mitDeaktivierten = verwaltet && c.req.query('deaktivierte') === '1';
        return c.json(await alleMitglieder(verwaltet, mitDeaktivierten));
      })
      // `kennung` is the username; members that have none yet are addressed by their sub.
      .get('/mitglieder/:kennung', auth, mitgliederLesen, async (c) => {
        const kennung = c.req.param('kennung');
        // Deactivated members stay reachable: links from old Dienste, Trichter and the Verlauf point here.
        const liste = await alleMitglieder(c.get('permissions').includes('users:manage'), true);
        const mitglied =
          liste.find((m) => m.sub === kennung) ??
          liste.find((m) => m.username?.toLowerCase() === kennung.toLowerCase());
        if (!mitglied) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        return c.json(mitglied);
      })
      // Status history, Posten and deactivation date of a member (same visibility as the member itself).
      .get('/mitglieder/:kennung/historie', auth, mitgliederLesen, async (c) => {
        const kennung = c.req.param('kennung');
        const liste = await alleMitglieder(c.get('permissions').includes('users:manage'), true);
        const mitglied =
          liste.find((m) => m.sub === kennung) ??
          liste.find((m) => m.username?.toLowerCase() === kennung.toLowerCase());
        if (!mitglied) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        const [verlauf, besetzungen, row] = await Promise.all([
          deps.mitglieder.statusVerlauf(mitglied.sub),
          deps.posten.besetzungenVon(mitglied.sub),
          deps.mitglieder.holen(mitglied.sub),
        ]);
        const historie: MitgliedHistorie = {
          statusVerlauf: verlauf,
          besetzungen: besetzungen.map((b) => ({
            postenId: b.postenId,
            postenName: b.postenName,
            start: b.startDatum,
            ende: b.endDatum,
          })),
          deaktiviertAm: row?.deaktiviertAm ? heuteBerlin(row.deaktiviertAm) : null,
        };
        return c.json(historie);
      })
  );
};
