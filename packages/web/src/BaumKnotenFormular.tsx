import { Alert, Button, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import { pfad, teilbaumIds } from '@c4/shared';
import { fehlerText } from './warenApi';

export interface BaumKnoten {
  id: string;
  parentId: string | null;
  name: string;
  archiviert: boolean;
}

/** German names of a tree's nodes: `singular`/`plural` (Warengruppe/Warengruppen), `unter` (Untergruppe). */
export interface BaumTexte {
  singular: string;
  plural: string;
  /** Name of a child node, e.g. "Untergruppe". */
  unter: string;
  /** Grammatical gender of `singular`, for "Übergeordnete(r/s) …". */
  genus: 'm' | 'w' | 's';
}

const UEBERGEORDNET = { m: 'Übergeordneter', w: 'Übergeordnete', s: 'Übergeordnetes' } as const;

/** Create or edit (rename, move) a tree node. Mount it only while it should be open. */
export function BaumKnotenFormular({
  knoten,
  parentId,
  alle,
  texte,
  schema,
  speichern: speichernCall,
  invalidieren,
  onClose,
}: Readonly<{
  /** Set when editing. */
  knoten?: BaumKnoten;
  /** Preselected parent of a new node. */
  parentId?: string | null;
  alle: BaumKnoten[];
  texte: BaumTexte;
  schema: {
    safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } };
  };
  speichern: (id: string | null, json: { name: string; parentId: string | null }) => Promise<void>;
  invalidieren: QueryKey;
  onClose: () => void;
}>) {
  const qc = useQueryClient();
  const [name, setName] = useState(knoten?.name ?? '');
  const [parent, setParent] = useState<string | null>(knoten?.parentId ?? parentId ?? null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Never itself or one of its descendants (that would form a cycle); archived ones cannot be chosen.
  const eltern = useMemo(() => {
    const gesperrt = new Set(knoten ? teilbaumIds(alle, knoten.id) : []);
    return alle
      .filter((g) => !gesperrt.has(g.id) && (!g.archiviert || g.id === parent))
      .map((g) => ({ value: g.id, label: pfad(alle, g.id) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [alle, knoten, parent]);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: (json: { name: string; parentId: string | null }) =>
      speichernCall(knoten?.id ?? null, json),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: invalidieren });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = { name, parentId: parent };
    const parsed = schema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error?.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        knoten
          ? `${texte.singular} bearbeiten`
          : parentId
            ? `${texte.unter} anlegen`
            : `${texte.singular} anlegen`
      }
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
            error={fehler}
          />
          <Select
            label={`${UEBERGEORDNET[texte.genus]} ${texte.singular}`}
            placeholder="Keine (oberste Ebene)"
            searchable
            clearable
            inputMode="text"
            nothingFoundMessage={`Keine ${texte.singular} gefunden`}
            data={eltern}
            value={parent}
            onChange={setParent}
          />
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {knoten ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
