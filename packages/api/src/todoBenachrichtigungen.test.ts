import { describe, expect, it } from 'vitest';
import { createBenachrichtigungen } from './benachrichtigungen';
import { createFakeBenachrichtigungenStore } from './benachrichtigungen.fake';
import { todoErinnerungen, todoFristText } from './todoBenachrichtigungen';
import { createFakeTodosStore } from './todos.fake';
import type { TodoAnlegen } from './todos';

function setup(subs = ['x', 'y']) {
  const fake = createFakeBenachrichtigungenStore(() =>
    subs.map((sub) => ({ sub, status: 'mitglied' as const, deaktiviert: false })),
  );
  const versendet: { endpoint: string; titel: string; text: string; url: string }[] = [];
  const b = createBenachrichtigungen({
    store: fake.store,
    sender: async (abo, n) => {
      versendet.push({ endpoint: abo.endpoint, titel: n.titel, text: n.text, url: n.url });
      return 'ok';
    },
  });
  const todos = createFakeTodosStore();
  const run = (jetzt: string) => todoErinnerungen(b, todos.store, new Date(jetzt));
  const abo = (sub: string) =>
    fake.store.aboSpeichern(sub, {
      endpoint: `https://push.example/${sub}`,
      keys: { p256dh: 'p', auth: 'a' },
    });
  const neu = (extra: Partial<TodoAnlegen> = {}) =>
    todos.store.anlegen({
      titel: 'Kasse prüfen',
      notizen: null,
      faelligAm: '2026-11-14',
      modus: 'einzeln',
      protokollId: null,
      bausteinId: null,
      erstelltVon: 'x',
      subs: ['x'],
      ...extra,
    });
  return { ...fake, todosStore: todos.store, versendet, run, abo, neu };
}

// 2026-11-12 is a Thursday; 10:00 Berlin = 09:00Z (CET).
const HEUTE_10 = '2026-11-12T09:00:00Z';

describe('todoFristText', () => {
  it('words the deadline with weekday and date', () => {
    expect(todoFristText('Kasse prüfen', '2026-11-14')).toBe(
      '„Kasse prüfen“ ist am Sa, 14.11. fällig.',
    );
  });
});

