import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { centAnzeigen, type RechnungDetailDto, type RechnungStornoErgebnisDto } from '@c4/shared';
import { useApi } from './api';
import { schluesselFuer } from './buchungFormular';
import { jsonOderFehler } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { fehlerText } from './warenApi';

/**
 * Cancels an unpaid Rechnung with a Stornorechnung (own number, negative amounts, reason). Shows what
 * will happen first; `onErledigt` gets the new Stornorechnung. Mount it only while it is open.
 */
export function RechnungStornoDialog({
  rechnung,
  onErledigt,
  onClose,
}: Readonly<{
  rechnung: RechnungDetailDto;
  onErledigt: (ergebnis: RechnungStornoErgebnisDto) => Promise<void>;
  onClose: () => void;
}>) {
  const api = useApi();
  const [begruendung, setBegruendung] = useState('');
  const [versucht, setVersucht] = useState(false);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);
  const fehlt = begruendung.trim() === '';

  const stornieren = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      schluessel.current = schluesselFuer(schluessel.current, begruendung.trim(), () =>
        crypto.randomUUID(),
      );
      return jsonOderFehler<RechnungStornoErgebnisDto>(
        await api.finanzen.rechnungen[':id'].storno.$post({
          param: { id: rechnung.id },
          json: {
            idempotenzSchluessel: schluessel.current.schluessel,
            begruendung: begruendung.trim(),
          },
        }),
      );
    },
    onSuccess: (ergebnis) => onErledigt(ergebnis),
  });

  return (
    <Modal
      opened
      onClose={stornieren.isPending ? () => undefined : onClose}
      title={`Stornorechnung zu ${rechnung.nummer}`}
      size="lg"
    >
      <Stack>
        <Text>
          Es entsteht eine Stornorechnung mit eigener Nummer über{' '}
          <b>{centAnzeigen(-rechnung.bruttoCent)}</b>, die auf die Rechnung {rechnung.nummer}{' '}
          verweist. Die Forderung wird dabei storniert. Das lässt sich nicht rückgängig machen.
        </Text>
        <Text size="sm" c="dimmed">
          {HILFE.rechnungen.storno}
        </Text>
        <Textarea
          label="Begründung"
          description="Steht auf der Stornorechnung."
          autosize
          minRows={2}
          maxLength={500}
          value={begruendung}
          onChange={(e) => setBegruendung(e.currentTarget.value)}
          error={
            versucht && fehlt ? 'Bitte gib eine Begründung für die Stornorechnung an.' : undefined
          }
          data-autofocus
        />
        {stornieren.isError && (
          <Alert color="red">
            {fehlerText(stornieren.error, 'Das Stornieren ist fehlgeschlagen.')}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={stornieren.isPending}>
            Abbrechen
          </Button>
          <Button
            color="red"
            loading={stornieren.isPending}
            onClick={() => {
              setVersucht(true);
              if (!fehlt) stornieren.mutate();
            }}
          >
            Stornorechnung erstellen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
