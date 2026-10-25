import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createUserSchema,
  dienstEintragenSchema,
  dienstformEingabeSchema,
  eventEingabeSchema,
  eventKategorieEingabeSchema,
  externeEingabeSchema,
  externeZusammenfuehrenSchema,
  kalenderZeitraumSchema,
  statistikJahrSchema,
  vorlageEingabeSchema,
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
  ausleiheAendernSchema,
  ausleiheSchema,
  gebindeSchema,
  gegenstandPlaetzeSchema,
  aufraeumFertigSchema,
  bewegungSchema,
  gegenstandAnlegenSchema,
  gegenstandSchema,
  ifcoAnlegenSchema,
  ifcoInhaltSchema,
  ifcoPlatzSchema,
  ifcoSchema,
  kategorieSchema,
  rueckgabeSchema,
  inventurAbschlussSchema,
  inventurStartenSchema,
  inventurZaehlungSchema,
  boedenHinzufuegenSchema,
  ifcoTypSchema,
  lagerortAnlegenSchema,
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
  type DienstPerson,
  type EventDto,
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
import {
  EntfernungBestaetigen,
  KalenderKonflikt,
  KalenderUngueltig,
  type BetroffenerDienst,
  type KalenderStore,
} from './kalender';
import { WarenKonflikt, WarenUngueltig, type WarenStore } from './waren';
import type { AufraeumDetails, InventarStore } from './inventar';
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
  inventar: InventarStore;
  kalender: KalenderStore;
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
  const inventarLesen = requirePermission('inventar:lesen');
  const inventarUmraeumen = requirePermission('inventar:umraeumen');
  const inventarVerwalten = requirePermission('inventar:verwalten');
  const kalenderLesen = requirePermission('kalender:lesen');
  const eventsVerwalten = requirePermission('events:verwalten');
  const kalenderEinrichten = requirePermission('kalender:einrichten');

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

  /** Adds the Cognito username to the organiser of each Ausleihe (the store only knows the profile row). */
  const mitUsernames = async <
    T extends { organisator: { sub: string; username: string | null } | null },
  >(
    liste: T[],
  ): Promise<T[]> => {
    if (!liste.some((a) => a.organisator)) return liste;
    const konten = await deps.userAdmin.konten();
    return liste.map((a) =>
      a.organisator
        ? {
            ...a,
            organisator: {
              ...a.organisator,
              username: konten.get(a.organisator.sub)?.username ?? null,
            },
          }
        : a,
    );
  };

  /** Adds the Cognito usernames to the members of the running Aufräumaktion. */
  const aufraeumenMitUsernames = async (a: AufraeumDetails | null) => {
    if (!a) return null;
    const konten = await deps.userAdmin.konten();
    const mit = <T extends { sub: string } | null>(o: T): T =>
      o && { ...o, username: konten.get(o.sub)?.username ?? null };
    return {
      ...a,
      gestartetVon: mit(a.gestartetVon),
      fertig: a.fertig.map((f) => ({ ...f, von: mit(f.von) })),
    };
  };

  /** Adds the Cognito username to the `ersteller` of Vorgänge/Inventuren (the store only knows the profile row). */
  const mitErstellerUsernames = async <
    T extends { ersteller: { sub: string; username: string | null } | null },
  >(
    liste: T[],
  ): Promise<T[]> => {
    if (!liste.some((e) => e.ersteller)) return liste;
    const konten = await deps.userAdmin.konten();
    return liste.map((e) =>
      e.ersteller
        ? {
            ...e,
            ersteller: {
              ...e.ersteller,
              username: konten.get(e.ersteller.sub)?.username ?? null,
            },
          }
        : e,
    );
  };

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

  /** Maps the Kalender store's domain errors to 400 (invalid) and 409 (conflict). */
  const kalenderFehler = (err: unknown): never => {
    if (err instanceof KalenderUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof KalenderKonflikt) throw new HTTPException(409, { message: err.message });
    throw err;
  };

  /** Adds the Cognito usernames to members in Kalender DTOs (the store only knows the profile row). */
  const personenMitUsernames = async <T extends { person: DienstPerson }>(
    liste: T[],
  ): Promise<T[]> => {
    if (!liste.some((e) => e.person.art === 'mitglied')) return liste;
    const konten = await deps.userAdmin.konten();
    return liste.map((e) =>
      e.person.art === 'mitglied'
        ? { ...e, person: { ...e.person, username: konten.get(e.person.sub)?.username ?? null } }
        : e,
    );
  };

  const eventsMitUsernames = async (liste: EventDto[]): Promise<EventDto[]> => {
    const alle = liste.flatMap((e) => e.schichten.flatMap((s) => s.dienste));
    if (!alle.some((d) => d.person.art === 'mitglied')) return liste;
    const konten = await deps.userAdmin.konten();
    return liste.map((e) => ({
      ...e,
      schichten: e.schichten.map((s) => ({
        ...s,
        dienste: s.dienste.map((d) =>
          d.person.art === 'mitglied'
            ? {
                ...d,
                person: { ...d.person, username: konten.get(d.person.sub)?.username ?? null },
              }
            : d,
        ),
      })),
    }));
  };

  /** Dienste and Externe reference the entering member's profile row. */
  const eigenesProfilMussExistieren = async (sub: string) => {
    if (!(await deps.mitglieder.holen(sub))) {
      throw new HTTPException(400, { message: 'Bitte lege zuerst dein Profil an.' });
    }
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
      .get('/lagerorte/warenlisten', auth, warenLesen, async (c) =>
        c.json(await deps.waren.lagerortWarenlisten()),
      )
      .post(
        '/lagerorte',
        auth,
        warenVerwalten,
        zValidator('json', lagerortAnlegenSchema),
        async (c) => {
          const { boeden, boedenIfcoPlatz, ...daten } = c.req.valid('json');
          const angelegt = await deps.waren
            .lagerortAnlegen(daten, boeden, boedenIfcoPlatz)
            .catch(warenFehler);
          return c.json(angelegt, 201);
        },
      )
      .post(
        '/lagerorte/:id/boeden',
        auth,
        warenVerwalten,
        zValidator('json', boedenHinzufuegenSchema),
        async (c) => {
          const boedenIds = gefunden(
            await deps.waren
              .boedenHinzufuegen(
                c.req.param('id'),
                c.req.valid('json').namen,
                c.req.valid('json').ifcoPlatz,
              )
              .catch(warenFehler),
            'Lagerort nicht gefunden',
          );
          return c.json({ boedenIds }, 201);
        },
      )
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
        c.json(
          await mitErstellerUsernames(
            gefunden(await deps.waren.wareVorgaenge(c.req.param('id')), 'Ware nicht gefunden'),
          ),
        ),
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
        return c.json(await mitErstellerUsernames(await deps.waren.inventuren(status)));
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
      .get('/inventuren/:id', auth, warenLesen, async (c) => {
        const inventur = gefunden(
          await deps.waren.inventurHolen(c.req.param('id')),
          'Inventur nicht gefunden',
        );
        return c.json((await mitErstellerUsernames([inventur]))[0]!);
      })
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
      // ----- Inventar: Kategorien
      .get('/inventar/kategorien', auth, inventarLesen, async (c) =>
        c.json(await deps.inventar.kategorien(c.req.query('archiv') === '1')),
      )
      .post(
        '/inventar/kategorien',
        auth,
        inventarVerwalten,
        zValidator('json', kategorieSchema),
        async (c) => {
          const id = await deps.inventar.kategorieAnlegen(c.req.valid('json')).catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/inventar/kategorien/:id',
        auth,
        inventarVerwalten,
        zValidator('json', kategorieSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .kategorieAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Kategorie nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/kategorien/:id', auth, inventarVerwalten, async (c) => {
        gefunden(
          await deps.inventar.kategorieLoeschen(c.req.param('id')).catch(warenFehler),
          'Kategorie nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/kategorien/:id/archiv',
        auth,
        inventarVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .kategorieArchivieren(c.req.param('id'), archiviert)
              .catch(warenFehler),
            'Kategorie nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // ----- Inventar: Gegenstände
      .get('/inventar/gegenstaende', auth, inventarLesen, async (c) =>
        c.json(await deps.inventar.gegenstaende(c.req.query('archiv') === '1')),
      )
      .get('/inventar/gegenstaende/:id', auth, inventarLesen, async (c) =>
        c.json(
          gefunden(
            await deps.inventar.gegenstandHolen(c.req.param('id')),
            'Gegenstand nicht gefunden',
          ),
        ),
      )
      .post(
        '/inventar/gegenstaende',
        auth,
        inventarVerwalten,
        zValidator('json', gegenstandAnlegenSchema),
        async (c) => {
          const id = await deps.inventar
            .gegenstandAnlegen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/inventar/gegenstaende/:id',
        auth,
        inventarVerwalten,
        zValidator('json', gegenstandSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .gegenstandAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Gegenstand nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/gegenstaende/:id', auth, inventarVerwalten, async (c) => {
        gefunden(
          await deps.inventar.gegenstandLoeschen(c.req.param('id')).catch(warenFehler),
          'Gegenstand nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/gegenstaende/:id/archiv',
        auth,
        inventarVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .gegenstandArchivieren(c.req.param('id'), archiviert)
              .catch(warenFehler),
            'Gegenstand nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      .put(
        '/inventar/gegenstaende/:id/plaetze',
        auth,
        inventarUmraeumen,
        zValidator('json', gegenstandPlaetzeSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .gegenstandPlaetzeSetzen(
                c.req.param('id'),
                c.req.valid('json').plaetze,
                c.req.valid('json').verbaut,
              )
              .catch(warenFehler),
            'Gegenstand nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Inventar: Zugänge und Abgänge
      .get('/inventar/gegenstaende/:id/bewegungen', auth, inventarLesen, async (c) =>
        c.json(
          await mitErstellerUsernames(
            gefunden(
              await deps.inventar.bewegungen(c.req.param('id')),
              'Gegenstand nicht gefunden',
            ),
          ),
        ),
      )
      .post(
        '/inventar/gegenstaende/:id/bewegungen',
        auth,
        inventarVerwalten,
        zValidator('json', bewegungSchema),
        async (c) => {
          const id = gefunden(
            await deps.inventar
              .bewegungBuchen(c.req.param('id'), c.req.valid('json'), c.get('user').sub)
              .catch(warenFehler),
            'Gegenstand nicht gefunden',
          );
          return c.json({ id }, 201);
        },
      )
      .delete(
        '/inventar/gegenstaende/:id/bewegungen/:bewegungId',
        auth,
        inventarVerwalten,
        async (c) => {
          gefunden(
            await deps.inventar
              .bewegungLoeschen(c.req.param('id'), c.req.param('bewegungId'))
              .catch(warenFehler),
            'Buchung nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Inventar: IFCO-Typen
      .get('/inventar/ifco-typen', auth, inventarLesen, async (c) =>
        c.json(await deps.inventar.ifcoTypen(c.req.query('archiv') === '1')),
      )
      .post(
        '/inventar/ifco-typen',
        auth,
        inventarVerwalten,
        zValidator('json', ifcoTypSchema),
        async (c) => {
          const id = await deps.inventar.ifcoTypAnlegen(c.req.valid('json')).catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/inventar/ifco-typen/:id',
        auth,
        inventarVerwalten,
        zValidator('json', ifcoTypSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ifcoTypAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'IFCO-Typ nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/ifco-typen/:id', auth, inventarVerwalten, async (c) => {
        gefunden(
          await deps.inventar.ifcoTypLoeschen(c.req.param('id')).catch(warenFehler),
          'IFCO-Typ nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/ifco-typen/:id/archiv',
        auth,
        inventarVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .ifcoTypArchivieren(c.req.param('id'), archiviert)
              .catch(warenFehler),
            'IFCO-Typ nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      // ----- Inventar: IFCOs
      .get('/inventar/ifcos', auth, inventarLesen, async (c) =>
        c.json(await deps.inventar.ifcos(c.req.query('archiv') === '1')),
      )
      .get('/inventar/ifcos/:id', auth, inventarLesen, async (c) =>
        c.json(gefunden(await deps.inventar.ifcoHolen(c.req.param('id')), 'IFCO nicht gefunden')),
      )
      .post(
        '/inventar/ifcos',
        auth,
        inventarVerwalten,
        zValidator('json', ifcoAnlegenSchema),
        async (c) => {
          const id = await deps.inventar.ifcoAnlegen(c.req.valid('json')).catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/inventar/ifcos/:id',
        auth,
        inventarVerwalten,
        zValidator('json', ifcoSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ifcoAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/ifcos/:id', auth, inventarVerwalten, async (c) => {
        gefunden(
          await deps.inventar.ifcoLoeschen(c.req.param('id')).catch(warenFehler),
          'IFCO nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/ifcos/:id/archiv',
        auth,
        inventarVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.inventar.ifcoArchivieren(c.req.param('id'), archiviert).catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      .put(
        '/inventar/ifcos/:id/platz',
        auth,
        inventarUmraeumen,
        zValidator('json', ifcoPlatzSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ifcoPlatzSetzen(c.req.param('id'), c.req.valid('json').lagerortId)
              .catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .put(
        '/inventar/ifcos/:id/inhalt',
        auth,
        inventarUmraeumen,
        zValidator('json', ifcoInhaltSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ifcoInhaltSetzen(c.req.param('id'), c.req.valid('json').positionen)
              .catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Inventar: Aufräumen
      .get('/inventar/aufraeumen', auth, inventarLesen, async (c) =>
        c.json({ aktion: await aufraeumenMitUsernames(await deps.inventar.aufraeumen()) }),
      )
      .post('/inventar/aufraeumen', auth, inventarUmraeumen, async (c) => {
        const id = await deps.inventar.aufraeumenStarten(c.get('user').sub).catch(warenFehler);
        return c.json({ id }, 201);
      })
      .post('/inventar/aufraeumen/beenden', auth, inventarUmraeumen, async (c) => {
        gefunden(
          await deps.inventar.aufraeumenBeenden(c.get('user').sub),
          'Es läuft keine Aufräumaktion',
        );
        return c.json({ ok: true });
      })
      .put(
        '/inventar/aufraeumen/ifcos/:id',
        auth,
        inventarUmraeumen,
        zValidator('json', aufraeumFertigSchema),
        async (c) => {
          const { fertig } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .aufraeumIfcoSetzen(c.req.param('id'), fertig, c.get('user').sub)
              .catch(warenFehler),
            'IFCO nicht gefunden',
          );
          return c.json({ fertig });
        },
      )
      // ----- Inventar: Ausleihen
      .get('/inventar/ausleihen', auth, inventarLesen, async (c) =>
        c.json(
          await mitUsernames(await deps.inventar.ausleihen(c.req.query('status') === 'offen')),
        ),
      )
      .get('/inventar/ausleihen/:id', auth, inventarLesen, async (c) => {
        const ausleihe = gefunden(
          await deps.inventar.ausleiheHolen(c.req.param('id')),
          'Ausleihe nicht gefunden',
        );
        return c.json((await mitUsernames([ausleihe]))[0]!);
      })
      .post(
        '/inventar/ausleihen',
        auth,
        inventarUmraeumen,
        zValidator('json', ausleiheSchema),
        async (c) => {
          const id = await deps.inventar
            .ausleiheAnlegen(c.req.valid('json'), c.get('user').sub)
            .catch(warenFehler);
          return c.json({ id }, 201);
        },
      )
      .post(
        '/inventar/ausleihen/:id/rueckgabe',
        auth,
        inventarUmraeumen,
        zValidator('json', rueckgabeSchema),
        async (c) => {
          const { positionIds, zurueckAm } = c.req.valid('json');
          gefunden(
            await deps.inventar
              .ausleiheRueckgabe(c.req.param('id'), positionIds, zurueckAm)
              .catch(warenFehler),
            'Ausleihe nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .put(
        '/inventar/ausleihen/:id',
        auth,
        inventarUmraeumen,
        zValidator('json', ausleiheAendernSchema),
        async (c) => {
          gefunden(
            await deps.inventar
              .ausleiheAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(warenFehler),
            'Ausleihe nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/inventar/ausleihen/:id', auth, inventarUmraeumen, async (c) => {
        gefunden(
          await deps.inventar.ausleiheLoeschen(c.req.param('id')).catch(warenFehler),
          'Ausleihe nicht gefunden',
        );
        return c.json({ ok: true });
      })
      // ----- Kalender: Events
      .get(
        '/kalender/events',
        auth,
        kalenderLesen,
        zValidator('query', kalenderZeitraumSchema),
        async (c) => {
          const { von, bis } = c.req.valid('query');
          if (von > bis) throw new HTTPException(400, { message: 'Ungültiger Zeitraum' });
          return c.json(await eventsMitUsernames(await deps.kalender.events(von, bis)));
        },
      )
      .get('/kalender/events/:id', auth, kalenderLesen, async (c) => {
        const event = gefunden(
          await deps.kalender.event(c.req.param('id')),
          'Event nicht gefunden',
        );
        return c.json((await eventsMitUsernames([event]))[0]!);
      })
      .post(
        '/kalender/events',
        auth,
        eventsVerwalten,
        zValidator('json', eventEingabeSchema),
        async (c) => {
          const id = await deps.kalender
            .eventAnlegen(c.req.valid('json'), c.get('user').sub)
            .catch(kalenderFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/kalender/events/:id',
        auth,
        eventsVerwalten,
        zValidator('json', eventEingabeSchema),
        async (c) => {
          try {
            gefunden(
              await deps.kalender.eventAktualisieren(c.req.param('id'), c.req.valid('json')),
              'Event nicht gefunden',
            );
          } catch (err) {
            if (err instanceof EntfernungBestaetigen) {
              const betroffene: BetroffenerDienst[] = await personenMitUsernames(err.betroffene);
              return c.json({ error: err.message, betroffene }, 409);
            }
            return kalenderFehler(err);
          }
          return c.json({ ok: true });
        },
      )
      .put(
        '/kalender/events/:id/absage',
        auth,
        eventsVerwalten,
        zValidator('json', z.object({ abgesagt: z.boolean() })),
        async (c) => {
          const { abgesagt } = c.req.valid('json');
          gefunden(
            await deps.kalender.absageSetzen(c.req.param('id'), abgesagt),
            'Event nicht gefunden',
          );
          return c.json({ abgesagt });
        },
      )
      .delete('/kalender/events/:id', auth, eventsVerwalten, async (c) => {
        gefunden(
          await deps.kalender.eventLoeschen(c.req.param('id')).catch(kalenderFehler),
          'Event nicht gefunden',
        );
        return c.json({ ok: true });
      })
      // ----- Kalender: Dienste
      .post(
        '/kalender/schichten/:id/dienste',
        auth,
        kalenderLesen,
        zValidator('json', dienstEintragenSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const sub = c.get('user').sub;
          if (daten.mitgliedSub !== undefined && daten.mitgliedSub !== sub) {
            if (!c.get('permissions').includes('events:verwalten')) {
              throw new HTTPException(403, {
                message: 'Du darfst keine anderen Mitglieder eintragen.',
              });
            }
            await mitgliedMussExistieren(daten.mitgliedSub);
          }
          await eigenesProfilMussExistieren(sub);
          const id = gefunden(
            await deps.kalender
              .dienstEintragen(c.req.param('id'), daten, sub)
              .catch(kalenderFehler),
            'Schicht nicht gefunden',
          );
          return c.json({ id }, 201);
        },
      )
      .delete('/kalender/dienste/:id', auth, kalenderLesen, async (c) => {
        const dienst = gefunden(
          await deps.kalender.dienstHolen(c.req.param('id')),
          'Dienst nicht gefunden',
        );
        const sub = c.get('user').sub;
        const erlaubt =
          c.get('permissions').includes('events:verwalten') ||
          dienst.mitgliedSub === sub ||
          (dienst.externId !== null && dienst.eingetragenVon === sub);
        if (!erlaubt) {
          throw new HTTPException(403, { message: 'Du darfst diesen Dienst nicht entfernen.' });
        }
        gefunden(await deps.kalender.dienstEntfernen(dienst.id), 'Dienst nicht gefunden');
        return c.json({ ok: true });
      })
      // ----- Kalender: Externe
      .get('/kalender/externe', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.externe(c.req.query('archiv') === '1')),
      )
      .post(
        '/kalender/externe',
        auth,
        kalenderLesen,
        zValidator('json', externeEingabeSchema),
        async (c) => {
          const sub = c.get('user').sub;
          await eigenesProfilMussExistieren(sub);
          const id = await deps.kalender.externAnlegen(
            { ...c.req.valid('json'), archiviert: false },
            sub,
          );
          return c.json({ id }, 201);
        },
      )
      .post(
        '/kalender/externe/zusammenfuehren',
        auth,
        kalenderEinrichten,
        zValidator('json', externeZusammenfuehrenSchema),
        async (c) => {
          const { zielId, quelleIds } = c.req.valid('json');
          const ergebnis = gefunden(
            await deps.kalender.externeZusammenfuehren(zielId, quelleIds).catch(kalenderFehler),
            'Ziel nicht gefunden',
          );
          return c.json(ergebnis);
        },
      )
      .put(
        '/kalender/externe/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', externeEingabeSchema),
        async (c) => {
          gefunden(
            await deps.kalender.externAktualisieren(c.req.param('id'), c.req.valid('json')),
            'Person nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      // ----- Kalender: Dienstformen, Kategorien, Vorlagen
      .get('/kalender/dienstformen', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.dienstformen(c.req.query('archiv') === '1')),
      )
      .post(
        '/kalender/dienstformen',
        auth,
        kalenderEinrichten,
        zValidator('json', dienstformEingabeSchema),
        async (c) =>
          c.json({ id: await deps.kalender.dienstformAnlegen(c.req.valid('json')) }, 201),
      )
      .put(
        '/kalender/dienstformen/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', dienstformEingabeSchema),
        async (c) => {
          gefunden(
            await deps.kalender.dienstformAktualisieren(c.req.param('id'), c.req.valid('json')),
            'Dienstform nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get('/kalender/kategorien', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.kategorien(c.req.query('archiv') === '1')),
      )
      .post(
        '/kalender/kategorien',
        auth,
        kalenderEinrichten,
        zValidator('json', eventKategorieEingabeSchema),
        async (c) => c.json({ id: await deps.kalender.kategorieAnlegen(c.req.valid('json')) }, 201),
      )
      .put(
        '/kalender/kategorien/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', eventKategorieEingabeSchema),
        async (c) => {
          gefunden(
            await deps.kalender.kategorieAktualisieren(c.req.param('id'), c.req.valid('json')),
            'Kategorie nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get('/kalender/vorlagen', auth, kalenderLesen, async (c) =>
        c.json(await deps.kalender.vorlagen(c.req.query('archiv') === '1')),
      )
      .post(
        '/kalender/vorlagen',
        auth,
        kalenderEinrichten,
        zValidator('json', vorlageEingabeSchema),
        async (c) => {
          const id = await deps.kalender.vorlageAnlegen(c.req.valid('json')).catch(kalenderFehler);
          return c.json({ id }, 201);
        },
      )
      .put(
        '/kalender/vorlagen/:id',
        auth,
        kalenderEinrichten,
        zValidator('json', vorlageEingabeSchema),
        async (c) => {
          gefunden(
            await deps.kalender
              .vorlageAktualisieren(c.req.param('id'), c.req.valid('json'))
              .catch(kalenderFehler),
            'Vorlage nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .delete('/kalender/vorlagen/:id', auth, kalenderEinrichten, async (c) => {
        gefunden(await deps.kalender.vorlageLoeschen(c.req.param('id')), 'Vorlage nicht gefunden');
        return c.json({ ok: true });
      })
      // ----- Kalender: Statistik
      .get(
        '/kalender/statistik',
        auth,
        kalenderLesen,
        zValidator('query', statistikJahrSchema),
        async (c) => {
          const { jahr } = c.req.valid('query');
          const zeilen = await deps.kalender.statistik(jahr);
          return c.json({ jahr, zeilen: await personenMitUsernames(zeilen) });
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
