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
  ifcoPlatzMarkierenFehler,
  lagerortArtFehler,
  lagerortSchema,
  type IfcoPlatzMasse,
  type LagerortArt,
} from '@c4/shared';
import { useApi } from './api';
import { BoedenFelder, boedenGesamtFehler, boedenStandard } from './BoedenFelder';
import {
  IfcoPlatzFelder,
  boedenPlatzErgebnis,
  ifcoPlatzErgebnis,
  ifcoPlatzStandard,
  type IfcoPlatzWert,
} from './IfcoPlatzFelder';
import { ifcoPlatzMasse } from './ifcoPlatz';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';

export interface LagerortBearbeitung {
  id: string;
  name: string;
  beschreibung: string | null;
  parentId: string | null;
  art: LagerortArt | null;
  ifcoHoeheCm: number | null;
  ifcoStellflaechen: number | null;
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
  const [ifcoPlatz, setIfcoPlatz] = useState<IfcoPlatzWert>(() =>
    ifcoPlatzStandard(lagerort && ifcoPlatzMasse(lagerort)),
  );
  const [bodenIfcoPlatz, setBodenIfcoPlatz] = useState<IfcoPlatzWert>(() => ifcoPlatzStandard());

  const eltern = alle.find((l) => l.id === (lagerort ? lagerort.parentId : parentId)) ?? null;
  const istBoden = lagerort?.art === 'regalboden';
  // Why "Regal" cannot be chosen (null = it can); for a new Lagerort only the position counts.
  const regalSperre = lagerort
    ? (lagerortArtAenderungFehler(lagerort, 'regal', alle) ?? lagerortArtFehler('regal', eltern))
    : lagerortArtFehler('regal', eltern);
  const artWaehlbar = regalSperre === null;
  // An IFCO-Lagerplatz is a place without children that is not a Regal itself.
  const kinderAnzahl = lagerort ? alle.filter((l) => l.parentId === lagerort.id).length : 0;
  const ifcoSperre = ifcoPlatzMarkierenFehler(lagerort?.art ?? null, kinderAnzahl);

  const speichern = useMutation({
    mutationFn: async (json: {
      name: string;
      beschreibung: string;
      parentId: string | null;
      art?: LagerortArt | null;
      boeden?: string[];
      ifcoPlatz?: { hoeheCm: number; stellflaechen: number } | null;
      boedenIfcoPlatz?: IfcoPlatzMasse | IfcoPlatzMasse[] | null;
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
    const platz = ifcoPlatzErgebnis(ifcoPlatz);
    const boedenPlatz = boedenPlatzErgebnis(
      bodenIfcoPlatz,
      Number(boeden.reihen),
      Number(boeden.plaetze),
    );
    if (typeof platz === 'string' && wahl === 'normal') return setFehler(platz);
    if (typeof boedenPlatz === 'string' && neuesRegal) return setFehler(boedenPlatz);
    const eingabe = {
      name,
      beschreibung,
      parentId: lagerort ? lagerort.parentId : (parentId ?? null),
      // A Regalboden keeps its kind (omitted); a Lagerort sends the chosen one.
      ...(!istBoden && { art: wahl === 'regal' ? ('regal' as const) : null }),
      ...(neuesRegal && {
        boeden: boeden.namen.map((n) => n.trim()),
        boedenIfcoPlatz: typeof boedenPlatz === 'string' ? null : boedenPlatz,
      }),
      // A Regal is never an IFCO-Lagerplatz itself; a plain place sends its choice (null = normal).
      ...(wahl === 'normal' && { ifcoPlatz: typeof platz === 'string' ? null : platz }),
      ...(wahl === 'regal' && lagerort && { ifcoPlatz: null }),
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
          {!lagerort && wahl === 'regal' && (
            <>
              <BoedenFelder wert={boeden} onChange={setBoeden} />
              <IfcoPlatzFelder
                wert={bodenIfcoPlatz}
                onChange={setBodenIfcoPlatz}
                label="Als IFCO-Lagerplätze anlegen"
                beschreibung="Alle neuen Böden werden IFCO-Lagerplätze; bei mehreren Reihen hat jede Reihe ihre eigene Höhe."
                reihen={Number(boeden.reihen) || 1}
              />
            </>
          )}
          {wahl === 'normal' && (
            <IfcoPlatzFelder
              wert={ifcoPlatz}
              onChange={setIfcoPlatz}
              gesperrt={lagerort ? ifcoSperre : null}
            />
          )}
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
