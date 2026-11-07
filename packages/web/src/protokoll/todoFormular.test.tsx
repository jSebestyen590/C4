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

/** `disabled` of each radio input (the "Abhaken" segments). */
const radiosGesperrt = (h: string): boolean[] =>
  h
    .split('<input')
    .filter((i) => i.includes('type="radio"'))
    .map((i) => i.includes('disabled'));

describe('TodoFormular', () => {
  it('always renders the same fields, whatever is selected', () => {
    const felder = (h: string) => [...h.matchAll(/data-fokus="titel"|Zuständig|Deadline|Abhaken/g)];
    const leer = html({});
    const einePerson = html({ zustaendig: [{ art: 'person', sub: 'a' }] });
    const gruppe = html({ zustaendig: [{ art: 'gruppe', gruppe: 'alle' }], modus: 'gemeinsam' });
    expect(felder(leer).map((m) => m[0])).toEqual(felder(einePerson).map((m) => m[0]));
    expect(felder(leer).map((m) => m[0])).toEqual(felder(gruppe).map((m) => m[0]));
    expect(leer).toContain('Einzeln');
    expect(leer).toContain('Gemeinsam');
  });

  it('disables "Abhaken" with a hint only for exactly one person', () => {
    const eine = html({ zustaendig: [{ art: 'person', sub: 'a' }] });
    expect(eine).toContain('Bei nur einer Person gibt es nichts zu wählen.');
    expect(radiosGesperrt(eine)).toEqual([true, true]);
    const gruppe = html({ zustaendig: [{ art: 'gruppe', gruppe: 'alle' }] });
    expect(gruppe).not.toContain('Bei nur einer Person');
    expect(radiosGesperrt(gruppe)).toEqual([false, false]);
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
    expect(h).not.toContain('Abhaken');
  });
});
