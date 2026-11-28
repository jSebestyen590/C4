// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ListenSelect } from './ListenSelect';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function rendern() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MantineProvider>
        <ListenSelect label="Test" searchable data={['a', 'b']} />
      </MantineProvider>,
    );
  });
  const input = () => container.querySelector('input:not([type="hidden"])')!;
  const chevron = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Liste"]')!;
  return { input, chevron };
}

const druecken = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('ListenSelect chevron', () => {
  it('opens and closes the list on repeated presses', () => {
    const { input, chevron } = rendern();
    expect(input().getAttribute('aria-expanded')).toBe('false');
    druecken(chevron());
    expect(input().getAttribute('aria-expanded')).toBe('true');
    druecken(chevron());
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });
  it('keyboard activation (click without mousedown) toggles too', () => {
    const { input, chevron } = rendern();
    act(() => chevron().click());
    expect(input().getAttribute('aria-expanded')).toBe('true');
    act(() => chevron().click());
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });
});
