import { Alert, Button, Modal, Stack } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ausleiheAendernSchema } from '@c4/shared';
import { useApi } from './api';
import { AusleiheKopfFelder, type AusleiheKopf } from './AusleiheKopfFelder';
import { zeitpunktIso } from './BuchungsFuss';
import { isoZuLokal } from './inventarAnzeige';
import { INVENTAR_KEY, type AusleiheEintrag } from './inventarDaten';
import { fehlerText, pruefen } from './warenApi';

/** Edits to whom, organiser, when, planned return and Kommentar of an Ausleihe. Mount it only while it should be open. */
export function AusleiheBearbeitenModal({
  ausleihe,
  onClose,
}: Readonly<{ ausleihe: AusleiheEintrag; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [kopf, setKopf] = useState<AusleiheKopf>({
    an: ausleihe.an,
    organisiertVon: ausleihe.organisator?.sub ?? ausleihe.organisiertVon ?? '',
    zeitpunkt: isoZuLokal(ausleihe.ausgeliehenAm),
    rueckgabe: ausleihe.rueckgabeGeplant ?? '',
    kommentar: ausleihe.kommentar ?? '',
  });
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: async (json: ReturnType<typeof ausleiheAendernSchema.parse>) =>
      pruefen(await api.inventar.ausleihen[':id'].$put({ param: { id: ausleihe.id }, json })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  const onSpeichern = () => {
    const iso = zeitpunktIso(kopf.zeitpunkt);
    if (!iso) return setFehler('Ungültiger Zeitpunkt.');
    const geprueft = ausleiheAendernSchema.safeParse({
      an: kopf.an,
      organisiertVon: kopf.organisiertVon,
      ausgeliehenAm: iso,
      rueckgabeGeplant: kopf.rueckgabe || null,
      kommentar: kopf.kommentar,
    });
    if (!geprueft.success)
      return setFehler(geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(geprueft.data);
  };

  return (
    <Modal opened onClose={onClose} title="Ausleihe bearbeiten">
      <Stack>
        <AusleiheKopfFelder
          kopf={kopf}
          onChange={(t) => setKopf((k) => ({ ...k, ...t }))}
          autofocus
        />
        {fehler && <Alert color="red">{fehler}</Alert>}
        {speichern.isError && (
          <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
        )}
        <Button loading={speichern.isPending} onClick={onSpeichern}>
          Speichern
        </Button>
      </Stack>
    </Modal>
  );
}
