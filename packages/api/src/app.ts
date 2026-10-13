import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  createUserSchema,
  emailAendernSchema,
  emailBestaetigenSchema,
  besetzungEingabeSchema,
  mitgliedAktualisierenSchema,
  postenAktualisierenSchema,
  postenArchivierenSchema,
  postenRechteSetzenSchema,
  profilbildAnfrageSchema,
  setGroupsSchema,
  setMitgliedStatusSchema,
  setUsernameSchema,
  type Health,
  type Me,
  type Mitglied,
  type Posten,
  bezeichnungFuer,
} from '@c4/shared';
import { UsernameTakenError, type Konto, type UserAdmin } from './admin';
import {
  CodeUngueltig,
  EmailVergeben,
  NeuAnmeldungNoetig,
  type EmailAenderung,
} from './emailaenderung';
import type { MitgliedRow } from './db/schema';
import {
  heuteBerlin,
  istAktuell,
  type AktuellerPosten,
  type PostenDetails,
  type PostenStore,
} from './posten';
import { kanaeleLesen, kanaeleSchreiben, type MitgliederStore } from './mitglieder';
import { kleinKey, profilbildPrefix, type Profilbilder } from './profilbilder';
import { authenticate, requirePermission, type AuthEnv, type TokenVerifier } from './auth';

export interface AppDeps {
  verifyToken: TokenVerifier;
  userAdmin: UserAdmin;
  emailAenderung: EmailAenderung;
  mitglieder: MitgliederStore;
  posten: PostenStore;
  profilbilder: Profilbilder;
  /** Resolves when the database answers `select 1`. */
  pingDb: () => Promise<void>;
}

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

