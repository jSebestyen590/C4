import { Alert, Button, Group, Modal, Select, Stack, Textarea } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ABGANG_GRUENDE,
  bewegungSchema,
  heuteBerlin,
  ohnePlatz,
  platzText,
  ZUGANG_GRUENDE,
  zielKey,
  type BewegungEingabe,
} from '@c4/shared';
import { useApi } from './api';
import { DatumFeld } from './DatumFeld';
import { GRUND_LABELS, label } from './i18n';
import { zielAusWert, zielOptionen } from './inventarAnzeige';
import { INVENTAR_KEY, type GegenstandEintrag, type IfcoEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { PfadSelect } from './PfadSelect';
import { fehlerText, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

const OHNE_PLATZ = 'ohne';
const VERBAUT = 'v:';

/**
 * Books a Zugang (optionally onto a Platz) or an Abgang (from a Platz, from the pieces without a
 * Platz or from a fixed installation) of a Gegenstand. Mount it only while it should be open.
 */
export function BewegungModal({
  gegenstand,
  art,
  lagerorte,
  ifcos,
  onClose,
}: Readonly<{
  gegenstand: GegenstandEintrag;
  art: 'zugang' | 'abgang';
  lagerorte: LagerKnoten[];
  ifcos: IfcoEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const frei = ohnePlatz(gegenstand);

  // Sources of an Abgang with their amounts; preselected: the pieces without a Platz, else the
  // Platz holding the most.
  const quellen = useMemo(
    () => [
      ...(frei > 0 ? [{ value: OHNE_PLATZ, label: `Ohne Platz (${frei})`, anzahl: frei }] : []),
      ...gegenstand.plaetze
        .map((p) => ({
          value: zielKey(p),
          label: `${platzText(lagerorte, ifcos, p)} (${p.anzahl})`,
          anzahl: p.anzahl,
        }))
        .sort((a, b) => b.anzahl - a.anzahl),
      ...gegenstand.verbaut.map((v) => ({
        value: `${VERBAUT}${v.ort}`,
        label: `fest verbaut: ${v.ort} (${v.anzahl})`,
        anzahl: v.anzahl,
      })),
    ],
    [gegenstand, frei, lagerorte, ifcos],
  );

  const [anzahl, setAnzahl] = useState<number | string>(1);
  const [grund, setGrund] = useState<string>(art === 'zugang' ? 'gekauft' : 'verloren');
  const [datum, setDatum] = useState(heuteBerlin());
  const [kommentar, setKommentar] = useState('');
  const [nach, setNach] = useState<string | null>(null);
  const [von, setVon] = useState<string | null>(quellen[0]?.value ?? null);
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (json: BewegungEingabe) =>
      pruefen(
        await api.inventar.gegenstaende[':id'].bewegungen.$post({
          param: { id: gegenstand.id },
          json,
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  const vonAusWert = (wert: string | null) => {
    if (wert === OHNE_PLATZ) return { art: 'ohnePlatz' as const };
    if (wert?.startsWith(VERBAUT))
      return { art: 'verbaut' as const, ort: wert.slice(VERBAUT.length) };
    return wert ? { art: 'platz' as const, ...zielAusWert(wert) } : undefined;
  };

  const onSpeichern = () => {
    const gemeinsam = {
      anzahl: typeof anzahl === 'number' ? anzahl : Number.NaN,
      datum,
      kommentar,
    };
    const eingabe =
      art === 'zugang'
        ? { art, grund, ...gemeinsam, nach: nach ? zielAusWert(nach) : null }
        : { art, grund, ...gemeinsam, von: vonAusWert(von) };
    const parsed = bewegungSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    const quelle = quellen.find((q) => q.value === von);
    if (art === 'abgang' && quelle && gemeinsam.anzahl > quelle.anzahl) {
      return setFehler(
        `Dort ${quelle.anzahl === 1 ? 'ist nur 1 Stück' : `sind nur ${quelle.anzahl} Stück`}.`,
      );
    }
    setFehler(null);
    speichern.mutate(eingabe as BewegungEingabe);
  };

  const gruende = art === 'zugang' ? ZUGANG_GRUENDE : ABGANG_GRUENDE;
  return (
    <Modal
      opened
      onClose={onClose}
      title={`${art === 'zugang' ? 'Zugang' : 'Abgang'}: ${gegenstand.name}`}
    >
      <Stack>
        <ZahlFeld
          label="Anzahl"
          allowDecimal={false}
          allowNegative={false}
          min={1}
          inputMode="numeric"
          value={anzahl}
          onChange={setAnzahl}
          data-autofocus
        />
        <Group grow align="flex-start" wrap="wrap">
          <Select
            label="Grund"
            allowDeselect={false}
            data={gruende.map((g) => ({ value: g, label: label(GRUND_LABELS, g) }))}
            value={grund}
            onChange={(v) => v && setGrund(v)}
            miw={160}
          />
          <DatumFeld label="Datum" value={datum} onWert={setDatum} miw={160} />
        </Group>
        {art === 'zugang' ? (
          // A virtual Gegenstand never has a Platz.
          !gegenstand.virtuell && (
            <PfadSelect
              label="Platz (optional)"
              placeholder="Ohne Platz"
              searchable
              clearable
              inputMode="text"
              nothingFoundMessage="Nichts gefunden"
              data={zielOptionen(lagerorte, ifcos, new Set(), new Set())}
              value={nach}
              onChange={setNach}
            />
          )
        ) : (
          <Select
            label="Von"
            placeholder={quellen.length === 0 ? 'Nichts vorhanden' : 'Wählen'}
            allowDeselect={false}
            data={quellen.map(({ value, label: text }) => ({ value, label: text }))}
            value={von}
            onChange={setVon}
          />
        )}
        <Textarea
          label="Kommentar (optional)"
          autosize
          minRows={2}
          value={kommentar}
          onChange={(e) => setKommentar(e.currentTarget.value)}
        />
        {fehler && <Alert color="red">{fehler}</Alert>}
        {speichern.isError && (
          <Alert color="red">{fehlerText(speichern.error, 'Buchen fehlgeschlagen.')}</Alert>
        )}
        <Button loading={speichern.isPending} onClick={onSpeichern}>
          {art === 'zugang' ? 'Zugang buchen' : 'Abgang buchen'}
        </Button>
      </Stack>
    </Modal>
  );
}
