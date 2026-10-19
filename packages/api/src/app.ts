import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  createUserSchema,
  emailAendernSchema,
  emailBestaetigenSchema,
  heuteBerlin,
  besetzungAnlegenSchema,
  besetzungEingabeSchema,
  einlagerungenSchema,
  einlagerungSchema,
  entnahmenSchema,
  entnahmeSchema,
  umlagerungenSchema,
  gebindeSchema,
  inventurAbschlussSchema,
  inventurStartenSchema,
  inventurZaehlungSchema,
  lagerortReihenfolgeSchema,
  lagerortSchema,
  lagerortWarenSchema,
  wareSchema,
  warengruppeSchema,
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
  AblosungUngueltig,
  BesetzungUeberschneidung,
  istAktuell,
  type AktuellerPosten,
  type PostenDetails,
  type PostenStore,
} from './posten';
import { WarenKonflikt, WarenUngueltig, type WarenStore } from './waren';
import { kanaeleLesen, kanaeleSchreiben, type MitgliederStore } from './mitglieder';
import { kleinKey, profilbildPrefix, type Profilbilder } from './profilbilder';
import { authenticate, requirePermission, type AuthEnv, type TokenVerifier } from './auth';

export interface AppDeps {
  verifyToken: TokenVerifier;
  userAdmin: UserAdmin;
  emailAenderung: EmailAenderung;
  mitglieder: MitgliederStore;
  posten: PostenStore;
  waren: WarenStore;
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
  const warenLesen = requirePermission('waren:lesen');
  const bestandBuchen = requirePermission('bestand:buchen');
  const warenVerwalten = requirePermission('waren:verwalten');

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

  /** Maps the store's Besetzung errors to HTTP statuses the web app can tell apart. */
  const besetzungFehler = (err: unknown): never => {
    if (err instanceof AblosungUngueltig) {
      throw new HTTPException(400, { message: 'Ungültige Ablösung' });
    }
    if (err instanceof BesetzungUeberschneidung) {
      throw new HTTPException(409, { message: 'Besetzung überschneidet sich' });
    }
    throw err;
  };

  /** Maps the Waren store's domain errors to 400 (invalid) and 409 (conflict). */
  const warenFehler = (err: unknown): never => {
    if (err instanceof WarenUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof WarenKonflikt) throw new HTTPException(409, { message: err.message });
    throw err;
  };

