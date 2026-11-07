import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Todo, TodoZustaendiger } from '@c4/shared';
import { TodoKarte, todoFristFarbe } from './TodosPage';

const person = (sub: string, erledigtAm: string | null = null): TodoZustaendiger => ({
  sub,
  username: sub,
  vorname: 'V',
  nachname: 'N',
  status: 'mitglied',
  anrede: 'neutral',
  erledigtAm,
});

const todo = (extra: Partial<Todo> = {}): Todo => ({
  id: 't1',
  titel: 'Kasse prüfen',
  notizen: 'Zeile 1\nZeile 2',
  faelligAm: '2026-11-14',
  modus: 'einzeln',
  quelle: null,
  zustaendige: [person('me')],
  erledigtAm: null,
  erledigtVon: null,
  ichErledigt: false,
  bearbeitbar: false,
  ...extra,
});

const html = (t: Todo, protokollLink = false) =>
  renderToStaticMarkup(
    <MantineProvider>
      <MemoryRouter>
        <TodoKarte
          todo={t}
          heute="2026-11-07"
          protokollLink={protokollLink}
          onErledigt={() => undefined}
          onBearbeiten={() => undefined}
          onLoeschen={() => undefined}
        />
      </MemoryRouter>
    </MantineProvider>,
  );

describe('todoFristFarbe', () => {
  it('is red when overdue, orange within two days, else none', () => {
    expect(todoFristFarbe('2026-11-06', '2026-11-07')).toBe('red');
    expect(todoFristFarbe('2026-11-07', '2026-11-07')).toBe('orange');
    expect(todoFristFarbe('2026-11-09', '2026-11-07')).toBe('orange');
    expect(todoFristFarbe('2026-11-10', '2026-11-07')).toBeUndefined();
  });
});

describe('TodoKarte', () => {
  it('shows title, deadline, notes and an accessible tick box', () => {
    const h = html(todo());
    expect(h).toContain('Kasse prüfen');
    expect(h).toContain('Fällig Sa, 14.11.');
    expect(h).toContain('Zeile 1');
    expect(h).toContain('aria-label="Kasse prüfen abhaken"');
    expect(h).not.toContain('überfällig');
  });

  it('marks an overdue Todo and offers to reopen a done one', () => {
    expect(html(todo({ faelligAm: '2026-11-01' }))).toContain('(überfällig)');
    const fertig = html(todo({ faelligAm: '2026-11-01', ichErledigt: true }));
    expect(fertig).toContain('wieder öffnen');
    expect(fertig).not.toContain('überfällig');
  });

  it('shows the source, linked only when protocols may be read', () => {
    const quelle = { protokollId: 'p1', eventName: 'Sitzung', datum: '2026-11-04' };
    expect(html(todo({ quelle }), true)).toContain('href="/protokolle/p1"');
    const ohne = html(todo({ quelle }));
    expect(ohne).toContain('Aus Protokoll:');
    expect(ohne).toContain('Sitzung 04.11.2026');
    expect(ohne).not.toContain('href="/protokolle/p1"');
  });

  it('counts the ticks of an einzeln Todo and names who completed a gemeinsam one', () => {
    const z = [person('me', '2026-11-07T10:00:00Z'), person('b'), person('c')];
    expect(html(todo({ zustaendige: z }))).toContain('1 von 3 erledigt');
    const gemeinsam = html(
      todo({
        modus: 'gemeinsam',
        zustaendige: z,
        erledigtAm: '2026-11-07T10:00:00Z',
        erledigtVon: 'b',
        ichErledigt: true,
      }),
    );
    expect(gemeinsam).toContain('Erledigt von');
    expect(gemeinsam).toContain('>b<');
  });

  it('has an actions menu only for editable Todos', () => {
    expect(html(todo())).not.toContain('Aktionen für');
    expect(html(todo({ bearbeitbar: true }))).toContain('Aktionen für Kasse prüfen');
  });
});
