// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnline } from './useOnline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  return createElement('span', null, useOnline() ? 'online' : 'offline');
}

function mount() {
  const el = document.createElement('div');
  const root = createRoot(el);
  act(() => root.render(createElement(Probe)));
  return { el, unmount: () => act(() => root.unmount()) };
}

afterEach(() => vi.restoreAllMocks());

describe('useOnline', () => {
  it('starts with navigator.onLine and follows the events', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { el, unmount } = mount();
    expect(el.textContent).toBe('offline');
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(el.textContent).toBe('online');
    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(el.textContent).toBe('offline');
    unmount();
  });
});
