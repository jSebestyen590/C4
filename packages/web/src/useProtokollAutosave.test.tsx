// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProtokollDokument, ProtokollKopf } from '@c4/shared';
import {
  AUTOSAVE_VERZOEGERUNG_MS,
  useProtokollAutosave,
  type SpeicherZustand,
} from './useProtokollAutosave';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const speichernMock = vi.fn();
vi.mock('./protokollDaten', () => ({ useProtokollSpeichern: () => speichernMock }));

const inhalt = { type: 'doc', content: [] } as unknown as ProtokollDokument;
const kopf = {} as ProtokollKopf;

type Api = ReturnType<typeof useProtokollAutosave>;
const aktuell: { api: Api | null } = { api: null };
const api = {
  get zustand() {
    return aktuell.api!.zustand;
  },
  aendern: (neu: Parameters<Api['aendern']>[0]) => aktuell.api!.aendern(neu),
};
function Harness() {
  const h = useProtokollAutosave({ id: 'p1', version: 1, inhalt, kopf, aktiv: true });
  useEffect(() => {
    aktuell.api = h;
  });
  return null;
}

let aufraeumen: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  speichernMock.mockReset();
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  aufraeumen = () => act(() => root.unmount());
});
afterEach(() => {
  aufraeumen();
  vi.useRealTimers();
});

const warte = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const aendern = () => act(() => api.aendern({ inhalt }));
const zustand = (): SpeicherZustand => api.zustand;
const fehlschlag = () => speichernMock.mockRejectedValue(new Error('netz'));

describe('useProtokollAutosave retry', () => {
  it('retries after 2 s, 5 s and 10 s, then stops', async () => {
    fehlschlag();
    await aendern();
    await warte(AUTOSAVE_VERZOEGERUNG_MS);
    expect(speichernMock).toHaveBeenCalledTimes(1);
    expect(zustand()).toEqual({ art: 'fehler', erneut: true });

    await warte(1999);
    expect(speichernMock).toHaveBeenCalledTimes(1);
    await warte(1);
    expect(speichernMock).toHaveBeenCalledTimes(2);

    await warte(4999);
    expect(speichernMock).toHaveBeenCalledTimes(2);
    await warte(1);
    expect(speichernMock).toHaveBeenCalledTimes(3);

    await warte(9999);
    expect(speichernMock).toHaveBeenCalledTimes(3);
    await warte(1);
    expect(speichernMock).toHaveBeenCalledTimes(4);
    expect(zustand()).toEqual({ art: 'fehler', erneut: false });

    await warte(60_000);
    expect(speichernMock).toHaveBeenCalledTimes(4);
  });

  it('becomes clean when a retry succeeds', async () => {
    speichernMock.mockRejectedValueOnce(new Error('netz'));
    speichernMock.mockResolvedValue({ art: 'ok', version: 2 });
    await aendern();
    await warte(AUTOSAVE_VERZOEGERUNG_MS);
    expect(zustand().art).toBe('fehler');
    await warte(2000);
    expect(speichernMock).toHaveBeenCalledTimes(2);
    expect(zustand().art).toBe('sauber');
  });

  it('starts over with the next edit after the retries ran out', async () => {
    fehlschlag();
    await aendern();
    await warte(AUTOSAVE_VERZOEGERUNG_MS + 2000 + 5000 + 10_000);
    expect(speichernMock).toHaveBeenCalledTimes(4);
    await aendern();
    await warte(AUTOSAVE_VERZOEGERUNG_MS);
    expect(speichernMock).toHaveBeenCalledTimes(5);
    expect(zustand()).toEqual({ art: 'fehler', erneut: true });
    await warte(2000);
    expect(speichernMock).toHaveBeenCalledTimes(6);
  });

  it('does not retry after a conflict', async () => {
    speichernMock.mockResolvedValue({ art: 'konflikt', version: 5, geaendertVon: null });
    await aendern();
    await warte(AUTOSAVE_VERZOEGERUNG_MS + 60_000);
    expect(speichernMock).toHaveBeenCalledTimes(1);
    expect(zustand().art).toBe('konflikt');
  });

  it('a new edit replaces the pending retry', async () => {
    fehlschlag();
    await aendern();
    await warte(AUTOSAVE_VERZOEGERUNG_MS);
    expect(speichernMock).toHaveBeenCalledTimes(1);
    await warte(1000);
    await aendern();
    await warte(1000); // would have been the retry time
    expect(speichernMock).toHaveBeenCalledTimes(1);
    await warte(1000);
    expect(speichernMock).toHaveBeenCalledTimes(2);
  });
});

describe('useProtokollAutosave lock', () => {
  it('stops saving when the edit lock is gone', async () => {
    speichernMock.mockResolvedValue({ art: 'gesperrt', von: null, eigene: true });
    await aendern();
    await warte(AUTOSAVE_VERZOEGERUNG_MS);
    expect(zustand()).toEqual({ art: 'gesperrt', von: null, eigene: true });
    await aendern();
    await warte(AUTOSAVE_VERZOEGERUNG_MS * 2);
    expect(speichernMock).toHaveBeenCalledTimes(1);
  });
});
