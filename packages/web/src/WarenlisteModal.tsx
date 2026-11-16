import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  type ComboboxItem,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconGripVertical, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvidedDragHandleProps,
  type DropResult,
} from '@hello-pangea/dnd';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { unwrap, useApi } from './api';
import { fehlerText, pruefen } from './warenApi';

interface WareOption {
  id: string;
  name: string;
  aliase: string[];
  archiviert: boolean;
}

function WarenlisteInhalt({
  lagerortId,
  start,
  waren,
  onClose,
}: Readonly<{ lagerortId: string; start: string[]; waren: WareOption[]; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [ids, setIds] = useState(start);
  const [suche, setSuche] = useState('');
  const index = new Map(waren.map((w) => [w.id, w]));

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      pruefen(
        await api.lagerorte[':id'].waren.$put({
          param: { id: lagerortId },
          json: { wareIds: ids },
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lagerort-waren'] });
      onClose();
    },
  });

  const verschieben = ({ source, destination }: DropResult) => {
    if (!destination || destination.index === source.index) return;
    const neu = [...ids];
    const [bewegt] = neu.splice(source.index, 1);
    neu.splice(destination.index, 0, bewegt!);
    setIds(neu);
  };

  const zeile = (
    id: string,
    i: number,
    handleProps: DraggableProvidedDragHandleProps | null | undefined,
    zieht: boolean,
  ) => {
    const ware = index.get(id);
    return (
      <Paper withBorder p={4} pr={4} shadow={zieht ? 'md' : undefined}>
        <Group gap={0} wrap="nowrap">
          <div
            {...handleProps}
            aria-label={`${ware?.name ?? 'Ware'} verschieben`}
            style={{
              width: 42,
              height: 42,
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
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ overflowWrap: 'anywhere' }}>{ware?.name ?? id}</Text>
            {ware?.archiviert && (
              <Badge color="gray" variant="light" w="fit-content">
                Archiviert
              </Badge>
            )}
          </Stack>
          <ActionIcon
            variant="subtle"
            color="red"
            size={42}
            aria-label={`${ware?.name ?? 'Ware'} entfernen`}
            onClick={() => setIds(ids.filter((x) => x !== id))}
          >
            <IconX size={20} />
          </ActionIcon>
        </Group>
      </Paper>
    );
  };

  const auswahl = waren
    .filter((w) => !w.archiviert && !ids.includes(w.id))
    .map((w) => ({ value: w.id, label: w.name }));

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Die Reihenfolge dieser Liste ist die Zählreihenfolge bei der Inventur.
      </Text>
      <Select
        label="Ware hinzufügen"
        placeholder="Name oder Alias suchen"
        searchable
        inputMode="text"
        nothingFoundMessage="Keine Ware gefunden"
        data={auswahl}
        value={null}
        searchValue={suche}
        onSearchChange={setSuche}
        onChange={(id) => {
          if (id) setIds([...ids, id]);
          setSuche('');
        }}
        // Search over the name and the aliases.
        filter={({ options, search }) => {
          const q = search.trim().toLowerCase();
          return (options as ComboboxItem[]).filter(
            (o) =>
              q === '' ||
              o.label.toLowerCase().includes(q) ||
              (index.get(o.value)?.aliase ?? []).some((a) => a.toLowerCase().includes(q)),
          );
        }}
      />
      {ids.length === 0 && <Text c="dimmed">Noch keine Waren in der Liste.</Text>}
      <DragDropContext onDragEnd={verschieben}>
        <Droppable
          droppableId="waren"
          renderClone={(provided, _snapshot, rubric) => {
            const id = ids[rubric.source.index]!;
            // Portal so the clone is not offset by the Modal's transformed/scrolling ancestors.
            return createPortal(
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                style={{ ...provided.draggableProps.style, zIndex: 1000 }}
              >
                {zeile(id, rubric.source.index, provided.dragHandleProps, true)}
              </div>,
              document.body,
            );
          }}
        >
          {(drop) => (
            <Stack gap="xs" ref={drop.innerRef} {...drop.droppableProps}>
              {ids.map((id, i) => (
                <Draggable key={id} draggableId={id} index={i}>
                  {(drag, snapshot) => (
                    <div ref={drag.innerRef} {...drag.draggableProps}>
                      {zeile(id, i, drag.dragHandleProps, snapshot.isDragging)}
                    </div>
                  )}
                </Draggable>
              ))}
              {drop.placeholder}
            </Stack>
          )}
        </Droppable>
      </DragDropContext>
      {speichern.isError && (
        <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
      )}
      <Button loading={speichern.isPending} onClick={() => speichern.mutate()}>
        Speichern
      </Button>
    </Stack>
  );
}

/** Edits the ordered Warenliste of a Lagerort. Mount it only while it should be open. */
export function WarenlisteModal({
  lagerort,
  onClose,
}: Readonly<{ lagerort: { id: string; name: string }; onClose: () => void }>) {
  const api = useApi();
  const klein = useMediaQuery('(max-width: 36em)');
  const liste = useQuery({
    queryKey: ['lagerort-waren', lagerort.id],
    queryFn: async () =>
      unwrap(await api.lagerorte[':id'].waren.$get({ param: { id: lagerort.id } })),
    // Always the latest list, so a stale cache never overwrites a colleague's changes.
    gcTime: 0,
  });
  const waren = useQuery({
    queryKey: ['waren', { archiv: true }],
    queryFn: async () => unwrap(await api.waren.$get({ query: { archiv: '1' } })),
  });

  return (
    <Modal opened onClose={onClose} title={`Warenliste: ${lagerort.name}`} fullScreen={klein}>
      {(liste.isPending || waren.isPending) && <Loader m="md" aria-label="Wird geladen" />}
      {(liste.isError || waren.isError) && (
        <Alert color="red">Die Warenliste konnte nicht geladen werden.</Alert>
      )}
      {liste.data && waren.data && (
        <WarenlisteInhalt
          lagerortId={lagerort.id}
          start={liste.data.wareIds}
          waren={waren.data}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
