import {
  Alert,
  Anchor,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  KOMMENTAR_MAX,
  externeEingabeSchema,
  type DienstformDto,
  type SchichtDto,
} from '@c4/shared';
import { useApi } from './api';
import { kalenderInvalidieren, useExterne } from './kalenderDaten';
import { mitgliedOptionen, useMitgliederListe } from './organisator';
import { fehlerText, pruefen } from './warenApi';

export type EintragModus = 'selbst' | 'extern' | 'mitglied';

const TITEL: Record<EintragModus, string> = {
  selbst: 'Eintragen',
  extern: 'Externe Person eintragen',
  mitglied: 'Mitglied eintragen',
};

/** Choose a Dienstform (limited to the Bedarfe of the Schicht), a comment and, if needed, who. */
export function DienstEintragenModal({
  schicht,
  modus,
  dienstformen,
  onClose,
}: Readonly<{
  schicht: SchichtDto;
  modus: EintragModus;
  dienstformen: Map<string, DienstformDto>;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const optionen = schicht.bedarfe.map((b) => ({
    value: b.dienstformId,
    label: dienstformen.get(b.dienstformId)?.name ?? 'Dienst',
  }));
  const [dienstformId, setDienstformId] = useState<string | null>(
    optionen.length === 1 ? optionen[0]!.value : null,
  );
  const [kommentar, setKommentar] = useState('');
  const [mitgliedSub, setMitgliedSub] = useState<string | null>(null);
  const [externId, setExternId] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const [neuWerte, setNeuWerte] = useState({ name: '', quelle: '', kontakt: '' });
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const externe = useExterne();
  const mitglieder = useMitgliederListe();
  const bereitsEingetragen = new Set(
    schicht.dienste.flatMap((d) => (d.person.art === 'mitglied' ? [d.person.sub] : [])),
  );
  const bereitsExtern = new Set(
    schicht.dienste.flatMap((d) => (d.person.art === 'extern' ? [d.person.id] : [])),
  );

  const absenden = async () => {
    if (!dienstformId) return setFehler('Bitte wähle eine Dienstform.');
    if (modus === 'mitglied' && !mitgliedSub) return setFehler('Bitte wähle ein Mitglied.');
    if (modus === 'extern' && !neu && !externId) return setFehler('Bitte wähle eine Person.');
    setFehler(null);
    setLaeuft(true);
    try {
      let extern = externId;
      if (modus === 'extern' && neu) {
        const geprueft = externeEingabeSchema.safeParse(neuWerte);
        if (!geprueft.success) {
          return setFehler(geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.');
        }
        const res = await api.kalender.externe.$post({ json: neuWerte });
        await pruefen(res);
        extern = ((await res.json()) as { id: string }).id;
      }
      await pruefen(
        await api.kalender.schichten[':id'].dienste.$post({
          param: { id: schicht.id },
          json: {
            dienstformId,
            kommentar,
            ...(modus === 'mitglied' ? { mitgliedSub: mitgliedSub! } : {}),
            ...(modus === 'extern' ? { externId: extern! } : {}),
          },
        }),
      );
      await kalenderInvalidieren(qc);
      onClose();
    } catch (e) {
      setFehler(fehlerText(e, 'Der Eintrag war nicht möglich.'));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={`${TITEL[modus]}: ${schicht.name}`}>
      <Stack>
        {modus === 'mitglied' && (
          <Select
            label="Mitglied"
            placeholder="Mitglied wählen"
            searchable
            data={mitgliedOptionen(
              (mitglieder.data ?? []).filter((m) => !bereitsEingetragen.has(m.sub)),
            )}
            value={mitgliedSub}
            onChange={setMitgliedSub}
            nothingFoundMessage="Niemand gefunden"
          />
        )}
        {modus === 'extern' &&
          (neu ? (
            <Stack gap="xs">
              <Text fw={600}>Neue externe Person</Text>
              <TextInput
                label="Name"
                value={neuWerte.name}
                onChange={(e) => setNeuWerte({ ...neuWerte, name: e.currentTarget.value })}
              />
              <TextInput
                label="Quelle"
                description="Woher kennst du die Person? z. B. „Freund:in von X“ oder „StuK“"
                value={neuWerte.quelle}
                onChange={(e) => setNeuWerte({ ...neuWerte, quelle: e.currentTarget.value })}
              />
              <TextInput
                label="Kontakt"
                description="Optional, z. B. Telefonnummer"
                value={neuWerte.kontakt}
                onChange={(e) => setNeuWerte({ ...neuWerte, kontakt: e.currentTarget.value })}
              />
              <Anchor
                component="button"
                type="button"
                size="sm"
                ta="left"
                onClick={() => setNeu(false)}
              >
                Doch eine bekannte Person wählen
              </Anchor>
            </Stack>
          ) : (
            <Stack gap="xs">
              <Select
                label="Externe Person"
                placeholder="Person wählen"
                searchable
                data={(externe.data ?? [])
                  .filter((e) => !bereitsExtern.has(e.id))
                  .map((e) => ({
                    value: e.id,
                    label: e.quelle ? `${e.name} (${e.quelle})` : e.name,
                  }))}
                value={externId}
                onChange={setExternId}
                nothingFoundMessage="Niemand gefunden"
              />
              <Anchor
                component="button"
                type="button"
                size="sm"
                ta="left"
                onClick={() => setNeu(true)}
              >
                Neue externe Person anlegen
              </Anchor>
            </Stack>
          ))}
        <Select
          label="Dienstform"
          placeholder="Dienstform wählen"
          data={optionen}
          value={dienstformId}
          allowDeselect={false}
          onChange={setDienstformId}
        />
        <Textarea
          label="Kommentar"
          description="Optional"
          autosize
          minRows={2}
          maxLength={KOMMENTAR_MAX}
          value={kommentar}
          onChange={(e) => setKommentar(e.currentTarget.value)}
        />
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button loading={laeuft} onClick={() => void absenden()}>
            Eintragen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