  /** 404 unless the store found the entry (`false` / `undefined` mean it does not exist). */
  const gefunden = <T>(wert: T | false | undefined, meldung: string): T => {
    if (wert === false || wert === undefined) throw new HTTPException(404, { message: meldung });
    return wert;
  };

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
        zValidator('json', besetzungAnlegenSchema),
        async (c) => {
          const { ablosung, ...daten } = c.req.valid('json');
          await mitgliedMussExistieren(daten.mitgliedSub);
          const id = await deps.posten
            .besetzungAnlegen(c.req.param('id'), daten, ablosung)
            .catch(besetzungFehler);
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
          const geaendert = await deps.posten
            .besetzungAendern(c.req.param('id'), c.req.param('bid'), daten)
            .catch(besetzungFehler);
          if (!geaendert) {
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
      // ----- Waren: Lagerorte
      .get('/lagerorte', auth, warenLesen, async (c) =>
        c.json(await deps.waren.lagerorte(c.req.query('archiv') === '1')),
      )
      .get('/lagerorte/bestand', auth, warenLesen, async (c) =>
        c.json(await deps.waren.lagerortBestand()),
      )
      .post('/lagerorte', auth, warenVerwalten, zValidator('json', lagerortSchema), async (c) => {
        const id = await deps.waren.lagerortAnlegen(c.req.valid('json')).catch(warenFehler);
        return c.json({ id }, 201);
      })
      .put(
        '/lagerorte/:id',
        auth,
        warenVerwalten,
        zValidator('json', lagerortSchema),
        async (c) => {
          gefunden(
            await deps.waren
              .lagerortAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/lagerorte/:id', auth, warenVerwalten, async (c) => {
        gefunden(
          await deps.waren.lagerortLoeschen(c.req.param('id')).catch(warenFehler),
          'Lagerort nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/lagerorte/:id/archiv',
        auth,
        warenVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.waren.lagerortArchivieren(c.req.param('id'), archiviert).catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // `:id` = `root` orders the top level.
      .put(
        '/lagerorte/:id/reihenfolge',
        auth,
        warenVerwalten,
        zValidator('json', lagerortReihenfolgeSchema),
        async (c) => {
          const id = c.req.param('id');
          const { ids } = c.req.valid('json');
          gefunden(
            await deps.waren.lagerortReihenfolge(id === 'root' ? null : id, ids).catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ ids });
        },
      )
      .get('/lagerorte/:id/waren', auth, warenLesen, async (c) => {
        const wareIds = gefunden(
          await deps.waren.lagerortWaren(c.req.param('id')),
          'Lagerort nicht gefunden',
        );
        return c.json({ wareIds });
      })
      .put(
        '/lagerorte/:id/waren',
        auth,
        warenVerwalten,
        zValidator('json', lagerortWarenSchema),
        async (c) => {
          const { wareIds } = c.req.valid('json');
          gefunden(
            await deps.waren.lagerortWarenSetzen(c.req.param('id'), wareIds).catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ wareIds });
        },
      )
      // ----- Waren: Warengruppen
      .get('/warengruppen', auth, warenLesen, async (c) =>
        c.json(await deps.waren.warengruppen(c.req.query('archiv') === '1')),
      )
      .post(
        '/warengruppen',
        auth,
        warenVerwalten,
        zValidator('json', warengruppeSchema),
        async (c) => {
          const id = await deps.waren.warengruppeAnlegen(c.req.valid('json')).catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/warengruppen/:id',
        auth,
        warenVerwalten,
        zValidator('json', warengruppeSchema),
        async (c) => {
          gefunden(
            await deps.waren
              .warengruppeAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Warengruppe nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/warengruppen/:id', auth, warenVerwalten, async (c) => {
        gefunden(
          await deps.waren.warengruppeLoeschen(c.req.param('id')).catch(warenFehler),
          'Warengruppe nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/warengruppen/:id/archiv',
        auth,
        warenVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.waren
              .warengruppeArchivieren(c.req.param('id'), archiviert)
              .catch(warenFehler),
            'Warengruppe nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // ----- Waren: Gebinde
      .get('/gebinde', auth, warenLesen, async (c) =>
        c.json(await deps.waren.gebinde(c.req.query('archiv') === '1')),
      )
      .post('/gebinde', auth, warenVerwalten, zValidator('json', gebindeSchema), async (c) => {
        const id = await deps.waren.gebindeAnlegen(c.req.valid('json')).catch(warenFehler);
        return c.json({ id }, 201);
      })
      .put('/gebinde/:id', auth, warenVerwalten, zValidator('json', gebindeSchema), async (c) => {
        gefunden(
          await deps.waren
            .gebindeAktualisieren(c.req.param('id'), c.req.valid('json'))
            .catch(warenFehler),
          'Gebinde nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .delete('/gebinde/:id', auth, warenVerwalten, async (c) => {
        gefunden(
          await deps.waren.gebindeLoeschen(c.req.param('id')).catch(warenFehler),
          'Gebinde nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/gebinde/:id/archiv',
        auth,
        warenVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.waren.gebindeArchivieren(c.req.param('id'), archiviert),
            'Gebinde nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // ----- Waren
      .get('/waren', auth, warenLesen, async (c) =>
        c.json(await deps.waren.waren(c.req.query('archiv') === '1')),
      )
      .post('/waren', auth, warenVerwalten, zValidator('json', wareSchema), async (c) => {
        const id = await deps.waren.wareAnlegen(c.req.valid('json')).catch(warenFehler);
        return c.json({ id }, 201);
      })
      .get('/waren/:id', auth, warenLesen, async (c) =>
        c.json(gefunden(await deps.waren.wareHolen(c.req.param('id')), 'Ware nicht gefunden')),
      )
      .put('/waren/:id', auth, warenVerwalten, zValidator('json', wareSchema), async (c) => {
        gefunden(
          await deps.waren
            .wareAktualisieren(c.req.param('id'), c.req.valid('json'))
            .catch(warenFehler),
          'Ware nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .delete('/waren/:id', auth, warenVerwalten, async (c) => {
        gefunden(
          await deps.waren.wareLoeschen(c.req.param('id')).catch(warenFehler),
          'Ware nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/waren/:id/archiv',
        auth,
        warenVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.waren.wareArchivieren(c.req.param('id'), archiviert),
            'Ware nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      .get('/waren/:id/bestand', auth, warenLesen, async (c) =>
        c.json(gefunden(await deps.waren.wareBestand(c.req.param('id')), 'Ware nicht gefunden')),
      )
      .get('/waren/:id/verlauf', auth, warenLesen, async (c) =>
        c.json(gefunden(await deps.waren.wareVerlauf(c.req.param('id')), 'Ware nicht gefunden')),
      )
      .get('/waren/:id/vorgaenge', auth, warenLesen, async (c) =>
        c.json(gefunden(await deps.waren.wareVorgaenge(c.req.param('id')), 'Ware nicht gefunden')),
      )
      // ----- Bestand
      .post(
        '/bestand/einlagerung',
        auth,
        bestandBuchen,
        zValidator('json', einlagerungSchema),
        async (c) => {
          const id = await deps.waren
            .einlagern(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .post(
        '/bestand/entnahme',
        auth,
        bestandBuchen,
        zValidator('json', entnahmeSchema),
        async (c) => {
          const id = await deps.waren
            .entnehmen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .post(
        '/bestand/einlagerungen',
        auth,
        bestandBuchen,
        zValidator('json', einlagerungenSchema),
        async (c) => {
          const id = await deps.waren
            .einlagerungen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .post(
        '/bestand/entnahmen',
        auth,
        bestandBuchen,
        zValidator('json', entnahmenSchema),
        async (c) => {
          const ids = await deps.waren
            .entnahmen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json(ids, 201);
        },
      )
      .post(
        '/bestand/umlagerungen',
        auth,
        bestandBuchen,
        zValidator('json', umlagerungenSchema),
        async (c) => {
          const id = await deps.waren
            .umlagerungen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .delete('/bestand/vorgaenge/:id', auth, bestandBuchen, async (c) => {
        gefunden(await deps.waren.vorgangLoeschen(c.req.param('id')), 'Vorgang nicht gefunden');
        return c.json({ ok: true });
      })
      // ----- Inventur
      .get('/inventuren', auth, warenLesen, async (c) => {
        const status = c.req.query('status');
        if (status !== undefined && status !== 'offen' && status !== 'abgeschlossen') {
          throw new HTTPException(400, { message: 'Ungültiger Status' });
        }
        return c.json(await deps.waren.inventuren(status));
      })
      .post(
        '/inventuren',
        auth,
        bestandBuchen,
        zValidator('json', inventurStartenSchema),
        async (c) => {
          const id = await deps.waren
            .inventurStarten(c.req.valid('json').lagerortId, c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .get('/inventuren/:id', auth, warenLesen, async (c) =>
        c.json(
          gefunden(await deps.waren.inventurHolen(c.req.param('id')), 'Inventur nicht gefunden'),
        ),
      )
      .put(
        '/inventuren/:id/knoten/:lid',
        auth,
        bestandBuchen,
        zValidator('json', inventurZaehlungSchema),
        async (c) => {
          const { zaehlungen, inListeAufnehmen } = c.req.valid('json');
          gefunden(
            await deps.waren
              .inventurKnotenSpeichern(
                c.req.param('id'),
                c.req.param('lid'),
                zaehlungen,
                inListeAufnehmen,
              )
              .catch(warenFehler),
            'Inventur nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get(
        '/inventuren/:id/zusammenfassung',
        auth,
        warenLesen,
        zValidator('query', inventurAbschlussSchema.partial()),
        async (c) =>
          c.json(
            gefunden(
              await deps.waren
                .inventurZusammenfassung(c.req.param('id'), c.req.valid('query').zeitpunkt)
                .catch(warenFehler),
              'Inventur nicht gefunden',
            ),
          ),
      )
      .post(
        '/inventuren/:id/abschluss',
        auth,
        bestandBuchen,
        zValidator('json', inventurAbschlussSchema),
        async (c) => {
          const vorgangId = gefunden(
            await deps.waren
              .inventurAbschliessen(
                c.req.param('id'),
                c.req.valid('json').zeitpunkt,
                c.get('user').sub,
              )
              .catch(warenFehler),
            'Inventur nicht gefunden',
          );
          return c.json({ vorgangId });
        },
      )
      .delete('/inventuren/:id', auth, bestandBuchen, async (c) => {
        gefunden(
          await deps.waren.inventurVerwerfen(c.req.param('id')).catch(warenFehler),
          'Inventur nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .onError((err, c) => {
        if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
        console.error(err);
        return c.json({ error: 'Internal server error' }, 500);
      })
  );
}
export type AppType = ReturnType<typeof createApp>;
