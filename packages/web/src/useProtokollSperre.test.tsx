// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPERRE_HERZSCHLAG_MS, useProtokollSperre } from './useProtokollSperre';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nehmen = vi.fn();
const loesen = vi.fn();
vi.mock('./protokollDaten', () => ({ useProtokollSperreApi: () => ({ nehmen, loesen }) }));

const beiFrei = vi.fn();
type Api = ReturnType<typeof useProtokollSperre>;
const aktuell: { api: Api | null } = { api: null };
function Harness({ aktiv }: Readonly<{ aktiv: boolean }>) {
  const h = useProtokollSperre({ id: 'p1', aktiv, beiFrei });
  useEffect(() => {
    aktuell.api = h;
  });
  return null;
}

const belegt = { art: 'gesperrt', von: null, eigene: true } as const;
let root: ReturnType<typeof createRoot>;
let eingehaengt = true;
const rendern = (aktiv = true) => act(() => root.render(<Harness aktiv={aktiv} />));
const warte = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const zustand = () => aktuell.api!.zustand;

beforeEach(() => {
  vi.useFakeTimers();
  nehmen.mockReset().mockResolvedValue({ art: 'ok' });
  loesen.mockReset().mockResolvedValue(undefined);
  beiFrei.mockReset().mockResolvedValue(undefined);
  root = createRoot(document.createElement('div'));
  eingehaengt = true;
});
afterEach(() => {
  if (eingehaengt) act(() => root.unmount());
  vi.useRealTimers();
});

describe('useProtokollSperre', () => {
  it('takes the lock on start and sends a heartbeat every 30 s', async () => {
    await rendern();
    await warte(0);
    expect(zustand()).toEqual({ art: 'eigen', frei: false });
    expect(nehmen).toHaveBeenCalledTimes(1);
    await warte(SPERRE_HERZSCHLAG_MS);
    expect(nehmen).toHaveBeenCalledTimes(2);
    await warte(SPERRE_HERZSCHLAG_MS);
    expect(nehmen).toHaveBeenCalledTimes(3);
    expect(beiFrei).not.toHaveBeenCalled();
  });

  it('does nothing when not active', async () => {
    await rendern(false);
    await warte(SPERRE_HERZSCHLAG_MS * 2);
    expect(zustand()).toEqual({ art: 'inaktiv' });
    expect(nehmen).not.toHaveBeenCalled();
  });

  it('stays read-only while locked, re-checks every 30 s and becomes editable with the latest version', async () => {
    nehmen.mockResolvedValue(belegt);
    await rendern();
    await warte(0);
    expect(zustand()).toEqual({ art: 'gesperrt', von: null, eigene: true });
    await warte(SPERRE_HERZSCHLAG_MS);
    expect(nehmen).toHaveBeenCalledTimes(2);
    expect(zustand().art).toBe('gesperrt');
    expect(beiFrei).not.toHaveBeenCalled();

    nehmen.mockResolvedValue({ art: 'ok' });
    await warte(SPERRE_HERZSCHLAG_MS);
    expect(beiFrei).toHaveBeenCalledTimes(1);
    expect(zustand()).toEqual({ art: 'eigen', frei: true });
    act(() => aktuell.api!.hinweisSchliessen());
    expect(zustand()).toEqual({ art: 'eigen', frei: false });
  });

  it('turns read-only when a heartbeat is refused', async () => {
    await rendern();
    await warte(0);
    nehmen.mockResolvedValue(belegt);
    await warte(SPERRE_HERZSCHLAG_MS);
    expect(zustand().art).toBe('gesperrt');
  });

  it('checks again at once after a refused save', async () => {
    await rendern();
    await warte(0);
    nehmen.mockResolvedValue(belegt);
    await act(async () => aktuell.api!.verloren(null, false));
    expect(nehmen).toHaveBeenCalledTimes(2);
    expect(zustand().art).toBe('gesperrt');
  });

  it('keeps its state on network errors', async () => {
    await rendern();
    await warte(0);
    nehmen.mockRejectedValue(new Error('netz'));
    await warte(SPERRE_HERZSCHLAG_MS);
    expect(zustand()).toEqual({ art: 'eigen', frei: false });
  });

  it('releases the lock on pagehide and on unmount, and stops the heartbeat', async () => {
    await rendern();
    await warte(0);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(loesen).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    eingehaengt = false;
    expect(loesen).toHaveBeenCalledTimes(2);
    expect(loesen).toHaveBeenLastCalledWith('p1');
    await warte(SPERRE_HERZSCHLAG_MS * 2);
    expect(nehmen).toHaveBeenCalledTimes(1);
  });
});
