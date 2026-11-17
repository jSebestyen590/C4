// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ortMerken } from './zurueckVerlauf';
import { ZurueckLink } from './ZurueckLink';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let aufraeumen: () => void = () => {};
let container: HTMLElement;
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
afterEach(() => {
  aufraeumen();
  vi.unstubAllGlobals();
});

/** Mimics AppLayout: records every location change before the page renders its back link. */
function Verlauf() {
  const l = useLocation();
  ortMerken({ key: l.key, pathname: l.pathname, search: l.search }, useNavigationType());
  return null;
}

function Ort() {
  const l = useLocation();
  return <output>{l.pathname + l.search}</output>;
}

function rendern(start: string) {
  container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <MantineProvider>
        <MemoryRouter initialEntries={[start]}>
          <Verlauf />
          <Ort />
          <Routes>
            <Route path="/liste" element={<Link to="/detail">zum Detail</Link>} />
            <Route
              path="/detail"
              element={<ZurueckLink to="/lager">Zurück zum Lager</ZurueckLink>}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    ),
  );
  aufraeumen = () => {
    act(() => root.unmount());
    container.remove();
  };
}

const klick = (el: Element, init: MouseEventInit = {}) =>
  act(
    () =>
      void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })),
  );

describe('ZurueckLink', () => {
  it('uses the fallback target and label on a deep link', () => {
    rendern('/detail');
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/lager');
    expect(a.textContent).toBe('Zurück zum Lager');
  });

  it('returns to the page the user came from, labelled "Zurück"', () => {
    rendern('/liste?filter=x');
    klick(container.querySelector('a')!);
    expect(container.querySelector('output')!.textContent).toBe('/detail');
    const zurueck = container.querySelector('a')!;
    expect(zurueck.textContent).toBe('Zurück');
    expect(zurueck.getAttribute('href')).toBe('/liste?filter=x');
    klick(zurueck);
    expect(container.querySelector('output')!.textContent).toBe('/liste?filter=x');
  });
});
