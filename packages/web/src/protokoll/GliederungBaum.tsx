import { Box, Text, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type BeforeCapture,
  type DraggableProvided,
  type DraggableStateSnapshot,
  type DropResult,
} from '@hello-pangea/dnd';
import { useEditorState, type Editor } from '@tiptap/react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Griff } from '../SortierbareListe';
import {
  bausteinInGliederungVerschieben,
  findeBaustein,
  gliederungBauen,
  gliederungZeilen,
  gliederungZiel,
  type GliederungEintrag,
  type GliederungZeile,
} from './gliederung';
import { BAUSTEIN_SYMBOL, SlashIcon } from './symbole';

/** Space above the editor content that the sticky app header and toolbar cover. */
const SCROLL_ABSTAND = 136;

/** Scrolls the editor to the Baustein `id`. */
export function zuBausteinScrollen(editor: Editor, id: string): void {
  const fund = findeBaustein(editor.state.doc, id);
  if (!fund) return;
  const el = editor.view.nodeDOM(fund.pos);
  if (!(el instanceof HTMLElement)) return;
  el.style.scrollMarginTop = `${SCROLL_ABSTAND}px`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const platzhalterStil = (aktiv: boolean): CSSProperties => ({
  minHeight: 44,
  paddingInline: 'var(--mantine-spacing-sm)',
  display: 'flex',
  alignItems: 'center',
  border: `1px dashed ${aktiv ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-default-border)'}`,
  borderRadius: 'var(--mantine-radius-sm)',
  background: aktiv ? 'var(--mantine-primary-color-light)' : undefined,
});

const ziehStil = (stil: CSSProperties | undefined, zieht: boolean): CSSProperties => ({
  ...stil,
  background: zieht ? 'var(--mantine-color-body)' : undefined,
  boxShadow: zieht ? 'var(--mantine-shadow-md)' : undefined,
  borderRadius: 'var(--mantine-radius-sm)',
});

/**
 * Outline of the minutes: the Bausteine per section, nested ones indented below their parent. A tap
 * scrolls the editor to the Baustein; the grip moves it (between sections, into and out of notes).
 */
export function Gliederung({
  editor,
  personName,
  onGewaehlt,
}: Readonly<{
  editor: Editor;
  /** Name shown for a person (`sub`). */
  personName: (sub: string) => string | undefined;
  /** Called after an entry was chosen (the drawer closes). */
  onGewaehlt?: () => void;
}>) {
  const doc = useEditorState({ editor, selector: (s) => s.editor.state.doc });
  const baum = useMemo(() => gliederungBauen(doc, personName), [doc, personName]);
  // Id of the Baustein being dragged: it decides which rows exist (notes slots, hidden nested rows).
  const [gezogenId, setGezogenId] = useState<string | null>(null);
  const zeilen = useMemo(() => gliederungZeilen(baum, gezogenId), [baum, gezogenId]);

  // Set before pangea measures the list, so the rows of the drag are the ones that get measured.
  const vorErfassen = (s: BeforeCapture) => setGezogenId(s.draggableId);
  const ende = ({ draggableId, destination }: DropResult) => {
    try {
      if (!destination) return;
      const ziel = gliederungZiel(zeilen, draggableId, destination.index);
      if (!ziel) return;
      const tr = bausteinInGliederungVerschieben(editor.state, draggableId, ziel);
      if (tr) editor.view.dispatch(tr);
    } catch (fehler) {
      console.error('Gliederung: Verschieben fehlgeschlagen', fehler);
      notifications.show({ color: 'red', message: 'Verschieben hat nicht geklappt.' });
    } finally {
      setGezogenId(null);
    }
  };
  const waehlen = (id: string) => {
    onGewaehlt?.();
    // Wait until the drawer has closed and released the page scroll.
    setTimeout(() => zuBausteinScrollen(editor, id), onGewaehlt ? 300 : 0);
  };

  const eintragZeile = (e: GliederungEintrag, griff: ReactNode) => (
    <Box style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      {griff}
      <UnstyledButton
        onClick={() => waehlen(e.id)}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--mantine-spacing-xs)',
        }}
      >
        <Box component="span" c="dimmed" style={{ display: 'flex', flexShrink: 0 }}>
          <SlashIcon symbol={BAUSTEIN_SYMBOL[e.typ]} size={18} />
        </Box>
        <Text size="sm" truncate style={{ minWidth: 0 }}>
          {e.titel}
        </Text>
      </UnstyledButton>
    </Box>
  );

  const inhalt = (
    z: GliederungZeile,
    drag: DraggableProvided,
    dragSnap: DraggableStateSnapshot,
  ): ReactNode => {
    switch (z.art) {
      case 'abschnitt':
        return (
          <Text
            fw={700}
            size="sm"
            mt={z.abschnitt === 0 ? 0 : 'sm'}
            mb={4}
            {...drag.dragHandleProps}
          >
            {z.titel}
          </Text>
        );
      case 'notizen':
        return (
          <div {...drag.dragHandleProps} style={{ marginLeft: 28 }}>
            <div style={platzhalterStil(false)}>
              <Text size="xs" c="dimmed">
                In die Notizen
              </Text>
            </div>
          </div>
        );
      case 'baustein':
      case 'kind': {
        const e = z.eintrag;
        return (
          <div
            style={{
              ...ziehStil(undefined, dragSnap.isDragging),
              marginLeft: z.art === 'kind' ? 28 : 0,
            }}
          >
            {eintragZeile(
              e,
              <Griff props={drag.dragHandleProps} label={`${e.titel} verschieben`} />,
            )}
          </div>
        );
      }
    }
  };

  return (
    <DragDropContext onBeforeCapture={vorErfassen} onDragEnd={ende}>
      <nav aria-label="Gliederung">
        <Droppable droppableId="gliederung">
          {(drop) => (
            <div ref={drop.innerRef} {...drop.droppableProps}>
              {zeilen.map((z, i) => (
                <Draggable
                  key={z.key}
                  draggableId={z.key}
                  index={i}
                  isDragDisabled={z.art === 'abschnitt' || z.art === 'notizen'}
                >
                  {(drag, dragSnap) => (
                    <div ref={drag.innerRef} {...drag.draggableProps}>
                      {inhalt(z, drag, dragSnap)}
                    </div>
                  )}
                </Draggable>
              ))}
              {drop.placeholder}
            </div>
          )}
        </Droppable>
      </nav>
    </DragDropContext>
  );
}
