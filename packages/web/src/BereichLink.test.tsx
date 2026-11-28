// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BereichLink } from './BereichLink';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('BereichLink', () => {
  it('opens in a new tab and shows the external icon', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MantineProvider>
          <MemoryRouter>
            <BereichLink to="/kalender/events/1">Sommerfest</BereichLink>
          </MemoryRouter>
        </MantineProvider>,
      );
    });
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/kalender/events/1');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.textContent).toContain('Sommerfest');
    expect(link?.querySelector('svg')).not.toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });
});