export function createApp(deps: AppDeps) {
  const auth = authenticate(
    deps.verifyToken,
    async (sub) => (await deps.mitglieder.holen(sub))?.status,
    (sub) => deps.posten.rechteVon(sub),
  );
  const adminOnly = requirePermission('users:manage');
  const mitgliederLesen = requirePermission('mitglieder:lesen');
  const profilBearbeiten = requirePermission('profil:bearbeiten');
  const postenLesen = requirePermission('posten:lesen');
  const postenBearbeiten = requirePermission('posten:bearbeiten');

  /** Merges the profile row with the Cognito account; either side may be missing. */
  const alsMitglied = async (
    sub: string,
    row: MitgliedRow | undefined,
    konto: Konto | undefined,
    rollen?: string[],
    posten: AktuellerPosten[] = [],
  ): Promise<Mitglied> => ({
    sub,
    vorname: row?.vorname ?? '',
    nachname: row?.nachname ?? '',
    anrede: row?.anrede ?? 'neutral',
    kontaktkanaele: kanaeleLesen(row?.kontaktkanaele ?? null),
    discordName: row?.discordName ?? null,
    username: konto?.username ?? null,
    status: row?.status ?? 'anwaerter',
    email: konto?.email ?? null,
    aktiviert: konto?.aktiviert ?? true,
    adresse: row?.adresse ?? null,
    telefon: row?.telefon ?? null,
    ueberMich: row?.ueberMich ?? null,
    profilbildKey: row?.profilbildKey ?? null,
    profilbildUrl: row?.profilbildKey
      ? await deps.profilbilder.anzeigeUrl(kleinKey(row.profilbildKey))
      : null,
    profilbildGrossUrl: row?.profilbildKey
      ? await deps.profilbilder.anzeigeUrl(row.profilbildKey)
      : null,
    posten: posten.map((p) => ({
      id: p.id,
      name: p.name,
      bezeichnung: bezeichnungFuer(p, row?.anrede ?? 'neutral'),
    })),
    ...(rollen && { rollen }),
  });

  /** Maps a Posten to its DTO; Besetzungen carry the display data of the member. */
  const alsPosten = (
    p: PostenDetails,
    zeilen: Map<string, MitgliedRow>,
    konten: Map<string, Konto>,
    heute: string,
  ): Posten => ({
    id: p.id,
    name: p.name,
    beschreibung: p.beschreibung,
    bezeichnungMaennlich: p.bezeichnungMaennlich,
    bezeichnungWeiblich: p.bezeichnungWeiblich,
    bezeichnungNeutral: p.bezeichnungNeutral,
    archiviert: p.archiviert,
    rechte: p.rechte,
    besetzungen: p.besetzungen
      .map((b) => ({
        id: b.id,
        mitgliedSub: b.mitgliedSub,
        mitglied: {
          username: konten.get(b.mitgliedSub)?.username ?? null,
          vorname: zeilen.get(b.mitgliedSub)?.vorname ?? '',
          nachname: zeilen.get(b.mitgliedSub)?.nachname ?? '',
          status: zeilen.get(b.mitgliedSub)?.status ?? 'anwaerter',
          anrede: zeilen.get(b.mitgliedSub)?.anrede ?? 'neutral',
        },
        start: b.startDatum,
        ende: b.endDatum,
        aktuell: istAktuell(b, heute),
      }))
      .sort(
        (a, b) =>
          Number(b.aktuell) - Number(a.aktuell) ||
          b.start.localeCompare(a.start) ||
          a.id.localeCompare(b.id),
      ),
  });

  const postenMitMitgliedern = async (liste: PostenDetails[]): Promise<Posten[]> => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const zeilen = new Map(rows.map((r) => [r.sub, r]));
    const heute = heuteBerlin();
    return liste.map((p) => alsPosten(p, zeilen, konten, heute));
  };

  const eigenePosten = async (sub: string) =>
    (await deps.posten.aktuelleNachMitglied()).get(sub) ?? [];

  /** Besetzungen may only name members that already have a profile row. */
  const mitgliedMussExistieren = async (sub: string) => {
    if (!(await deps.mitglieder.holen(sub))) {
      throw new HTTPException(400, { message: 'Mitglied hat noch kein Profil' });
    }
  };

  /** All members: every profile row plus every enabled account that has no profile yet. */
  const alleMitglieder = async (mitRollen: boolean): Promise<Mitglied[]> => {
    const [rows, konten, rollen, posten] = await Promise.all([
      deps.mitglieder.alle(),
      deps.userAdmin.konten(),
      mitRollen ? deps.userAdmin.rollen() : undefined,
      deps.posten.aktuelleNachMitglied(),
    ]);
    const nachSub = new Map(rows.map((r) => [r.sub, r]));
    const subs = [
      ...rows.map((r) => r.sub),
      ...[...konten.values()].filter((k) => k.enabled && !nachSub.has(k.sub)).map((k) => k.sub),
    ];
    const liste = await Promise.all(
      subs.map((s) =>
        alsMitglied(
          s,
          nachSub.get(s),
          konten.get(s),
          rollen && (rollen.get(s) ?? []),
          posten.get(s),
        ),
      ),
    );
    const sortKey = (m: Mitglied) =>
      `${m.nachname || '\uffff'} ${m.vorname} ${m.username ?? m.email ?? ''}`.toLowerCase();
    return liste.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
  };

  return (
    new Hono<AuthEnv>()
      .basePath('/api')
      .get('/health', async (c) => {
        let db: Health['db'] = 'ok';
        try {
          await deps.pingDb();
        } catch (err) {
          console.error('health: db check failed', err);
          db = 'error';
        }
        return c.json({ status: 'ok', db } satisfies Health, db === 'ok' ? 200 : 503);
      })
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
      .put(
        '/me/email',
        auth,
        profilBearbeiten,
        zValidator('json', emailAendernSchema),
        async (c) => {
          await emailAenderung(() =>
            deps.emailAenderung.anfordern(c.get('accessToken'), c.req.valid('json').email),
          );
          return c.json({ ok: true });
        },
      )
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
      )
      .get('/mitglieder', auth, mitgliederLesen, async (c) =>
        c.json(await alleMitglieder(c.get('permissions').includes('users:manage'))),
      )
      // `kennung` is the username; members that have none yet are addressed by their sub.
      .get('/mitglieder/:kennung', auth, mitgliederLesen, async (c) => {
        const kennung = c.req.param('kennung');
        const liste = await alleMitglieder(c.get('permissions').includes('users:manage'));
        const mitglied =
          liste.find((m) => m.sub === kennung) ??
          liste.find((m) => m.username?.toLowerCase() === kennung.toLowerCase());
        if (!mitglied) throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
        return c.json(mitglied);
      })
      .put(
        '/admin/mitglieder/:sub/status',
        auth,
        adminOnly,
        zValidator('json', setMitgliedStatusSchema),
        async (c) => {
          const { status } = c.req.valid('json');
          if (!(await deps.mitglieder.statusSetzen(c.req.param('sub'), status))) {
            throw new HTTPException(404, { message: 'Mitglied nicht gefunden' });
          }
          return c.json({ status });
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
      .get('/posten', auth, postenLesen, async (c) => {
        const mitArchiv = c.req.query('archiv') === '1';
        if (mitArchiv && !c.get('permissions').includes('posten:bearbeiten')) {
          throw new HTTPException(403, { message: 'Forbidden' });
        }
        return c.json(await postenMitMitgliedern(await deps.posten.alle(mitArchiv)));
      })
      .get('/posten/:id', auth, postenLesen, async (c) => {
        const p = await deps.posten.holen(c.req.param('id'));
        if (!p || (p.archiviert && !c.get('permissions').includes('posten:bearbeiten'))) {
          throw new HTTPException(404, { message: 'Posten nicht gefunden' });
        }
        return c.json((await postenMitMitgliedern([p]))[0]);
      })
      .post(
        '/posten',
        auth,
        postenBearbeiten,
        zValidator('json', postenAktualisierenSchema),
        async (c) => {
          const id = await deps.posten.anlegen(c.req.valid('json'));
          return c.json({ id }, 201);
        },
      )
      .put(
        '/posten/:id',
        auth,
        postenBearbeiten,
        zValidator('json', postenAktualisierenSchema),
        async (c) => {
          if (!(await deps.posten.aktualisieren(c.req.param('id'), c.req.valid('json')))) {
            throw new HTTPException(404, { message: 'Posten nicht gefunden' });
          }
          return c.json({ ok: true });
        },
      )
      .put(
        '/posten/:id/archiv',
        auth,
        postenBearbeiten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          if (!(await deps.posten.archivieren(c.req.param('id'), archiviert))) {
            throw new HTTPException(404, { message: 'Posten nicht gefunden' });
          }
          return c.json({ archiviert });
        },
      )
      .post(
        '/posten/:id/besetzungen',
        auth,
        postenBearbeiten,
        zValidator('json', besetzungEingabeSchema),
        async (c) => {
          const daten = c.req.valid('json');
          await mitgliedMussExistieren(daten.mitgliedSub);
          const id = await deps.posten.besetzungAnlegen(c.req.param('id'), daten);
          if (!id) throw new HTTPException(404, { message: 'Posten nicht gefunden' });
          return c.json({ id }, 201);
        },
      )
      .put(
        '/posten/:id/besetzungen/:bid',
        auth,
        postenBearbeiten,
        zValidator('json', besetzungEingabeSchema),
        async (c) => {
          const daten = c.req.valid('json');
          await mitgliedMussExistieren(daten.mitgliedSub);
          if (!(await deps.posten.besetzungAendern(c.req.param('id'), c.req.param('bid'), daten))) {
            throw new HTTPException(404, { message: 'Besetzung nicht gefunden' });
          }
          return c.json({ ok: true });
        },
      )
      .delete('/posten/:id/besetzungen/:bid', auth, postenBearbeiten, async (c) => {
        if (!(await deps.posten.besetzungLoeschen(c.req.param('id'), c.req.param('bid')))) {
          throw new HTTPException(404, { message: 'Besetzung nicht gefunden' });
        }
        return c.json({ ok: true });
      })
      .put(
        '/admin/posten/:id/rechte',
        auth,
        adminOnly,
        zValidator('json', postenRechteSetzenSchema),
        async (c) => {
          const { rechte } = c.req.valid('json');
          if (!(await deps.posten.rechteSetzen(c.req.param('id'), rechte))) {
            throw new HTTPException(404, { message: 'Posten nicht gefunden' });
          }
          return c.json({ rechte });
        },
      )
      .onError((err, c) => {
        if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
        console.error(err);
        return c.json({ error: 'Internal server error' }, 500);
      })
  );
}
export type AppType = ReturnType<typeof createApp>;
