import { Alert, Button, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { type KasseDto } from '@c4/shared';
import { useApi } from './api';
import { faecherAus, mengenStueckelung, type Mengen } from './bargeldFormular';
import { finanzenKeys, useKonten } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { FeldLabel } from './InfoHinweis';
import { grundbestandMengen } from './kassenFormular';
import { StueckelungFeld } from './StueckelungFeld';
import { fehlerText, pruefen } from './warenApi';

/**
 * Create a Kasse (a new Fach of the Safe) or edit its Grundbestand and default accounts. The name
 * is only asked when creating (later changes go through the Kontenplan). Mount it only while it
 * should be open.
 */
export function KasseFormular({
  kasse,
  onClose,
}: Readonly<{
  /** Set when editing. */
  kasse?: KasseDto;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const konten = useKonten(false);
  const [name, setName] = useState(kasse?.name ?? '');
  const [grund, setGrund] = useState<Mengen>(grundbestandMengen(kasse?.grundbestand ?? []));
  const [erloes, setErloes] = useState<string | null>(kasse?.standardErloesKonto.id ?? null);
  const [ziel, setZiel] = useState<string | null>(kasse?.standardZielFach.id ?? null);
  const [versucht, setVersucht] = useState(false);

  const alle = konten.data ?? [];
  const eltern = new Set(alle.map((k) => k.parentId));
  const erloesOptionen = alle
    .filter((k) => k.art === 'erloes' && !eltern.has(k.id))
    .map((k) => ({ value: k.id, label: k.name }));
  const zielOptionen = faecherAus(alle)
    .filter((k) => k.id !== kasse?.kontoId)
    .map((k) => ({ value: k.id, label: k.name }));

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const json = {
        grundbestand: mengenStueckelung(grund),
        standardErloesKontoId: erloes ?? '',
        standardZielFachId: ziel ?? '',
      };
      return pruefen(
        kasse
          ? await api.finanzen.kassen[':kontoId'].$put({
              param: { kontoId: kasse.kontoId },
              json: { name: name.trim(), ...json },
            })
          : await api.finanzen.kassen.$post({ json: { name: name.trim(), ...json } }),
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setVersucht(true);
    if (name.trim() === '' || !erloes || !ziel) return;
    speichern.mutate();
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={kasse ? `Kasse „${kasse.name}“ bearbeiten` : 'Kasse anlegen'}
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {
            <TextInput
              label={<FeldLabel text="Name" hilfe={HILFE.kassen.kasse} />}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              maxLength={100}
              error={versucht && name.trim() === '' ? 'Bitte gib einen Namen ein.' : undefined}
              data-autofocus
            />
          }
          <Stack gap={4}>
            <FeldLabel text="Grundbestand" hilfe={HILFE.kassen.grundbestand} />
            <StueckelungFeld
              label="Grundbestand der Kasse"
              value={grund}
              onChange={setGrund}
              disabled={speichern.isPending}
            />
          </Stack>
          <Select
            label={<FeldLabel text="Standard-Erlöskonto" hilfe={HILFE.kassen.erloeskonto} />}
            placeholder="Erlöskonto suchen"
            searchable
            data={erloesOptionen}
            value={erloes}
            onChange={setErloes}
            nothingFoundMessage="Kein Erlöskonto gefunden"
            error={versucht && !erloes ? 'Bitte wähle ein Erlöskonto.' : undefined}
          />
          <Select
            label={<FeldLabel text="Standard-Ziel-Fach" hilfe={HILFE.kassen.zielFach} />}
            placeholder="Fach suchen"
            searchable
            data={zielOptionen}
            value={ziel}
            onChange={setZiel}
            nothingFoundMessage="Kein Fach gefunden"
            error={versucht && !ziel ? 'Bitte wähle ein Ziel-Fach.' : undefined}
          />
          {!kasse && (
            <Text size="sm" c="dimmed">
              Die Kasse entsteht als neues Fach im Safe. Gefüllt wird sie danach mit einer Umbuchung
              unter „Bargeld“.
            </Text>
          )}
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {kasse ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
