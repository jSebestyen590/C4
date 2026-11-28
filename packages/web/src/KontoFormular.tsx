import { FeldLabel } from './InfoHinweis';
import { HILFE } from './finanzenHilfe';
import { Alert, Button, Modal, Select, Stack, Switch, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import {
  KONTO_ART_LABELS,
  KONTO_ARTEN,
  EUER_ZEILEN,
  EUER_ZEILEN_ZUORDENBAR,
  kontoHatEuerZeile,
  kontoEingabeSchema,
  type EuerZeile,
  type KontoAendern,
  type KontoArt,
  type KontoEingabe,
  type KontoDto,
  type SteuersatzArt,
} from '@c4/shared';
import { useApi } from './api';
import { finanzenKeys } from './finanzenDaten';
import { fehlerText, pruefen } from './warenApi';
import { artOptionen, useHeutigeSaetze } from './steuersaetze';

/** All accounts below `id` (to keep them out of the parent options and avoid cycles). */
function nachfahren(id: string, konten: readonly KontoDto[]): Set<string> {
  const menge = new Set<string>([id]);
  let gewachsen = true;
  while (gewachsen) {
    gewachsen = false;
    for (const k of konten)
      if (k.parentId && menge.has(k.parentId) && !menge.has(k.id)) {
        menge.add(k.id);
        gewachsen = true;
      }
  }
  return menge;
}

/** Create or edit an account. Mount it only while it should be open. */
export function KontoFormular({
  konto,
  konten,
  onClose,
}: Readonly<{
  /** Set when editing. */
  konto?: KontoDto;
  /** All accounts (including archived) for the parent options. */
  konten: readonly KontoDto[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(konto?.name ?? '');
  const [art, setArt] = useState<KontoArt>(konto?.art ?? 'neutral');
  const [parentId, setParentId] = useState<string | null>(konto?.parentId ?? null);
  const [stueckelung, setStueckelung] = useState(konto?.stueckelung ?? false);
  const [euerZeile, setEuerZeile] = useState<EuerZeile | null>(konto?.euerZeile ?? null);
  const [steuerArt, setSteuerArt] = useState<SteuersatzArt | null>(konto?.steuersatzArt ?? null);
  const heute = useHeutigeSaetze();
  const [fehler, setFehler] = useState<string | null>(null);

  const ausgeschlossen = konto ? nachfahren(konto.id, konten) : new Set<string>();
  const parentOptionen = konten
    .filter((k) => !ausgeschlossen.has(k.id) && (!k.archiviert || k.id === konto?.parentId))
    .map((k) => ({ value: k.id, label: k.name }));

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (json: KontoEingabe | KontoAendern) =>
      pruefen(
        konto
          ? await api.finanzen.konten[':id'].$put({ param: { id: konto.id }, json })
          : await api.finanzen.konten.$post({ json: json as KontoEingabe }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = {
      name,
      art,
      parentId,
      stueckelung,
      steuersatzArt: steuerArt,
      euerZeile: kontoHatEuerZeile(art) ? euerZeile : null,
    };
    const parsed = kontoEingabeSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    if (!konto) return speichern.mutate(parsed.data);
    // Only send what changed: art, Stückelung and parent are locked once the account has lines.
    const d = parsed.data;
    const aenderung: KontoAendern = {};
    if (d.name !== konto.name) aenderung.name = d.name;
    if (d.art !== konto.art) aenderung.art = d.art;
    if (d.parentId !== konto.parentId) aenderung.parentId = d.parentId;
    if (d.stueckelung !== konto.stueckelung) aenderung.stueckelung = d.stueckelung;
    if (d.steuersatzArt !== konto.steuersatzArt) aenderung.steuersatzArt = d.steuersatzArt;
    if ((d.euerZeile ?? null) !== konto.euerZeile) aenderung.euerZeile = d.euerZeile ?? null;
    if (Object.keys(aenderung).length === 0) return onClose();
    speichern.mutate(aenderung);
  };

  return (
    <Modal opened onClose={onClose} title={konto ? 'Konto bearbeiten' : 'Konto anlegen'}>
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
            label={<FeldLabel text="Art" hilfe={HILFE.konto.art} />}
            allowDeselect={false}
            value={art}
            onChange={(v) => v && setArt(v as KontoArt)}
            data={KONTO_ARTEN.map((a) => ({ value: a, label: KONTO_ART_LABELS[a] }))}
          />
          {kontoHatEuerZeile(art) && (
            <Select
              label={<FeldLabel text="EÜR-Zeile" hilfe={HILFE.konto.euerZeile} />}
              description="Optional, für die Auswertung „EÜR“"
              placeholder="Nicht zugeordnet"
              searchable
              clearable
              value={euerZeile}
              onChange={(v) => setEuerZeile(v as EuerZeile | null)}
              data={EUER_ZEILEN_ZUORDENBAR.map((z) => ({
                value: z,
                label: EUER_ZEILEN[z].label,
              }))}
            />
          )}
          <Select
            label={<FeldLabel text="Übergeordnetes Konto" hilfe={HILFE.konto.parent} />}
            description="Optional"
            clearable
            searchable
            value={parentId}
            onChange={setParentId}
            data={parentOptionen}
            nothingFoundMessage="Kein Konto gefunden"
          />
          <Switch
            label={
              <FeldLabel
                text="Mit Stückelung (Bargeld nach Scheinen und Münzen)"
                hilfe={HILFE.konto.stueckelung}
              />
            }
            checked={stueckelung}
            onChange={(e) => setStueckelung(e.currentTarget.checked)}
          />
          <Select
            label={
              <FeldLabel
                text="Standard-Steuersatz (optional)"
                hilfe={HILFE.konto.steuersatzStandard}
              />
            }
            size="md"
            data={artOptionen(heute)}
            value={steuerArt}
            onChange={(v) => setSteuerArt(v as SteuersatzArt | null)}
            placeholder="Keine Vorgabe"
            clearable
          />
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {konto ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
