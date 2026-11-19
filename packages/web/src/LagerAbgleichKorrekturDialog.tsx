import { Button, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ABGLEICH_GRUENDE,
  ABGLEICH_GRUND_LABELS,
  abgleichKorrekturSchema,
  basisMengeAnzeigen,
  type AbgleichGrund,
  type LagerAbgleichZeileDto,
} from '@c4/shared';
import { useApi } from './api';
import { DatumFeld } from './DatumFeld';
import { lagerAbgleichKeys } from './lagerAbgleichDaten';
import { useWarenStammdaten, type WareEintrag } from './warenDaten';
import { fehlerAnzeigen, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

/** Books a Korrektur that explains (part of) the Diskrepanz of one Ware. */
export function LagerAbgleichKorrekturDialog({
  zeile,
  ware,
  stichtag,
  onClose,
}: Readonly<{
  zeile: LagerAbgleichZeileDto;
  ware: WareEintrag | undefined;
  stichtag: string;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const stamm = useWarenStammdaten();
  const [v, setV] = useState({
    menge: zeile.diskrepanz,
    grund: null as AbgleichGrund | null,
    text: '',
    datum: heute(),
  });
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const setze = <K extends keyof typeof v>(k: K, w: (typeof v)[K]) =>
    setV((alt) => ({ ...alt, [k]: w }));
  const hinweis = useMemo(() => {
    if (!ware || v.menge === 0) return null;
    const eigene = stamm.gebinde.filter((g) => ware.gebindeIds.includes(g.id));
    return basisMengeAnzeigen(v.menge, eigene, stamm.gebinde);
  }, [ware, stamm.gebinde, v.menge]);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const eingabe = abgleichKorrekturSchema.safeParse({
        wareId: zeile.wareId,
        menge: v.menge,
        grund: v.grund ?? undefined,
        text: v.text,
        datum: v.datum,
      });
      if (!eingabe.success) {
        const neu: Record<string, string> = {};
        for (const i of eingabe.error.issues) neu[String(i.path[0])] ??= i.message;
        setFehler(neu);
        const f = new Error(eingabe.error.issues[0]!.message);
        f.name = 'ZodFehler';
        throw f;
      }
      await pruefen(await api['lager-abgleich'].korrekturen.$post({ json: eingabe.data }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: lagerAbgleichKeys.alle });
      onClose();
    },
    onError: (e) => {
      if (!(e instanceof Error) || e.name !== 'ZodFehler') fehlerAnzeigen(e);
    },
  });

  return (
    <Modal opened onClose={onClose} title={`Ausgleichen: ${zeile.name}`} fullScreen={false}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFehler({});
          speichern.mutate();
        }}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Aktuelle Diskrepanz: {zeile.diskrepanzText}. Eine Korrektur erklärt, warum Lager und
            Belege abweichen, z. B. Bruch. Eine positive Menge erklärt zu viel eingelagerte Ware.
          </Text>
          <ZahlFeld
            label="Menge (Basiseinheiten)"
            value={v.menge}
            onChange={(n) => setze('menge', typeof n === 'number' ? n : 0)}
            min={-1_000_000}
            error={fehler.menge}
          />
          {hinweis && (
            <Text size="sm" c="dimmed">
              Das sind {hinweis}.
            </Text>
          )}
          <Select
            label="Grund"
            required
            size="md"
            allowDeselect={false}
            data={ABGLEICH_GRUENDE.map((g) => ({ value: g, label: ABGLEICH_GRUND_LABELS[g] }))}
            value={v.grund}
            onChange={(g) => setze('grund', g as AbgleichGrund | null)}
            error={fehler.grund}
          />
          <Textarea
            label="Text"
            required={v.grund === 'sonstiges'}
            size="md"
            autosize
            minRows={2}
            maxLength={500}
            value={v.text}
            onChange={(e) => setze('text', e.currentTarget.value)}
            error={fehler.text}
          />
          <DatumFeld
            label="Datum"
            required
            size="md"
            loeschbar={false}
            min={stichtag}
            max={heute()}
            value={v.datum}
            onWert={(d) => setze('datum', d)}
            error={fehler.datum}
          />
          <Group justify="flex-end" wrap="wrap">
            <Button variant="default" size="md" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" size="md" loading={speichern.isPending}>
              Korrektur speichern
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
