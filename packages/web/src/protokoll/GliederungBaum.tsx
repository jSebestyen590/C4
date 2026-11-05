import { Box, Text, UnstyledButton } from '@mantine/core';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DragStart,
  type DropResult,
} from '@hello-pangea/dnd';
import { useEditorState, type Editor } from '@tiptap/react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Griff } from '../SortierbareListe';
import {
  abschnittDroppableId,
  bausteinInGliederungVerschieben,
  findeBaustein,
  gliederungBauen,
  notizenDroppableId,
  zielVonDroppable,
  type GliederungEintrag,
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
  // The Baustein being dragged: decides where it may be dropped.
  const [gezogen, setGezogen] = useState<GliederungEintrag | null>(null);

  const start = (s: DragStart) =>
    setGezogen(
      baum
        .flatMap((a) => a.eintraege.flatMap((e) => [e, ...e.kinder]))
        .find((e) => e.id === s.draggableId) ?? null,
    );
  const ende = ({ draggableId, destination }: DropResult) => {
    setGezogen(null);
    if (!destination) return;
    const ziel = zielVonDroppable(destination.droppableId, destination.index);
    if (!ziel) return;
    const tr = bausteinInGliederungVerschieben(editor.state, draggableId, ziel);
    if (tr) editor.view.dispatch(tr);
  };
  const waehlen = (id: string) => {
    onGewaehlt?.();
    // Wait until the drawer has closed and released the page scroll.
    setTimeout(() => zuBausteinScrollen(editor, id), onGewaehlt ? 300 : 0);
  };

  const zeile = (e: GliederungEintrag, griff: ReactNode) => (
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

  return (
    <DragDropContext onDragStart={start} onDragEnd={ende}>
      <nav aria-label="Gliederung">
        {baum.map((abschnitt, i) => (
          <Box key={abschnitt.art} mb="sm">
            <Text fw={700} size="sm" mb={4}>
              {abschnitt.titel}
            </Text>
            <Droppable droppableId={abschnittDroppableId(i)}>
              {(drop, snap) => (
                <div
                  ref={drop.innerRef}
                  {...drop.droppableProps}
                  style={
                    abschnitt.eintraege.length === 0 && gezogen
                      ? platzhalterStil(snap.isDraggingOver)
                      : { minHeight: 8 }
                  }
                >
                  {abschnitt.eintraege.map((e, j) => (
                    <Draggable key={e.id} draggableId={e.id} index={j}>
                      {(drag, dragSnap) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          style={ziehStil(drag.draggableProps.style, dragSnap.isDragging)}
                        >
                          {zeile(
                            e,
                            <Griff props={drag.dragHandleProps} label={`${e.titel} verschieben`} />,
                          )}
                          {(e.kinder.length > 0 ||
                            (gezogen?.verschachtelbar && e.kannEnthalten)) && (
                            <Droppable
                              droppableId={notizenDroppableId(e.id)}
                              isDropDisabled={!gezogen?.verschachtelbar || !e.kannEnthalten}
                            >
                              {(innen, innenSnap) => (
                                <div
                                  ref={innen.innerRef}
                                  {...innen.droppableProps}
                                  style={{
                                    marginLeft: 28,
                                    ...(e.kinder.length === 0
                                      ? platzhalterStil(innenSnap.isDraggingOver)
                                      : undefined),
                                  }}
                                >
                                  {e.kinder.map((k, n) => (
                                    <Draggable key={k.id} draggableId={k.id} index={n}>
                                      {(kd, kdSnap) => (
                                        <div
                                          ref={kd.innerRef}
                                          {...kd.draggableProps}
                                          style={ziehStil(
                                            kd.draggableProps.style,
                                            kdSnap.isDragging,
                                          )}
                                        >
                                          {zeile(
                                            k,
                                            <Griff
                                              props={kd.dragHandleProps}
                                              label={`${k.titel} verschieben`}
                                            />,
                                          )}
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {innen.placeholder}
                                  {e.kinder.length === 0 && (
                                    <Text size="xs" c="dimmed">
                                      In die Notizen
                                    </Text>
                                  )}
                                </div>
                              )}
                            </Droppable>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {drop.placeholder}
                  {abschnitt.eintraege.length === 0 && (
                    <Text size="xs" c="dimmed">
                      {gezogen ? 'Hier ablegen' : 'Keine Bausteine'}
                    </Text>
                  )}
                </div>
              )}
            </Droppable>
          </Box>
        ))}
      </nav>
    </DragDropContext>
  );
}
