import {
  Alert,
  Button,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import {
  LAGERORT_ART_LABELS,
  lagerortAnlegenSchema,
  lagerortArtAenderungFehler,
  bodenNamenFehler,
  lagerortArtFehler,
  lagerortSchema,
  type LagerortArt,
} from '@c4/shared';
import { useApi } from './api';
import { BoedenFelder, boedenGesamtFehler, boedenStandard } from './BoedenFelder';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';

export interface LagerortBearbeitung {
  id: string;
  name: string;
  beschreibung: string | null;
  parentId: string | null;
  art: LagerortArt | null;
}

type Wahl = 'normal' | 'regal';

/** Create (below `parentId`) or edit a Lagerort. Mount it only while it should be open. */
export function LagerortFormular({
  lagerort,
  parentId,
  parentPfad,
  alle,
  onClose,
}: Readonly<{
  /** Set when editing. */
  lagerort?: LagerortBearbeitung;
  /** Parent of a new Lagerort; null = top level. */
  parentId?: string | null;
  parentPfad?: string;
  /** All Lagerorte, to check where a Regal is allowed. */
  alle: LagerKnoten[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(lagerort?.name ?? '');
  const [beschreibung, setBeschreibung] = useState(lagerort?.beschreibung ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [wahl, setWahl] = useState<Wahl>(lagerort?.art === 'regal' ? 'regal' : 'normal');
  const [boeden, setBoeden] = useState(() => boedenStandard());

  const eltern = alle.find((l) => l.id === (lagerort ? lagerort.parentId : parentId)) ?? null;
  const istBoden = lagerort?.art === 'regalboden';
  // Why "Regal" cannot be chosen (null = it can); for a new Lagerort only the position counts.
  const regalSperre = lagerort
    ? (lagerortArtAenderungFehler(lagerort, 'regal', alle) ?? lagerortArtFehler('regal', eltern))
    : lagerortArtFehler('regal', eltern);
  const artWaehlbar = regalSperre === null;

  const speichern = useMutation({
    mutationFn: async (json: {
      name: string;
      beschreibung: string;
      parentId: string | null;
      art?: LagerortArt | null;
      boeden?: string[];
    }) => {
      if (lagerort) {
        await pruefen(await api.lagerorte[':id'].$put({ param: { id: lagerort.id }, json }));
      } else {
        await pruefen(await api.lagerorte.$post({ json }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lagerorte'] });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (istBoden) {
      const gleich = bodenNamenFehler(
        [name],
        alle
          .filter((l) => l.parentId === lagerort.parentId && l.id !== lagerort.id)
          .map((l) => l.name),
      )[0];
      if (gleich) return setFehler(gleich);
    }
    const neuesRegal = !lagerort && wahl === 'regal';
    if (neuesRegal) {
      const problem = boedenGesamtFehler(boeden, []);
      if (problem) return setFehler(problem);
    }
    const eingabe = {
      name,
      beschreibung,
      parentId: lagerort ? lagerort.parentId : (parentId ?? null),
      // A Regalboden keeps its kind (omitted); a Lagerort sends the chosen one.
      ...(!istBoden && { art: wahl === 'regal' ? ('regal' as const) : null }),
      ...(neuesRegal && { boeden: boeden.namen.map((n) => n.trim()) }),
    };
    const parsed = (lagerort ? lagerortSchema : lagerortAnlegenSchema).safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  const titel = lagerort
    ? `${LAGERORT_ART_LABELS[lagerort.art ?? 'normal']} bearbeiten`
    : parentId
      ? 'Unterebene anlegen'
      : 'Lager anlegen';

  return (
    <Modal opened onClose={onClose} title={titel}>
      <form onSubmit={onSubmit}>
        <Stack>
          {!lagerort && parentPfad && (
            <Text size="sm" c="dimmed">
              Unterhalb von {parentPfad}
            </Text>
          )}
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
            error={fehler}
          />
          {!istBoden && (lagerort || artWaehlbar) && (
            <Stack gap={4}>
              <SegmentedControl
                fullWidth
                size="md"
                aria-label="Art"
                value={wahl}
                onChange={(v) => setWahl(v as Wahl)}
                styles={{ label: { minHeight: 36, display: 'grid', placeItems: 'center' } }}
                data={[
                  { value: 'normal', label: LAGERORT_ART_LABELS.normal },
                  { value: 'regal', label: LAGERORT_ART_LABELS.regal, disabled: !artWaehlbar },
                ]}
              />
              {!artWaehlbar && regalSperre && (
                <Text size="sm" c="dimmed">
                  Als Regal nicht möglich: {regalSperre}
                </Text>
              )}
              {lagerort && lagerort.art === 'regal' && wahl === 'normal' && (
                <Text size="sm" c="dimmed">
                  Die Regalböden werden zu normalen Lagerorten.
                </Text>
              )}
              {lagerort && lagerort.art !== 'regal' && wahl === 'regal' && (
                <Text size="sm" c="dimmed">
                  Die Unterebenen werden zu Regalböden.
                </Text>
              )}
            </Stack>
          )}
          {!lagerort && wahl === 'regal' && <BoedenFelder wert={boeden} onChange={setBoeden} />}
          <Textarea
            label="Beschreibung (optional)"
            autosize
            minRows={2}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.currentTarget.value)}
          />
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {lagerort ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
