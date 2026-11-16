import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  heuteBerlin,
  tagNachher,
  postenArchivierenSchema,
  schluesselAnlegenSchema,
  schluesselEingabeSchema,
  uebergabeSchema,
  anfrageAnlegenSchema,
  antwortSchema,
  planungSchema,
  type AnfrageDto,
  type MitgliedRefDto,
  type PlanungDto,
  type Halter,
  type HalterDto,
  type SchluesselDetailDto,
  type SchluesselDto,
} from '@c4/shared';
import { bestEffort } from '../benachrichtigungen';
import { UebergabeKonflikt, type SchluesselDaten } from '../schluessel';
import {
  antwortBerechtigte,
  erwarteteHalterJeSchluessel,
  ladeAnfrageKontext,
  meldeAnfrage,
  meldeAntwort,
  meldeGegenvorschlagAngenommen,
  meldePlanung,
  meldeUebergabe,
  type AnfrageKontext,
} from '../schluesselBenachrichtigungen';
import {
  AnfrageKonflikt,
  type AnfrageMitAntworten,
  type PlanungDaten,
} from '../schluesselAnfragen';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const schluesselRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    schluesselLesen,
    schluesselVerwalten,
    eigenesProfilMussExistieren,
    gefunden,
    mitgliedMussExistieren,
  } = ctx;

  const schluesselFehler = (err: unknown): never => {
    if (err instanceof AnfrageKonflikt) {
      throw new HTTPException(409, {
        message: 'Die Anfrage ist schon vergeben oder zurückgezogen.',
      });
    }
    if (err instanceof UebergabeKonflikt) {
      throw new HTTPException(409, {
        message: 'Der Schlüssel wurde inzwischen anders eingetragen. Lade die Seite neu.',
      });
    }
    throw err;
  };

  /** Display data of key holders and the names used in the Übergabe messages. */
  const schluesselMitglieder = async () => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const zeilen = new Map(rows.map((r) => [r.sub, r]));
    const halter = (h: Halter): HalterDto => {
      if (h?.art !== 'mitglied') return h;
      const zeile = zeilen.get(h.sub);
      return {
        art: 'mitglied',
        sub: h.sub,
        username: konten.get(h.sub)?.username ?? null,
        vorname: zeile?.vorname ?? '',
        nachname: zeile?.nachname ?? '',
        status: zeile?.status ?? 'anwaerter',
        anrede: zeile?.anrede ?? 'neutral',
      };
    };
    const name = (sub: string) => {
      const zeile = zeilen.get(sub);
      return (
        konten.get(sub)?.username ??
        (`${zeile?.vorname ?? ''} ${zeile?.nachname ?? ''}`.trim() || 'Jemand')
      );
    };
    return { halter, name };
  };

  type SchluesselMitglieder = Awaited<ReturnType<typeof schluesselMitglieder>>;

  const mitgliedRef = (m: SchluesselMitglieder, sub: string) =>
    m.halter({ art: 'mitglied', sub }) as MitgliedRefDto;

  const alsPlanungDto = (p: PlanungDaten, m: SchluesselMitglieder): PlanungDto => ({
    id: p.id,
    schluesselId: p.schluesselId,
    an: mitgliedRef(m, p.anSub),
    zeitfenster: { datum: p.datum, ab: p.ab, bis: p.bis, notiz: p.notiz },
    anfrageId: p.anfrageId,
    erstelltVon: mitgliedRef(m, p.erstelltVon),
  });

  /** Planned handovers per key, in time order. */
  const planungenJeSchluessel = async (m: SchluesselMitglieder) => {
    const gruppen = new Map<string, PlanungDto[]>();
    for (const p of await deps.schluesselAnfragen.planungen()) {
      const liste = gruppen.get(p.schluesselId) ?? [];
      liste.push(alsPlanungDto(p, m));
      gruppen.set(p.schluesselId, liste);
    }
    return gruppen;
  };

  const alsSchluesselDto = (
    s: SchluesselDaten,
    halter: (h: Halter) => HalterDto,
    planungen: PlanungDto[] = [],
  ): SchluesselDto => ({
    id: s.id,
    name: s.name,
    beschreibung: s.beschreibung,
    archiviert: s.archiviert,
    halter: halter(s.halter),
    halterSeit: s.halterSeit?.toISOString() ?? null,
    planungen,
  });

  const anfrageKontext = () =>
    ladeAnfrageKontext({
      schluessel: deps.schluessel,
      anfragen: deps.schluesselAnfragen,
      mitglieder: deps.mitglieder,
    });

  const alsAnfrageDto = (
    a: AnfrageMitAntworten,
    m: SchluesselMitglieder,
    schluesselNamen: Map<string, string>,
    ich: string,
    kontext: AnfrageKontext,
    heute: string,
  ): AnfrageDto => {
    const schluessel = (id: string | null) =>
      id && schluesselNamen.has(id) ? { id, name: schluesselNamen.get(id)! } : null;
    const abgelaufen = a.status === 'offen' && a.datum < heute;
    return {
      id: a.id,
      art: a.art,
      ersteller: mitgliedRef(m, a.erstellerSub),
      schluessel: schluessel(a.schluesselId),
      zeitfenster: { datum: a.datum, ab: a.ab, bis: a.bis, notiz: a.notiz },
      status: abgelaufen ? 'abgelaufen' : a.status,
      erstellt: a.erstellt.toISOString(),
      antworten: a.antworten.map((w) => ({
        id: w.id,
        mitglied: mitgliedRef(m, w.sub),
        art: w.art,
        zeitfenster: w.datum ? { datum: w.datum, ab: w.ab, bis: w.bis, notiz: w.notiz } : null,
        schluessel: schluessel(w.schluesselId),
        notiz: w.notiz,
        erstellt: w.erstellt.toISOString(),
      })),
      darfAntworten:
        a.status === 'offen' && !abgelaufen && antwortBerechtigte(a, kontext).includes(ich),
    };
  };

  /** Everything the Anfrage routes need in one go. */
  const anfrageAnsicht = async () => {
    const [m, keys, kontext] = await Promise.all([
      schluesselMitglieder(),
      deps.schluessel.alle(true),
      anfrageKontext(),
    ]);
    return { m, keys, namen: new Map(keys.map((k) => [k.id, k.name])), kontext };
  };

  // ----- Privatpartys: helpers (see docs/privatpartys.md)

  return (
    new Hono<AuthEnv>()
      .get('/schluessel', auth, schluesselLesen, async (c) => {
        const mitArchiv = c.req.query('archiv') === '1';
        if (mitArchiv && !c.get('permissions').includes('schluessel:verwalten')) {
          throw new HTTPException(403, { message: 'Forbidden' });
        }
        const [liste, m] = await Promise.all([
          deps.schluessel.alle(mitArchiv),
          schluesselMitglieder(),
        ]);
        const planungen = await planungenJeSchluessel(m);
        return c.json(liste.map((s) => alsSchluesselDto(s, m.halter, planungen.get(s.id))));
      })
      // ----- Schlüssel: Anfragen (Bedarf / Abgabe), registered before `/schluessel/:id`
      .get('/schluessel/anfragen', auth, schluesselLesen, async (c) => {
        const ich = c.get('user').sub;
        const heute = heuteBerlin();
        const [alle, ansicht] = await Promise.all([
          deps.schluesselAnfragen.anfragen(),
          anfrageAnsicht(),
        ]);
        // Open and current requests of everybody, plus the viewer's own from the last days.
        // Withdrawn requests are never listed.
        const sichtbar = alle
          .filter(
            (a) =>
              a.status !== 'zurueckgezogen' &&
              ((a.status === 'offen' && a.datum >= heute) ||
                (a.erstellerSub === ich && a.datum >= tagNachher(heute, -3))),
          )
          .sort((a, b) => a.datum.localeCompare(b.datum) || (a.ab ?? '').localeCompare(b.ab ?? ''));
        return c.json(
          sichtbar.map((a) =>
            alsAnfrageDto(a, ansicht.m, ansicht.namen, ich, ansicht.kontext, heute),
          ),
        );
      })
      .get('/schluessel/anfragen/:id', auth, schluesselLesen, async (c) => {
        const a = gefunden(
          await deps.schluesselAnfragen.anfrage(c.req.param('id')),
          'Anfrage nicht gefunden',
        );
        const ansicht = await anfrageAnsicht();
        return c.json(
          alsAnfrageDto(
            a,
            ansicht.m,
            ansicht.namen,
            c.get('user').sub,
            ansicht.kontext,
            heuteBerlin(),
          ),
        );
      })
      .post(
        '/schluessel/anfragen',
        auth,
        schluesselLesen,
        zValidator('json', anfrageAnlegenSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const ich = c.get('user').sub;
          await eigenesProfilMussExistieren(ich);
          let schluesselName: string | null = null;
          if (daten.schluesselId) {
            const s = await deps.schluessel.holen(daten.schluesselId);
            if (!s || s.archiviert)
              throw new HTTPException(404, { message: 'Schlüssel nicht gefunden' });
            schluesselName = s.name;
            if (daten.art === 'abgabe') {
              const geplant = (await deps.schluesselAnfragen.planungen(s.id)).some(
                (p) => p.anSub === ich,
              );
              if (!(s.halter?.art === 'mitglied' && s.halter.sub === ich) && !geplant) {
                throw new HTTPException(409, {
                  message: 'Du kannst nur Schlüssel abgeben, die du hast oder bekommen sollst.',
                });
              }
            }
          }
          const id = await deps.schluesselAnfragen.anlegen({
            art: daten.art,
            erstellerSub: ich,
            schluesselId: daten.schluesselId,
            datum: daten.datum,
            ab: daten.ab,
            bis: daten.bis,
            notiz: daten.notiz,
          });
          await bestEffort(async () => {
            const [kontext, m] = await Promise.all([anfrageKontext(), schluesselMitglieder()]);
            await meldeAnfrage(deps.benachrichtigungen, {
              anfrage: { id, art: daten.art, datum: daten.datum, ab: daten.ab, bis: daten.bis },
              empfaenger: antwortBerechtigte(
                {
                  art: daten.art,
                  erstellerSub: ich,
                  schluesselId: daten.schluesselId,
                  datum: daten.datum,
                  ab: daten.ab,
                },
                kontext,
              ),
              ersteller: m.name(ich),
              schluesselName,
            });
          });
          return c.json({ id }, 201);
        },
      )
      .put('/schluessel/anfragen/:id/rueckzug', auth, schluesselLesen, async (c) => {
        const a = gefunden(
          await deps.schluesselAnfragen.anfrage(c.req.param('id')),
          'Anfrage nicht gefunden',
        );
        if (a.erstellerSub !== c.get('user').sub) {
          throw new HTTPException(403, {
            message: 'Nur wer die Anfrage gestellt hat, kann sie zurückziehen.',
          });
        }
        if (!(await deps.schluesselAnfragen.zurueckziehen(a.id))) {
          throw new HTTPException(409, {
            message: 'Die Anfrage ist schon vergeben oder zurückgezogen.',
          });
        }
        return c.json({ ok: true });
      })
      .put(
        '/schluessel/anfragen/:id/antwort',
        auth,
        schluesselLesen,
        zValidator('json', antwortSchema),
        async (c) => {
          const antwort = c.req.valid('json');
          const ich = c.get('user').sub;
          const a = gefunden(
            await deps.schluesselAnfragen.anfrage(c.req.param('id')),
            'Anfrage nicht gefunden',
          );
          if (a.erstellerSub === ich) {
            throw new HTTPException(403, {
              message: 'Du kannst nicht auf deine eigene Anfrage antworten.',
            });
          }
          if (a.status !== 'offen' || a.datum < heuteBerlin()) {
            throw new HTTPException(409, {
              message: 'Die Anfrage ist schon vergeben, zurückgezogen oder abgelaufen.',
            });
          }
          await eigenesProfilMussExistieren(ich);
          const kontext = await anfrageKontext();
          if (!antwortBerechtigte(a, kontext).includes(ich)) {
            throw new HTTPException(403, { message: 'Diese Anfrage ist nicht an dich gerichtet.' });
          }
          // The key a responder offers for a Bedarf of "irgendeiner": one they are expected to hold then.
          const schluesselId = a.schluesselId ?? antwort.schluesselId;
          if (a.art === 'bedarf' && !a.schluesselId && antwort.art !== 'ablehnung') {
            const eigene = new Set(
              [...erwarteteHalterJeSchluessel(a, kontext)]
                .filter(([, subs]) => subs.includes(ich))
                .map(([id]) => id),
            );
            if (!schluesselId || !eigene.has(schluesselId)) {
              throw new HTTPException(400, { message: 'Bitte wähle den Schlüssel, den du gibst.' });
            }
          }
          const zusage = antwort.art === 'zusage';
          gefunden(
            await deps.schluesselAnfragen
              .antwortSpeichern(
                a.id,
                {
                  sub: ich,
                  art: antwort.art,
                  datum: antwort.art === 'gegenvorschlag' ? antwort.datum : null,
                  ab: antwort.art === 'gegenvorschlag' ? antwort.ab : null,
                  bis: antwort.art === 'gegenvorschlag' ? antwort.bis : null,
                  notiz: antwort.notiz,
                  schluesselId: antwort.art === 'ablehnung' ? null : schluesselId,
                },
                zusage && schluesselId
                  ? {
                      schluesselId,
                      anSub: a.art === 'bedarf' ? a.erstellerSub : ich,
                      datum: a.datum,
                      ab: a.ab,
                      bis: a.bis,
                      notiz: a.notiz,
                      anfrageId: a.id,
                      erstelltVon: ich,
                    }
                  : null,
              )
              .catch(schluesselFehler),
            'Anfrage nicht gefunden',
          );
          await bestEffort(async () => {
            const m = await schluesselMitglieder();
            await meldeAntwort(deps.benachrichtigungen, {
              anfrageId: a.id,
              art: antwort.art,
              erstellerSub: a.erstellerSub,
              ersteller: m.name(a.erstellerSub),
              antwortender: { sub: ich, name: m.name(ich) },
              vorschlag:
                antwort.art === 'gegenvorschlag' && antwort.datum
                  ? { datum: antwort.datum, ab: antwort.ab, bis: antwort.bis }
                  : undefined,
              andereAntworter: a.antworten.map((x) => x.sub),
            });
          });
          return c.json({ ok: true });
        },
      )
      .post(
        '/schluessel/anfragen/:id/antworten/:antwortId/annehmen',
        auth,
        schluesselLesen,
        async (c) => {
          const ich = c.get('user').sub;
          const a = gefunden(
            await deps.schluesselAnfragen.anfrage(c.req.param('id')),
            'Anfrage nicht gefunden',
          );
          if (a.erstellerSub !== ich) {
            throw new HTTPException(403, {
              message: 'Nur wer die Anfrage gestellt hat, kann einen Vorschlag annehmen.',
            });
          }
          const w = gefunden(
            a.antworten.find(
              (x) => x.id === c.req.param('antwortId') && x.art === 'gegenvorschlag',
            ),
            'Vorschlag nicht gefunden',
          );
          const schluesselId = a.schluesselId ?? w.schluesselId;
          if (!w.datum || !schluesselId) {
            throw new HTTPException(409, { message: 'Der Vorschlag nennt keinen Schlüssel.' });
          }
          gefunden(
            await deps.schluesselAnfragen
              .gegenvorschlagAnnehmen(a.id, {
                schluesselId,
                anSub: a.art === 'bedarf' ? a.erstellerSub : w.sub,
                datum: w.datum,
                ab: w.ab,
                bis: w.bis,
                notiz: w.notiz ?? a.notiz,
                anfrageId: a.id,
                erstelltVon: ich,
              })
              .catch(schluesselFehler),
            'Anfrage nicht gefunden',
          );
          await bestEffort(async () => {
            const m = await schluesselMitglieder();
            await meldeGegenvorschlagAngenommen(deps.benachrichtigungen, {
              anfrageId: a.id,
              ersteller: m.name(ich),
              vorschlagSub: w.sub,
              andereAntworter: a.antworten.map((x) => x.sub),
            });
          });
          return c.json({ ok: true });
        },
      )
      // ----- Schlüssel: geplante Übergaben
      .post(
        '/schluessel/:id/planungen',
        auth,
        schluesselLesen,
        zValidator('json', planungSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const ich = c.get('user').sub;
          const s = await deps.schluessel.holen(c.req.param('id'));
          if (!s || s.archiviert)
            throw new HTTPException(404, { message: 'Schlüssel nicht gefunden' });
          await mitgliedMussExistieren(daten.anSub);
          if (s.halter?.art === 'mitglied' && s.halter.sub === daten.anSub) {
            throw new HTTPException(409, { message: 'Dieses Mitglied hat den Schlüssel schon.' });
          }
          const id = await deps.schluesselAnfragen.planungAnlegen({
            schluesselId: s.id,
            anSub: daten.anSub,
            datum: daten.datum,
            ab: daten.ab,
            bis: daten.bis,
            notiz: daten.notiz,
            anfrageId: null,
            erstelltVon: ich,
          });
          await bestEffort(async () =>
            meldePlanung(deps.benachrichtigungen, {
              schluessel: s,
              halter: s.halter,
              plaene: await deps.schluesselAnfragen.planungen(s.id),
              planungId: id,
              aktion: 'angelegt',
              zeitfenster: daten,
              akteur: ich,
              name: (await schluesselMitglieder()).name,
            }),
          );
          return c.json({ id }, 201);
        },
      )
      .put(
        '/schluessel/planungen/:id',
        auth,
        schluesselLesen,
        zValidator('json', planungSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const ich = c.get('user').sub;
          const p = gefunden(
            await deps.schluesselAnfragen.planung(c.req.param('id')),
            'Planung nicht gefunden',
          );
          const schluessel = await deps.schluessel.holen(p.schluesselId);
          if (!schluessel || schluessel.archiviert)
            throw new HTTPException(404, { message: 'Schlüssel nicht gefunden' });
          await mitgliedMussExistieren(daten.anSub);
          if (schluessel.halter?.art === 'mitglied' && schluessel.halter.sub === daten.anSub) {
            throw new HTTPException(409, { message: 'Dieses Mitglied hat den Schlüssel schon.' });
          }
          gefunden(
            await deps.schluesselAnfragen.planungAendern(p.id, daten),
            'Planung nicht gefunden',
          );
          await bestEffort(async () => {
            const s = await deps.schluessel.holen(p.schluesselId);
            if (!s) return;
            await meldePlanung(deps.benachrichtigungen, {
              schluessel: s,
              halter: s.halter,
              plaene: await deps.schluesselAnfragen.planungen(s.id),
              planungId: p.id,
              aktion: 'geaendert',
              zeitfenster: daten,
              akteur: ich,
              name: (await schluesselMitglieder()).name,
            });
          });
          return c.json({ ok: true });
        },
      )
      .delete('/schluessel/planungen/:id', auth, schluesselLesen, async (c) => {
        const ich = c.get('user').sub;
        const p = gefunden(
          await deps.schluesselAnfragen.planung(c.req.param('id')),
          'Planung nicht gefunden',
        );
        // The chain as it was, so the previous holder can still be told.
        const vorher = await deps.schluesselAnfragen.planungen(p.schluesselId);
        gefunden(await deps.schluesselAnfragen.planungLoeschen(p.id), 'Planung nicht gefunden');
        await bestEffort(async () => {
          const s = await deps.schluessel.holen(p.schluesselId);
          if (!s) return;
          await meldePlanung(deps.benachrichtigungen, {
            schluessel: s,
            halter: s.halter,
            plaene: vorher,
            planungId: p.id,
            aktion: 'geloescht',
            zeitfenster: p,
            akteur: ich,
            name: (await schluesselMitglieder()).name,
          });
        });
        return c.json({ ok: true });
      })
      .get('/schluessel/:id', auth, schluesselLesen, async (c) => {
        const s = await deps.schluessel.holen(c.req.param('id'));
        if (!s || (s.archiviert && !c.get('permissions').includes('schluessel:verwalten'))) {
          throw new HTTPException(404, { message: 'Schlüssel nicht gefunden' });
        }
        const m = await schluesselMitglieder();
        const planungen = await deps.schluesselAnfragen.planungen(s.id);
        const dto: SchluesselDetailDto = {
          ...alsSchluesselDto(
            s,
            m.halter,
            planungen.map((p) => alsPlanungDto(p, m)),
          ),
          uebergaben: s.uebergaben.map((u) => ({
            id: u.id,
            von: m.halter(u.von),
            an: m.halter(u.an),
            eingetragenVon: m.halter({ art: 'mitglied', sub: u.eingetragenVon }),
            zeitpunkt: u.zeitpunkt.toISOString(),
          })),
        };
        return c.json(dto);
      })
      .post(
        '/schluessel',
        auth,
        schluesselVerwalten,
        zValidator('json', schluesselAnlegenSchema),
        async (c) => {
          const daten = c.req.valid('json');
          const akteur = c.get('user').sub;
          if (daten.halter?.art === 'mitglied') await mitgliedMussExistieren(daten.halter.sub);
          const id = await deps.schluessel.anlegen(daten, akteur);
          if (daten.halter) {
            const halter = daten.halter;
            await bestEffort(async () => {
              const m = await schluesselMitglieder();
              await meldeUebergabe(deps.benachrichtigungen, {
                schluessel: { id, name: daten.name },
                von: null,
                an: halter,
                akteur,
                name: m.name,
              });
            });
          }
          return c.json({ id }, 201);
        },
      )
      .put(
        '/schluessel/:id',
        auth,
        schluesselVerwalten,
        zValidator('json', schluesselEingabeSchema),
        async (c) => {
          gefunden(
            await deps.schluessel.aktualisieren(c.req.param('id'), c.req.valid('json')),
            'Schlüssel nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .put(
        '/schluessel/:id/archiv',
        auth,
        schluesselVerwalten,
        zValidator('json', postenArchivierenSchema),
        async (c) => {
          const { archiviert } = c.req.valid('json');
          gefunden(
            await deps.schluessel.archivieren(c.req.param('id'), archiviert),
            'Schlüssel nicht gefunden',
          );
          return c.json({ archiviert });
        },
      )
      .post(
        '/schluessel/:id/uebergaben',
        auth,
        schluesselLesen,
        zValidator('json', uebergabeSchema),
        async (c) => {
          const { von, an } = c.req.valid('json');
          const akteur = c.get('user').sub;
          if (an === null && !c.get('permissions').includes('schluessel:verwalten')) {
            throw new HTTPException(403, {
              message: 'Nur die Schlüsselverwaltung kann einen Schlüssel ohne Halter eintragen.',
            });
          }
          // `von` is the holder the client saw (409 otherwise): null = the key has no holder yet.
          if (von === null && !c.get('permissions').includes('schluessel:verwalten')) {
            throw new HTTPException(403, {
              message: 'Den ersten Halter trägt die Schlüsselverwaltung ein.',
            });
          }
          await eigenesProfilMussExistieren(akteur);
          if (an?.art === 'mitglied') await mitgliedMussExistieren(an.sub);
          const s = gefunden(
            await deps.schluessel
              .uebergeben(c.req.param('id'), { von, an }, akteur)
              .catch(schluesselFehler),
            'Schlüssel nicht gefunden',
          );
          const m = await schluesselMitglieder();
          await bestEffort(() =>
            meldeUebergabe(deps.benachrichtigungen, {
              schluessel: s,
              von,
              an,
              akteur,
              name: m.name,
            }),
          );
          const planungen = await deps.schluesselAnfragen.planungen(s.id);
          return c.json(
            alsSchluesselDto(
              s,
              m.halter,
              planungen.map((p) => alsPlanungDto(p, m)),
            ),
          );
        },
      )
  );
  // ----- Privatpartys (see docs/privatpartys.md): everything needs `privatpartys:verwalten`;
};
