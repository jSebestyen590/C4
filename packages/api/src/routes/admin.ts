import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  createUserSchema,
  datumBerlin,
  heuteBerlin,
  setGroupsSchema,
  setMitgliedAktivSchema,
  setMitgliedStatusSchema,
  statusEintragEingabeSchema,
  type DeaktivierenVorschau,
} from '@c4/shared';
import { istDeaktiviert, LetzterStatusEintrag, StatusDatumDoppelt } from '../mitglieder';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const adminRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, adminOnly, gefunden } = ctx;

  /** 409 for a deactivated account: its status (history) is frozen. */
  const statusVerlaufBearbeitbar = async (sub: string) => {
    if (istDeaktiviert(await deps.mitglieder.holen(sub))) {
      throw new HTTPException(409, {
        message: 'Der Account ist deaktiviert, der Status kann nicht geändert werden.',
      });
    }
  };

  /** Maps the store's status history errors to HTTP errors. */
  const statusVerlaufSchreiben = async <T>(aktion: () => Promise<T>): Promise<T> => {
    try {
      return await aktion();
    } catch (err) {
      if (err instanceof StatusDatumDoppelt) {
        throw new HTTPException(409, {
          message: 'Für dieses Datum gibt es schon einen Statuseintrag.',
        });
      }
      if (err instanceof LetzterStatusEintrag) {
        throw new HTTPException(400, {
          message: 'Der letzte Statuseintrag kann nicht gelöscht werden.',
        });
      }
      throw err;
    }
  };

  return (
    new Hono<AuthEnv>()
      .post(
        '/admin/mitglieder/:sub/status-verlauf',
        auth,
        adminOnly,
        zValidator('json', statusEintragEingabeSchema),
        async (c) => {
          const sub = c.req.param('sub');
          await statusVerlaufBearbeitbar(sub);
          const id = await statusVerlaufSchreiben(() =>
            deps.mitglieder.statusEintragAnlegen(sub, c.req.valid('json')),
          );
          gefunden(id, 'Mitglied nicht gefunden');
          return c.json(await deps.mitglieder.statusVerlauf(sub), 201);
        },
      )
      .put(
        '/admin/mitglieder/:sub/status-verlauf/:id',
        auth,
        adminOnly,
        zValidator('json', statusEintragEingabeSchema),
        async (c) => {
          const sub = c.req.param('sub');
          await statusVerlaufBearbeitbar(sub);
          gefunden(
            await statusVerlaufSchreiben(() =>
              deps.mitglieder.statusEintragAendern(sub, c.req.param('id'), c.req.valid('json')),
            ),
            'Eintrag nicht gefunden',
          );
          return c.json(await deps.mitglieder.statusVerlauf(sub));
        },
      )
      .delete('/admin/mitglieder/:sub/status-verlauf/:id', auth, adminOnly, async (c) => {
        const sub = c.req.param('sub');
        await statusVerlaufBearbeitbar(sub);
        gefunden(
          await statusVerlaufSchreiben(() =>
            deps.mitglieder.statusEintragLoeschen(sub, c.req.param('id')),
          ),
          'Eintrag nicht gefunden',
        );
        return c.json(await deps.mitglieder.statusVerlauf(sub));
      })
      .put(
        '/admin/mitglieder/:sub/status',
        auth,
        adminOnly,
        zValidator('json', setMitgliedStatusSchema),
        async (c) => {
          const { status, ab } = c.req.valid('json');
          await statusVerlaufBearbeitbar(c.req.param('sub'));
          if (
            !(await deps.mitglieder.statusSetzen(c.req.param('sub'), status, ab ?? heuteBerlin()))
          ) {
            throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
          }
          return c.json({ status });
        },
      )
      // What is still open for the member; shown before deactivating. Nothing is changed.
      .get('/admin/mitglieder/:sub/deaktivieren-vorschau', auth, adminOnly, async (c) => {
        const sub = c.req.param('sub');
        const heute = heuteBerlin();
        const [dienste, posten, schluessel] = await Promise.all([
          deps.kalender.meineDienste(sub, new Date(Date.now() - 24 * 3600 * 1000)),
          deps.posten.aktuelleNachMitglied(heute),
          deps.schluessel.alle(false),
        ]);
        const gesehen = new Set<string>();
        const vorschau: DeaktivierenVorschau = {
          dienste: dienste.flatMap((d) => {
            const datum = datumBerlin(d.beginn);
            const schluesselDienst = `${d.eventId}|${datum}`;
            if (d.abgesagt || datum < heute || gesehen.has(schluesselDienst)) return [];
            gesehen.add(schluesselDienst);
            return [{ eventId: d.eventId, titel: d.eventTitel, datum }];
          }),
          posten: (posten.get(sub) ?? []).map((p) => ({ id: p.id, name: p.name })),
          schluessel: schluessel
            .filter((s) => s.halter?.art === 'mitglied' && s.halter.sub === sub)
            .map((s) => ({ id: s.id, name: s.name })),
        };
        return c.json(vorschau);
      })
      // Deactivate / reactivate. The database decides (see `authenticate`); Cognito only blocks the login.
      .put(
        '/admin/mitglieder/:sub/aktiv',
        auth,
        adminOnly,
        zValidator('json', setMitgliedAktivSchema),
        async (c) => {
          const sub = c.req.param('sub');
          const { aktiv } = c.req.valid('json');
          if (sub === c.get('user').sub && !aktiv) {
            throw new HTTPException(400, { message: 'Du kannst dich nicht selbst deaktivieren.' });
          }
          const [row, konto] = await Promise.all([
            deps.mitglieder.holen(sub),
            deps.userAdmin.konten().then((k) => k.get(sub)),
          ]);
          if (!row && !konto) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
          await deps.mitglieder.deaktiviertSetzen(sub, !aktiv);
          if (konto) await deps.userAdmin.setEnabled(konto.kontoName, aktiv);
          return c.json({ aktiv });
        },
      )
      .post('/admin/users', auth, adminOnly, zValidator('json', createUserSchema), async (c) => {
        const { email, groups, vorname = '', nachname = '', status } = c.req.valid('json');
        const user = await deps.userAdmin.createUser(email, groups);
        // Every invited user gets a member row right away; names may be filled in later.
        if (user.sub) {
          await deps.mitglieder.speichern(
            user.sub,
            {
              vorname,
              nachname,
              anrede: null,
              kontaktkanaele: null,
              discordName: null,
              adresse: null,
              telefon: null,
              ueberMich: null,
              profilbildKey: null,
              geburtsdatum: null,
              geburtstagImKalender: null,
              wohnheim: null,
            },
            status,
          );
        }
        return c.json({ ...user, vorname, nachname, status }, 201);
      })
      .put(
        '/admin/mitglieder/:sub/rollen',
        auth,
        adminOnly,
        zValidator('json', setGroupsSchema),
        async (c) => {
          const sub = c.req.param('sub');
          const { groups } = c.req.valid('json');
          if (sub === c.get('user').sub && !groups.includes('admin')) {
            throw new HTTPException(400, {
              message: 'Du kannst dir die Administrator-Rolle nicht selbst entziehen.',
            });
          }
          const konto = (await deps.userAdmin.konten()).get(sub);
          if (!konto) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
          return c.json({ groups: await deps.userAdmin.setGroups(konto.kontoName, groups) });
        },
      )
  );
};
