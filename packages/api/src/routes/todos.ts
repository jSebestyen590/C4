import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  datumBerlin,
  todoEingabeSchema,
  todoErledigtSchema,
  todoFuerMichErledigt,
  todosSortieren,
  type Todo,
  type TodoQuelle,
} from '@c4/shared';
import { type TodoDaten } from '../todos';
import { type ProtokollMitglied } from '../protokolleAnsicht';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const todosRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, protokollMitglieder, gefunden } = ctx;

  /** A Todo as the person `sub` sees it (members shown with username and status). */
  const alsTodoDto = (
    t: TodoDaten,
    sub: string,
    mitglieder: ReadonlyMap<string, ProtokollMitglied>,
    quellen: ReadonlyMap<string, TodoQuelle>,
  ): Todo => {
    const zustaendige = t.zustaendige.map((z) => {
      const m = mitglieder.get(z.sub);
      return {
        sub: z.sub,
        username: m?.username ?? null,
        vorname: m?.vorname ?? '',
        nachname: m?.nachname ?? '',
        status: m?.status ?? 'extern',
        anrede: m?.anrede ?? 'neutral',
        erledigtAm: z.erledigtAm?.toISOString() ?? null,
      };
    });
    const teil = {
      modus: t.modus,
      erledigtAm: t.erledigtAm?.toISOString() ?? null,
      zustaendige,
    };
    return {
      id: t.id,
      titel: t.titel,
      notizen: t.notizen,
      faelligAm: t.faelligAm,
      modus: t.modus,
      quelle: (t.protokollId && quellen.get(t.protokollId)) || null,
      zustaendige,
      erledigtAm: teil.erledigtAm,
      erledigtVon: t.erledigtVon,
      ichErledigt: todoFuerMichErledigt(teil, sub),
      bearbeitbar: t.protokollId === null && t.erstelltVon === sub,
    };
  };

  /** The protocols the Todos come from, as "Sitzung name and date", by protocol id. */
  const todoQuellen = async (liste: readonly TodoDaten[]): Promise<Map<string, TodoQuelle>> => {
    const ids = new Set(liste.flatMap((t) => (t.protokollId ? [t.protokollId] : [])));
    if (ids.size === 0) return new Map();
    const protokolle = (await deps.protokolle.alle()).filter((p) => ids.has(p.id));
    const events = new Map(
      (await deps.kalender.eventsKurz(protokolle.map((p) => p.eventId))).map((e) => [e.id, e]),
    );
    return new Map(
      protokolle.map((p) => {
        const e = events.get(p.eventId);
        return [
          p.id,
          {
            protokollId: p.id,
            eventName: e?.titel ?? '',
            datum: datumBerlin(e?.beginn ?? p.erstelltAm.toISOString()),
          },
        ] as const;
      }),
    );
  };

  /** One Todo as the person sees it. */
  const todoFuer = async (t: TodoDaten, sub: string): Promise<Todo> => {
    const [mitglieder, quellen] = await Promise.all([protokollMitglieder(), todoQuellen([t])]);
    return alsTodoDto(t, sub, new Map(mitglieder.map((m) => [m.sub, m])), quellen);
  };

  /** The Todo, if the person created it or is zuständig (404 otherwise, so ids do not leak). */
  const eigenesTodoLaden = async (id: string, sub: string): Promise<TodoDaten> => {
    const t = gefunden(await deps.todos.byId(id), 'Todo nicht gefunden');
    if (t.erstelltVon !== sub && !t.zustaendige.some((z) => z.sub === sub)) {
      throw new HTTPException(404, { message: 'Todo nicht gefunden' });
    }
    return t;
  };

  /** A Todo the person may edit or delete: created by them, not from a protocol (403 otherwise). */
  const todoBearbeitbarLaden = async (id: string, sub: string): Promise<TodoDaten> => {
    const t = await eigenesTodoLaden(id, sub);
    if (t.protokollId !== null || t.erstelltVon !== sub) {
      throw new HTTPException(403, { message: 'Dieses Todo kannst du nicht ändern.' });
    }
    return t;
  };

  // ----- Protokolle: helpers

  return new Hono<AuthEnv>()
    .get('/me/todos', auth, async (c) => {
      const sub = c.get('user').sub;
      const liste = await deps.todos.meine(sub);
      const [mitglieder, quellen] = await Promise.all([protokollMitglieder(), todoQuellen(liste)]);
      const nachSub = new Map(mitglieder.map((m) => [m.sub, m]));
      const dtos: Todo[] = todosSortieren(liste.map((t) => alsTodoDto(t, sub, nachSub, quellen)));
      return c.json(dtos);
    })
    .post('/me/todos', auth, zValidator('json', todoEingabeSchema), async (c) => {
      const sub = c.get('user').sub;
      const daten = c.req.valid('json');
      const id = await deps.todos.anlegen({
        titel: daten.titel,
        notizen: daten.notizen || null,
        faelligAm: daten.faelligAm,
        modus: 'einzeln',
        protokollId: null,
        bausteinId: null,
        erstelltVon: sub,
        subs: [sub],
      });
      const t = gefunden(await deps.todos.byId(id), 'Todo nicht gefunden');
      return c.json(await todoFuer(t, sub), 201);
    })
    .put('/me/todos/:id', auth, zValidator('json', todoEingabeSchema), async (c) => {
      const sub = c.get('user').sub;
      const t = await todoBearbeitbarLaden(c.req.param('id'), sub);
      const daten = c.req.valid('json');
      gefunden(
        await deps.todos.aendern(t.id, {
          titel: daten.titel,
          notizen: daten.notizen || null,
          faelligAm: daten.faelligAm,
          modus: t.modus,
        }),
        'Todo nicht gefunden',
      );
      const neu = gefunden(await deps.todos.byId(t.id), 'Todo nicht gefunden');
      return c.json(await todoFuer(neu, sub));
    })
    .delete('/me/todos/:id', auth, async (c) => {
      const t = await todoBearbeitbarLaden(c.req.param('id'), c.get('user').sub);
      gefunden(await deps.todos.loeschen(t.id), 'Todo nicht gefunden');
      return c.json({ ok: true });
    })
    .put('/me/todos/:id/erledigt', auth, zValidator('json', todoErledigtSchema), async (c) => {
      const sub = c.get('user').sub;
      const id = c.req.param('id');
      const ergebnis = await deps.todos.abhaken(id, sub, c.req.valid('json').erledigt);
      if (ergebnis === 'nicht_gefunden') {
        throw new HTTPException(404, { message: 'Todo nicht gefunden' });
      }
      if (ergebnis === 'nicht_zustaendig') {
        throw new HTTPException(403, { message: 'Du bist für dieses Todo nicht zuständig.' });
      }
      const t = gefunden(await deps.todos.byId(id), 'Todo nicht gefunden');
      return c.json(await todoFuer(t, sub));
    });
  // ----- Protokolle;
};
