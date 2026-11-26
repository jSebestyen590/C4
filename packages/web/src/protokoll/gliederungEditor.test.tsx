// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { bausteinErzeugen, type ProtokollDokument, type ProtokollKnoten } from '@c4/shared';
import { bausteinInGliederungVerschieben } from './gliederung';
import { ProtokollEditor } from './ProtokollEditor';
import type { Editor } from '@tiptap/react';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const absatz: ProtokollKnoten = { type: 'paragraph' };
const event = (id: string): ProtokollKnoten => {
  const b = bausteinErzeugen('bausteinAnwaerter', undefined, [absatz]);
  return { ...b, attrs: { ...b.attrs, id } };
};
const dokument = {
  type: 'doc',
  content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges'].map((art, i) => ({
    type: 'abschnitt',
    attrs: { art },
    content: i === 0 ? [event(A), event(B), absatz] : [absatz],
  })),
} as unknown as ProtokollDokument;

vi.mock('../kalenderDaten', () => {
  const leer = { data: [], isPending: false, liste: [], aktive: [] };
  return {
    useKalenderEvents: () => leer,
    useEventKategorien: () => leer,
    useVorlagen: () => leer,
    useDienstformen: () => ({ ...leer, nachId: new Map() }),
    vorlageTitel: () => '',
  };
});

describe('Gliederung move in the real ProtokollEditor', () => {
  it('is undone in one step', async () => {
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
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as never;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <MantineProvider>
            <ProtokollEditor
              inhalt={dokument}
              editierbar
              sitzungBeginn="2026-02-11T19:00:00.000Z"
              art="sitzung"
              teilnahme={[]}
            />
          </MantineProvider>
        </QueryClientProvider>,
      );
    });
    const el = host.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null;
    const editor = el?.editor;
    expect(editor).toBeTruthy();
    const vorher = JSON.stringify(editor!.getJSON());
    await act(async () => {
      editor!.view.dispatch(
        bausteinInGliederungVerschieben(editor!.state, A, { abschnitt: 1, index: 0 })!,
      );
    });
    expect(JSON.stringify(editor!.getJSON())).not.toBe(vorher);
    expect(editor!.can().undo()).toBe(true);
    await act(async () => {
      editor!.commands.undo();
    });
    expect(JSON.stringify(editor!.getJSON())).toBe(vorher);
    await act(async () => root.unmount());
  });
});
