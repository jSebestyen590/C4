// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ProtokollMitgliedDto } from '@c4/shared';
import { KonfliktHinweis } from './KonfliktHinweis';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  onchange: null,
  dispatchEvent: vi.fn(),
})) as unknown as typeof window.matchMedia;

const text = (von: ProtokollMitgliedDto | null) => {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  act(() =>
    root.render(
      <MantineProvider>
        <KonfliktHinweis von={von} ladeNeu={false} onNeuLaden={vi.fn()} />
      </MantineProvider>,
    ),
  );
  const t = el.textContent ?? '';
  act(() => root.unmount());
  return t;
};

const mitglied = (username: string | null): ProtokollMitgliedDto => ({
  sub: 's1',
  username,
  vorname: 'Erika',
  nachname: 'Muster',
  status: 'mitglied',
  anrede: 'weiblich',
});

it('names the person who changed the protocol', () => {
  expect(text(mitglied('erika'))).toContain('erika hat das Protokoll inzwischen geändert.');
});

it('falls back to the full name without a username', () => {
  expect(text(mitglied(null))).toContain('Erika Muster hat das Protokoll inzwischen geändert.');
});

it('keeps the neutral text when the editor is unknown', () => {
  const t = text(null);
  expect(t).toContain('Jemand anderes hat das Protokoll inzwischen geändert.');
  expect(t).toContain('Deine ungespeicherten Änderungen gehen dabei verloren.');
});
