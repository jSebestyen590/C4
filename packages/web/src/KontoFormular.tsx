import { FeldLabel } from './InfoHinweis';
import { HILFE } from './finanzenHilfe';
import { Alert, Button, Modal, Select, Stack, Switch, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import {
  KONTO_ART_LABELS,
  KONTO_ARTEN,
  kontoEingabeSchema,
  type KontoAendern,
  type KontoArt,
  type KontoEingabe,
  type KontoDto,
} from '@c4/shared';
import { useApi } from './api';
import { finanzenKeys } from './finanzenDaten';
import { fehlerText, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

/** Basis points -> percent for the field (1900 -> 19). */
const prozent = (bp: number | null): number | string => (bp === null ? '' : bp / 100);

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
  const [steuer, setSteuer] = useState<number | string>(prozent(konto?.steuersatzStandard ?? null));
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
    const satz =
      typeof steuer === 'number' ? Math.round(steuer * 100) : steuer === '' ? null : Number.NaN;
    const eingabe = { name, art, parentId, stueckelung, steuersatzStandard: satz };
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
    if (d.steuersatzStandard !== konto.steuersatzStandard)
      aenderung.steuersatzStandard = d.steuersatzStandard;
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
          <ZahlFeld
            label={
              <FeldLabel
                text="Standard-Steuersatz (optional)"
                hilfe={HILFE.konto.steuersatzStandard}
              />
            }
            value={steuer}
            onChange={setSteuer}
            min={0}
            max={100}
            step={1}
            decimalScale={2}
            decimalSeparator=","
            allowNegative={false}
            suffix=" %"
            inputMode="decimal"
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