describe('todoErinnerungen', () => {
  it('reminds two days before the deadline with a link to the Todos', async () => {
    const t = setup();
    await t.abo('x');
    await t.neu();
    await t.run(HEUTE_10);
    expect(t.versendet).toEqual([
      {
        endpoint: 'https://push.example/x',
        titel: 'Todo bald fällig',
        text: '„Kasse prüfen“ ist am Sa, 14.11. fällig.',
        url: '/app/todos',
      },
    ]);
  });

  it('covers the window from today to two days ahead only', async () => {
    const t = setup();
    await t.abo('x');
    await t.neu({ titel: 'heute', faelligAm: '2026-11-12' });
    await t.neu({ titel: 'in 2', faelligAm: '2026-11-14' });
    await t.neu({ titel: 'in 3', faelligAm: '2026-11-15' });
    await t.run(HEUTE_10);
    expect(t.versendet.map((v) => v.text.split('“')[0])).toEqual(['„heute', '„in 2']);
  });

  it('reminds about overdue open Todos every day, with singular and plural text', async () => {
    const t = setup();
    await t.abo('x');
    await t.neu({ faelligAm: '2026-11-11' });
    await t.run(HEUTE_10);
    await t.run('2026-11-12T10:00:00Z');
    expect(t.versendet.map((v) => [v.titel, v.text])).toEqual([
      ['Todo überfällig', '„Kasse prüfen“ ist seit 1 Tag überfällig.'],
    ]);
    await t.run('2026-11-13T09:00:00Z');
    expect(t.versendet[1]!.text).toBe('„Kasse prüfen“ ist seit 2 Tagen überfällig.');
    expect(t.versendet).toHaveLength(2);
  });

  it('does not remind about a done overdue Todo', async () => {
    const t = setup();
    await t.abo('x');
    const id = await t.neu({ faelligAm: '2026-11-10' });
    await t.todosStore.abhaken(id, 'x', true);
    await t.run(HEUTE_10);
    expect(t.versendet).toHaveLength(0);
  });

  it('reminds once per Todo, deadline and person, but again when the deadline moves', async () => {
    const t = setup();
    await t.abo('x');
    const id = await t.neu();
    await t.run(HEUTE_10);
    await t.run('2026-11-12T10:00:00Z');
    await t.run('2026-11-13T09:00:00Z');
    expect(t.versendet).toHaveLength(1);
    await t.todosStore.aendern(id, {
      titel: 'Kasse prüfen',
      notizen: null,
      faelligAm: '2026-11-15',
      modus: 'einzeln',
    });
    await t.run('2026-11-13T09:00:00Z');
    expect(t.versendet).toHaveLength(2);
    expect(t.versendet[1]!.text).toContain('So, 15.11.');
  });

  it('sends nothing before 09:00 Berlin time', async () => {
    const t = setup();
    await t.abo('x');
    await t.neu();
    await t.run('2026-11-12T07:59:00Z'); // 08:59 Berlin
    expect(t.versendet).toHaveLength(0);
    await t.run('2026-11-12T08:00:00Z'); // 09:00 Berlin
    expect(t.versendet).toHaveLength(1);
  });

  it('skips people who are done, in both modes', async () => {
    const t = setup();
    await t.abo('x');
    await t.abo('y');
    const einzeln = await t.neu({ titel: 'einzeln', subs: ['x', 'y'] });
    const gemeinsam = await t.neu({ titel: 'gemeinsam', modus: 'gemeinsam', subs: ['x', 'y'] });
    await t.todosStore.abhaken(einzeln, 'x', true);
    await t.todosStore.abhaken(gemeinsam, 'y', true);
    await t.run(HEUTE_10);
    expect(t.versendet.map((v) => [v.endpoint, v.text.slice(0, 9)])).toEqual([
      ['https://push.example/y', '„einzeln“'],
    ]);
  });

  it('cannot be switched off', async () => {
    const t = setup();
    await t.abo('x');
    await t.store.einstellungSetzen('x', 'todo.frist', false, null);
    await t.neu();
    await t.run(HEUTE_10);
    expect(t.versendet).toHaveLength(1);
  });
});

describe('Todos store (fake mirrors the real rules)', () => {
  it('ticks per mode and unticks again', async () => {
    const t = setup();
    const g = await t.neu({ modus: 'gemeinsam', subs: ['x', 'y'] });
    const e = await t.neu({ modus: 'einzeln', subs: ['x', 'y'] });
    expect(await t.todosStore.abhaken(g, 'z', true)).toBe('nicht_zustaendig');
    expect(await t.todosStore.abhaken('nope', 'x', true)).toBe('nicht_gefunden');
    await t.todosStore.abhaken(g, 'x', true);
    await t.todosStore.abhaken(e, 'x', true);
    expect((await t.todosStore.byId(g))!).toMatchObject({
      erledigtVon: 'x',
      erledigtAm: expect.any(Date),
    });
    expect((await t.todosStore.byId(g))!.zustaendige.every((z) => z.erledigtAm === null)).toBe(
      true,
    );
    expect((await t.todosStore.byId(e))!.zustaendige.map((z) => z.erledigtAm !== null)).toEqual([
      true,
      false,
    ]);
    await t.todosStore.abhaken(g, 'y', false);
    await t.todosStore.abhaken(e, 'x', false);
    expect((await t.todosStore.byId(g))!).toMatchObject({ erledigtAm: null, erledigtVon: null });
    expect((await t.todosStore.byId(e))!.zustaendige.every((z) => z.erledigtAm === null)).toBe(
      true,
    );
  });

  it('keeps the ticks of the people who stay when the people change', async () => {
    const t = setup();
    const id = await t.neu({ subs: ['x', 'y'] });
    await t.todosStore.abhaken(id, 'x', true);
    expect(await t.todosStore.zustaendigeSetzen(id, ['x', 'z'])).toBe(true);
    const todo = (await t.todosStore.byId(id))!;
    expect(todo.zustaendige.map((z) => [z.sub, z.erledigtAm !== null])).toEqual([
      ['x', true],
      ['z', false],
    ]);
    expect(await t.todosStore.zustaendigeSetzen('nope', [])).toBe(false);
  });
});
