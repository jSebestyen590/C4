import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { bausteinLeer, type BausteinTodoDaten } from '@c4/shared';

vi.mock('../organisator', () => ({
  useMitgliederListe: () => ({
    data: [
      {
        sub: 'a',
        username: 'anna',
        vorname: 'Anna',
        nachname: 'A',
        email: null,
        status: 'mitglied',
        deaktiviert: false,
      },
    ],
  }),
  mitgliedOptionen: (l: { sub: string; username: string | null }[]) =>
    l.map((m) => ({ value: m.sub, label: m.username ?? m.sub })),
}));

const { TodoFormular } = await import('./BausteinFormulare');

const html = (daten: Partial<BausteinTodoDaten>, editierbar = true) =>
  renderToStaticMarkup(
    <MantineProvider>
      <TodoFormular
        daten={{ ...bausteinLeer('bausteinTodo'), ...daten }}
        aendern={() => undefined}
        editierbar={editierbar}
      />
    </MantineProvider>,
  );

/** Whether the "Gemeinsam abhaken" switch is disabled. */
const schalterGesperrt = (h: string): boolean =>
  h
    .split('<input')
    .filter((i) => i.includes('role="switch"'))
    .some((i) => i.includes('disabled'));

describe('TodoFormular', () => {
  it('always renders the same fields, whatever is selected', () => {
    const felder = (h: string) => [
      ...h.matchAll(/data-fokus="titel"|Zuständig|Deadline|Gemeinsam abhaken/g),
    ];
    const leer = html({});
    const einePerson = html({ zustaendig: [{ art: 'person', sub: 'a' }] });
    const gruppe = html({ zustaendig: [{ art: 'gruppe', gruppe: 'alle' }], modus: 'gemeinsam' });
    expect(felder(leer).map((m) => m[0])).toEqual(felder(einePerson).map((m) => m[0]));
    expect(felder(leer).map((m) => m[0])).toEqual(felder(gruppe).map((m) => m[0]));
    expect(leer).toContain('Gemeinsam abhaken');
  });

  it('disables "Gemeinsam abhaken" only for exactly one person (the switch stays rendered)', () => {
    expect(schalterGesperrt(html({ zustaendig: [{ art: 'person', sub: 'a' }] }))).toBe(true);
    expect(schalterGesperrt(html({ zustaendig: [{ art: 'gruppe', gruppe: 'alle' }] }))).toBe(false);
    expect(schalterGesperrt(html({}))).toBe(false);
  });

  it('shows one line when read-only', () => {
    const h = html(
      {
        titel: 'Kasse prüfen',
        zustaendig: [
          { art: 'person', sub: 'a' },
          { art: 'gruppe', gruppe: 'alle' },
        ],
        faelligAm: '2026-11-14',
      },
      false,
    );
    expect(h).toContain('Kasse prüfen');
    expect(h).toContain('anna, @Alle');
    expect(h).toContain('(bis 14.11.2026)');
    expect(h).not.toContain('abhaken');
  });
});
