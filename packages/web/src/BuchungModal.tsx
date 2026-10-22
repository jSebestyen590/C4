import {
  Alert,
  Button,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import {
  einlagerungSchema,
  entnahmeSchema,
  mhdNormalisieren,
  pfad,
  type BaumKnoten,
  gebindeBezeichnung,
  vergleicheGebinde,
  type Gebinde,
} from '@c4/shared';
import { unwrap, useApi } from './api';
import { DatumFeld } from './DatumFeld';
import { fehlerText, pruefen } from './warenApi';
import { zeileText } from './warenAnzeige';
import type { WareEintrag } from './warenDaten';

export type BuchungsModus = 'einlagerung' | 'entnahme';

/** `YYYY-MM-DDTHH:mm` of now in local time, as `datetime-local` expects it. */
function jetztLokal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Einlagerung / Entnahme of a Ware (full screen on phones). Mount it only while it should be open. */
export function BuchungModal({
  modus,
  ware,
  lagerorte,
  gebinde,
  onClose,
}: Readonly<{
  modus: BuchungsModus;
  ware: WareEintrag;
  lagerorte: (BaumKnoten & { archiviert: boolean; ifcoHoeheCm?: number | null })[];
  gebinde: (Gebinde & { archiviert: boolean })[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const mobil = useMediaQuery('(max-width: 48em)');
  const ein = modus === 'einlagerung';

  const gebindeDaten = useMemo(
    () =>
      gebinde
        .filter((g) => ware.gebindeIds.includes(g.id) && !g.archiviert)
        .sort((a, b) => vergleicheGebinde(a, b, gebinde))
        .map((g) => ({ value: g.id, label: gebindeBezeichnung(g, gebinde) })),
    [gebinde, ware.gebindeIds],
  );
  const lagerDaten = useMemo(
    () =>
      lagerorte
        .filter((l) => !l.archiviert && (l.ifcoHoeheCm ?? null) === null)
        .map((l) => ({ value: l.id, label: pfad(lagerorte, l.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [lagerorte],
  );

  const [lagerortId, setLagerortId] = useState<string | null>(null);
  const [gebindeId, setGebindeId] = useState<string | null>(
    gebindeDaten.length === 1 ? gebindeDaten[0]!.value : null,
  );
  const [anzahl, setAnzahl] = useState<number | string>(1);
  const [mhd, setMhd] = useState('');
  const [zeitpunkt, setZeitpunkt] = useState(jetztLokal);
  const [kommentar, setKommentar] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const buchen = useMutation({
    mutationFn: async (json: ReturnType<typeof einlagerungSchema.parse>) => {
      if (ein) {
        await pruefen(await api.bestand.einlagerung.$post({ json }));
        return null;
      }
      const res = await api.bestand.entnahme.$post({ json });
      await pruefen(res);
      return ((await res.json()) as { id: string }).id;
    },
    onSuccess: async (vorgangId) => {
      await qc.invalidateQueries({ queryKey: ['waren'] });
      let nachricht = ein ? 'Die Einlagerung wurde gebucht.' : 'Die Entnahme wurde gebucht.';
      if (vorgangId) {
        // Show what the FIFO plan booked; the booking itself already succeeded.
        try {
          const vorgaenge = await unwrap(
            await api.waren[':id'].vorgaenge.$get({ param: { id: ware.id } }),
          );
          const v = vorgaenge.find((x) => x.id === vorgangId);
          if (v) {
            nachricht = v.zeilen
              .map((z) => zeileText(z, ware.mhdArt, gebinde, lagerorte))
              .join('\n');
          }
        } catch {
          // Keep the generic message.
        }
      }
      notifications.show({
        color: 'green',
        message: <Text style={{ whiteSpace: 'pre-line' }}>{nachricht}</Text>,
      });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const zeit = new Date(zeitpunkt);
    if (Number.isNaN(zeit.getTime())) return setFehler('Ungültiger Zeitpunkt.');
    const basis = {
      wareId: ware.id,
      lagerortId: lagerortId ?? '',
      gebindeId: gebindeId ?? '',
      anzahl: anzahl === '' ? Number.NaN : Number(anzahl),
      zeitpunkt: zeit.toISOString(),
      kommentar,
    };
    if (ein) {
      const normal = mhdNormalisieren(
        ware.mhdArt === 'monat' && mhd ? `${mhd}-01` : mhd || null,
        ware.mhdArt,
      );
      if (ware.mhdArt !== 'keins' && !normal) return setFehler('Bitte gib ein MHD an.');
      const parsed = einlagerungSchema.safeParse({ ...basis, mhd: normal });
      if (!parsed.success)
        return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
      setFehler(null);
      return buchen.mutate(parsed.data);
    }
    const parsed = entnahmeSchema.safeParse(basis);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    buchen.mutate({ ...parsed.data, mhd: null });
  };

  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen={mobil}
      title={`${ein ? 'Einlagern' : 'Entnehmen'}: ${ware.name}`}
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <Select
            label="Lagerort"
            placeholder="Lagerort wählen"
            searchable
            inputMode="text"
            nothingFoundMessage="Kein Lagerort gefunden"
            data={lagerDaten}
            value={lagerortId}
            onChange={setLagerortId}
          />
          <Select
            label="Gebinde"
            placeholder="Gebinde wählen"
            data={gebindeDaten}
            value={gebindeId}
            onChange={setGebindeId}
          />
          <NumberInput
            label="Anzahl"
            allowDecimal={false}
            allowNegative={false}
            min={1}
            inputMode="numeric"
            value={anzahl}
            onChange={setAnzahl}
          />
          {ein && ware.mhdArt === 'tag' && <DatumFeld label="MHD" value={mhd} onWert={setMhd} />}
          {ein && ware.mhdArt === 'monat' && (
            <TextInput
              label="MHD (Monat)"
              type="month"
              value={mhd}
              onChange={(e) => setMhd(e.currentTarget.value)}
            />
          )}
          <TextInput
            label="Zeitpunkt"
            type="datetime-local"
            value={zeitpunkt}
            onChange={(e) => setZeitpunkt(e.currentTarget.value)}
          />
          <Textarea
            label="Kommentar (optional)"
            autosize
            minRows={2}
            value={kommentar}
            onChange={(e) => setKommentar(e.currentTarget.value)}
          />
          {!ein && (
            <Alert color="blue">
              Entnommen wird nach MHD (älteste zuerst) aus dem gewählten Lager inklusive aller
              Unterebenen; ganze Gebinde werden bei Bedarf angebrochen.
            </Alert>
          )}
          {fehler && <Alert color="red">{fehler}</Alert>}
          {buchen.isError && (
            <Alert color="red">{fehlerText(buchen.error, 'Buchen fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={buchen.isPending}>
            {ein ? 'Einlagern' : 'Entnehmen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
