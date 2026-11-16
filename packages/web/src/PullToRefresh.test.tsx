// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullToRefresh } from './PullToRefresh';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reload = vi.fn();
let container: HTMLElement;
let aufraeumen: () => void;

function rendern(standalone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <MantineProvider>
        <PullToRefresh />
      </MantineProvider>,
    ),
  );
  aufraeumen = () => {
    act(() => root.unmount());
    container.remove();
  };
}

function beruehrung(typ: string, y: number, ziel: EventTarget = window) {
  const e = new Event(typ, { bubbles: true });
  Object.assign(e, { touches: typ === 'touchend' ? [] : [{ clientY: y }] });
  act(() => void ziel.dispatchEvent(e));
}

beforeEach(() => {
  reload.mockReset();
  vi.stubGlobal('location', { ...window.location, reload });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});
afterEach(() => {
  aufraeumen();
  vi.unstubAllGlobals();
});

describe('PullToRefresh', () => {
  it('reloads when pulled past the threshold in the home screen app', () => {
    rendern(true);
    beruehrung('touchstart', 10);
    beruehrung('touchmove', 120);
    expect(container.querySelector('svg')).not.toBeNull();
    beruehrung('touchend', 0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload for a short pull and hides the indicator', () => {
    rendern(true);
    beruehrung('touchstart', 10);
    beruehrung('touchmove', 50);
    expect(container.querySelector('svg')).not.toBeNull();
    beruehrung('touchend', 0);
    expect(reload).not.toHaveBeenCalled();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('ignores pulls in a normal browser tab', () => {
    rendern(false);
    beruehrung('touchstart', 10);
    beruehrung('touchmove', 200);
    beruehrung('touchend', 0);
    expect(reload).not.toHaveBeenCalled();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('ignores pulls that start while the page is scrolled', () => {
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    rendern(true);
    beruehrung('touchstart', 10);
    beruehrung('touchmove', 200);
    beruehrung('touchend', 0);
    expect(reload).not.toHaveBeenCalled();
  });

  it('ignores pulls that start inside a dialog', () => {
    rendern(true);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    beruehrung('touchstart', 10, dialog);
    beruehrung('touchmove', 200);
    beruehrung('touchend', 0);
    dialog.remove();
    expect(reload).not.toHaveBeenCalled();
  });
});
