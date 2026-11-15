import {
  Alert,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import {
  EINHEITEN,
  VERPACKUNGSEINHEITEN,
  gebindeBezeichnung,
  gebindeFehler,
  gebindeSchema,
  gebindeSortieren,
  type Einheit,
  type Gebinde,
  type GebindeDaten,
  type Verpackungseinheit,
} from '@c4/shared';
import { useApi } from './api';
import { EINHEIT_LABELS, VERPACKUNGSEINHEIT_LABELS } from './i18n';
import { fehlerText, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

export type GebindeEintrag = Gebinde & { archiviert: boolean };

type Art = 'einzel' | 'ober';

const EINHEIT_DATEN = EINHEITEN.map((e) => ({ value: e, label: EINHEIT_LABELS[e] }));
const VERPACKUNG_DATEN = VERPACKUNGSEINHEITEN.map((v) => ({
  value: v,
  label: VERPACKUNGSEINHEIT_LABELS[v].einzahl,
}));

const zahl = (v: number | string): number | null => (v === '' ? null : Number(v));

/** Create or edit a Gebinde. Mount it only while it should be open. */
export function GebindeFormular({
  gebinde,
  alle,
  onClose,
}: Readonly<{
  /** Set when editing. */
  gebinde?: GebindeEintrag;
  alle: GebindeEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [art, setArt] = useState<Art>(gebinde?.unterGebindeId ? 'ober' : 'einzel');
  const [menge, setMenge] = useState<number | string>(gebinde?.menge ?? '');
  const [einheit, setEinheit] = useState<string | null>(gebinde?.einheit ?? null);
  const [verpackung, setVerpackung] = useState<string | null>(gebinde?.verpackungseinheit ?? null);
  const [pfand, setPfand] = useState<number | string>(
    gebinde?.pfandCent == null ? '' : gebinde.pfandCent / 100,
  );
  const [unterId, setUnterId] = useState<string | null>(gebinde?.unterGebindeId ?? null);
  const [anzahl, setAnzahl] = useState<number | string>(gebinde?.unterAnzahl ?? '');
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (json: GebindeDaten) => {
      if (gebinde) {
        await pruefen(await api.gebinde[':id'].$put({ param: { id: gebinde.id }, json }));
      } else {
        await pruefen(await api.gebinde.$post({ json }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['gebinde'] });
      onClose();
    },
  });

  const eingabe = () => ({
    menge: art === 'einzel' ? zahl(menge) : null,
    einheit: art === 'einzel' ? (einheit as Einheit | null) : null,
    verpackungseinheit: verpackung as Verpackungseinheit,
    pfandCent: pfand === '' ? null : Math.round(Number(pfand) * 100),
    unterGebindeId: art === 'ober' ? unterId : null,
    unterAnzahl: art === 'ober' ? zahl(anzahl) : null,
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = gebindeSchema.safeParse(eingabe());
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    const regel = gebindeFehler({ id: gebinde?.id, ...parsed.data }, alle);
    if (regel) return setFehler(regel);
    setFehler(null);
    speichern.mutate(parsed.data);
  };

  // Only Basisgebinde (without Untergebinde of their own) that are in use can be contained.
  // The full name (with deposit) tells e.g. 0,5l Flasche 0,08 € and 0,15 € apart.
  const kandidaten = gebindeSortieren(
    alle.filter((g) => g.id !== gebinde?.id && g.unterGebindeId === null && !g.archiviert),
    alle,
  ).map((g) => ({ value: g.id, label: gebindeBezeichnung(g, alle) }));

  const vorschau = (() => {
    const e = eingabe();
    const parsed = gebindeSchema.safeParse(e);
    if (!parsed.success) return null;
    const kandidat: Gebinde = { id: gebinde?.id ?? 'neu', ...parsed.data };
    return gebindeBezeichnung(kandidat, [...alle.filter((g) => g.id !== kandidat.id), kandidat]);
  })();

  return (
    <Modal opened onClose={onClose} title={gebinde ? 'Gebinde bearbeiten' : 'Gebinde anlegen'}>
      <form onSubmit={onSubmit}>
        <Stack>
          <SegmentedControl
            fullWidth
            size="md"
            value={art}
            onChange={(v) => setArt(v as Art)}
            data={[
              { value: 'einzel', label: 'Einzelgebinde' },
              { value: 'ober', label: 'Mit Untergebinde' },
            ]}
          />
          {art === 'einzel' ? (
            <SimpleGrid cols={2}>
              <ZahlFeld
                label="Menge"
                placeholder="0,5"
                decimalSeparator=","
                thousandSeparator="."
                decimalScale={3}
                min={0}
                allowNegative={false}
                inputMode="decimal"
                value={menge}
                onChange={setMenge}
                data-autofocus
              />
              <Select
                label="Einheit"
                placeholder="Wählen"
                data={EINHEIT_DATEN}
                value={einheit}
                onChange={setEinheit}
                allowDeselect={false}
              />
            </SimpleGrid>
          ) : (
            <>
              <Select
                label="Untergebinde"
                description="Was dieses Gebinde enthält, z. B. Flaschen in einem Kasten."
                placeholder="Wählen"
                data={kandidaten}
                value={unterId}
                onChange={setUnterId}
                allowDeselect={false}
                searchable
                nothingFoundMessage="Kein Einzelgebinde vorhanden."
              />
              <ZahlFeld
                label="Anzahl Untergebinde"
                allowDecimal={false}
                allowNegative={false}
                min={2}
                inputMode="numeric"
                value={anzahl}
                onChange={setAnzahl}
              />
            </>
          )}
          <Select
            label="Verpackungseinheit"
            placeholder="Wählen"
            data={VERPACKUNG_DATEN}
            value={verpackung}
            onChange={setVerpackung}
            allowDeselect={false}
          />
          <ZahlFeld
            label={
              art === 'ober' ? 'Pfand der Verpackung in € (optional)' : 'Pfand in € (optional)'
            }
            description="Leer lassen, wenn es kein Pfand gibt."
            decimalSeparator=","
            thousandSeparator="."
            decimalScale={2}
            min={0}
            allowNegative={false}
            inputMode="decimal"
            suffix=" €"
            value={pfand}
            onChange={setPfand}
          />
          <Group gap="xs" wrap="nowrap" align="baseline">
            <Text size="sm" c="dimmed">
              Bezeichnung:
            </Text>
            <Text fw={600} style={{ overflowWrap: 'anywhere' }} aria-live="polite">
              {vorschau ?? '–'}
            </Text>
          </Group>
          {fehler && <Alert color="red">{fehler}</Alert>}
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {gebinde ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
