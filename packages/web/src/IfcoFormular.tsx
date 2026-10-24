import {
  Alert,
  Button,
  Modal,
  Select,
  Stack,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import { ifcoSchema, ifcoTypText, type IfcoInhaltPosition } from '@c4/shared';
import { useApi } from './api';
import { ifcoPlatzOptionen } from './inventarAnzeige';
import { IfcoInhaltFelder } from './IfcoInhaltFelder';
import { useIfcoInhalt } from './IfcoInhaltModal';
import {
  INVENTAR_KEY,
  type GegenstandEintrag,
  type IfcoEintrag,
  type IfcoTypEintrag,
  type KategorieEintrag,
} from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';
import { PfadSelect } from './PfadSelect';

/**
 * Create or edit an IFCO (name, description, place); creating may fill it right away, with the
 * same Überführung step as "Inhalt bearbeiten". Mount it only while it should be open.
 */
export function IfcoFormular({
  ifco,
  lagerorte,
  ifcos,
  typen,
  gegenstaende = [],
  kategorien = [],
  onClose,
}: Readonly<{
  /** Set when editing. */
  ifco?: IfcoEintrag;
  lagerorte: LagerKnoten[];
  /** All IFCOs and types, to tell where the IFCO fits. */
  ifcos: IfcoEintrag[];
  typen: IfcoTypEintrag[];
  /** Offered as content when creating. */
  gegenstaende?: GegenstandEintrag[];
  kategorien?: KategorieEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(ifco?.name ?? '');
  const [typId, setTypId] = useState<string | null>(ifco?.typId ?? null);
  const [lagerortId, setLagerortId] = useState<string | null>(ifco?.lagerortId ?? null);
  const [beschreibung, setBeschreibung] = useState(ifco?.beschreibung ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const inhalt = useIfcoInhalt(undefined, gegenstaende);

  const optionen = useMemo(
    () => ifcoPlatzOptionen(lagerorte, ifco, typId, ifcos, typen),
    [lagerorte, ifco, typId, ifcos, typen],
  );
  const typOptionen = useMemo(
    () =>
      typen
        .filter((t) => !t.archiviert || t.id === ifco?.typId)
        .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
        .map((t) => ({ value: t.id, label: ifcoTypText(t) })),
    [typen, ifco],
  );

  const speichern = useMutation({
    mutationFn: async (json: {
      name: string;
      beschreibung: string;
      lagerortId: string | null;
      typId: string | null;
      inhalt: IfcoInhaltPosition[];
    }) => {
      const { inhalt: positionen, ...daten } = json;
      if (ifco) {
        await pruefen(
          await api.inventar.ifcos[':id'].$put({ param: { id: ifco.id }, json: daten }),
        );
      } else {
        await pruefen(await api.inventar.ifcos.$post({ json: { ...daten, inhalt: positionen } }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = { name, beschreibung, lagerortId, typId };
    const parsed = ifcoSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    if (ifco) return speichern.mutate({ ...eingabe, inhalt: [] });
    const positionen = inhalt.pruefen();
    if (positionen) speichern.mutate({ ...eingabe, inhalt: positionen });
  };

  return (
    <Modal opened onClose={onClose} title={ifco ? 'IFCO bearbeiten' : 'IFCO anlegen'}>
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
            label="Typ"
            placeholder="Ohne Typ"
            description="Auf einem IFCO-Lagerplatz ist ein Typ nötig."
            searchable
            clearable
            inputMode="text"
            nothingFoundMessage="Kein IFCO-Typ gefunden"
            data={typOptionen}
            value={typId}
            onChange={setTypId}
          />
          <PfadSelect
            label="Platz"
            placeholder="Ohne Platz"
            searchable
            clearable
            inputMode="text"
            nothingFoundMessage="Kein Lagerort gefunden"
            data={optionen}
            value={lagerortId}
            onChange={setLagerortId}
          />
          <Textarea
            label="Beschreibung (optional)"
            autosize
            minRows={2}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.currentTarget.value)}
          />
          {!ifco && (
            <>
              <Title order={4}>Inhalt (optional)</Title>
              <IfcoInhaltFelder
                zeilen={inhalt.zeilen}
                setZeilen={inhalt.setZeilen}
                ifco={undefined}
                gegenstaende={gegenstaende}
                kategorien={kategorien}
                lagerorte={lagerorte}
                ifcos={ifcos}
              />
            </>
          )}
          {inhalt.fehler && <Alert color="red">{inhalt.fehler}</Alert>}
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {ifco ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
