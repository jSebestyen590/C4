import { Stack } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvidedDragHandleProps,
  type DropResult,
} from '@hello-pangea/dnd';
import { useId, type ReactNode } from 'react';

/** Grip to drag a row by (44px touch target); the rest of the row stays usable for inputs. */
export function Griff({
  props,
  label,
}: Readonly<{ props: DraggableProvidedDragHandleProps | null | undefined; label: string }>) {
  return (
    <div
      {...props}
      aria-label={label}
      style={{
        width: 44,
        height: 44,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        touchAction: 'none',
        color: 'var(--mantine-color-dimmed)',
      }}
    >
      <IconGripVertical size={20} />
    </div>
  );
}

/** Moves the entry from `von` to `nach`. */
export function umsortieren<T>(liste: readonly T[], von: number, nach: number): T[] {
  const neu = [...liste];
  const [bewegt] = neu.splice(von, 1);
  neu.splice(nach, 0, bewegt!);
  return neu;
}

/** Vertical list whose rows are reordered by dragging their grip (`zeile` places `griff`). */
export function SortierbareListe<T extends { key: string }>({
  eintraege,
  onChange,
  zeile,
  griffLabel = (i) => `Eintrag ${i + 1} verschieben`,
}: Readonly<{
  eintraege: readonly T[];
  onChange: (neu: T[]) => void;
  zeile: (eintrag: T, i: number, griff: ReactNode) => ReactNode;
  /** Accessible name of a row's grip. */
  griffLabel?: (i: number) => string;
}>) {
  const id = useId();
  const ablegen = ({ source, destination }: DropResult) => {
    if (!destination || destination.index === source.index) return;
    onChange(umsortieren(eintraege, source.index, destination.index));
  };
  return (
    <DragDropContext onDragEnd={ablegen}>
      <Droppable droppableId={id}>
        {(drop) => (
          <Stack gap="xs" ref={drop.innerRef} {...drop.droppableProps}>
            {eintraege.map((e, i) => (
              <Draggable key={e.key} draggableId={e.key} index={i}>
                {(drag) => (
                  <div ref={drag.innerRef} {...drag.draggableProps}>
                    {zeile(e, i, <Griff props={drag.dragHandleProps} label={griffLabel(i)} />)}
                  </div>
                )}
              </Draggable>
            ))}
            {drop.placeholder}
          </Stack>
        )}
      </Droppable>
    </DragDropContext>
  );
}
