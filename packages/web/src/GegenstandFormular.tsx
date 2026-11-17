import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconTrash } from '@tabler/icons-react';
import { useMemo, useRef, useState, type SubmitEvent } from 'react';
import {
  gegenstandAnlegenSchema,
  gegenstandSchema,
  heuteBerlin,
  pfad,
  zuVielVerteiltFehler,
  ZUGANG_GRUENDE,
} from '@c4/shared';
import { DatumFeld } from './DatumFeld';
import { GRUND_LABELS, label } from './i18n';
import { useApi } from './api';
import { kategorieOptionen, zielAusWert, zielOptionen } from './inventarAnzeige';
import type { GegenstandEintrag, IfcoEintrag, KategorieEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { PfadSelect } from './PfadSelect';
import { inventarKeys, useInventar } from './inventarDaten';
import { fehlerText, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

/** One part row of the create form (a part created together with its parent). */
interface TeilZeile {
  key: number;
  name: string;
  anzahlJe: number | string;
  ziel: string | null;
}

/**
 * Create or edit a Gegenstand. Creating books the first Zugang (Anzahl, Grund, Datum) and may put it
 * onto a first place (by default with the whole Anzahl); editing changes only the master data, the
 * amount changes through Zugänge and Abgänge. A part is only created from its parent ("Teil anlegen",
 * `teilVon`) and asks for the pieces per parent piece; a Gegenstand can also be virtual (only its
 * parts exist). Mount it only while it should be open.
 */
export function GegenstandFormular({
  gegenstand,
  kategorien,
  lagerorte = [],
  ifcos = [],
  teilVon: teilVonVorgabe,
  kategorieId: kategorieVorgabe,
  onClose,
}: Readonly<{
  /** Set when editing. */
  gegenstand?: GegenstandEintrag;
  kategorien: KategorieEintrag[];
  /** Places offered when creating. */
  lagerorte?: LagerKnoten[];
  ifcos?: IfcoEintrag[];
  /** Preselected parent when creating a part. */
  teilVon?: string;
  /** Preselected Kategorie when creating (e.g. the parent's). */
  kategorieId?: string;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(gegenstand?.name ?? '');
  const { gegenstaende } = useInventar();
  const [kategorieId, setKategorieId] = useState<string | null>(
    gegenstand?.kategorieId ?? kategorieVorgabe ?? null,
  );
  const teilVon = gegenstand?.teilVon ?? teilVonVorgabe ?? null;
  const [anzahlJe, setAnzahlJe] = useState<number | string>(gegenstand?.anzahlJe ?? 1);
  const [virtuell, setVirtuell] = useState(gegenstand?.virtuell ?? false);
  const [anzahl, setAnzahl] = useState<number | string>(1);
  const [grund, setGrund] = useState<string>('gekauft');
  const [datum, setDatum] = useState(heuteBerlin());
  const [beschreibung, setBeschreibung] = useState(gegenstand?.beschreibung ?? '');
  const [ziel, setZiel] = useState<string | null>(null);
  // null: follows the Anzahl until changed by hand.
  const [platzAnzahl, setPlatzAnzahl] = useState<number | string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [teile, setTeile] = useState<TeilZeile[]>([]);
  const [teilFehler, setTeilFehler] = useState<Record<number, string>>({});
  const naechsterKey = useRef(0);
  // Key of the part row just added; its name field takes the focus once rendered.
  const fokusKey = useRef<number | null>(null);

  const optionen = useMemo(
    () => kategorieOptionen(kategorien, gegenstand?.kategorieId),
    [kategorien, gegenstand],
  );
  const eltern = gegenstaende.find((x) => x.id === teilVon);
  // A new part has no amount of its own to enter: its parent's amount times the pieces per parent piece.
  const gesamt: number | string =
    teilVon === null
      ? anzahl
      : typeof anzahlJe === 'number'
        ? (eltern?.anzahl ?? 1) * anzahlJe
        : '';
  const amPlatz = platzAnzahl ?? gesamt;
  const platzOptionen = useMemo(
    () => zielOptionen(lagerorte, ifcos, new Set(), new Set()),
    [lagerorte, ifcos],
  );

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (json: {
      name: string;
      beschreibung: string;
      kategorieId: string | null;
      teilVon: string | null;
      virtuell: boolean;
      anzahlJe: number | null;
      anzahl: number;
      grund?: (typeof ZUGANG_GRUENDE)[number];
      datum?: string;
      platz: { lagerortId: string | null; ifcoId: string | null; anzahl: number } | null;
      teile: {
        name: string;
        anzahlJe: number;
        platz: { lagerortId: string | null; ifcoId: string | null } | null;
      }[];
    }) => {
      if (gegenstand) {
        const { name, beschreibung, kategorieId, teilVon, virtuell, anzahlJe } = json;
        await pruefen(
          await api.inventar.gegenstaende[':id'].$put({
            param: { id: gegenstand.id },
            json: { name, beschreibung, kategorieId, teilVon, virtuell, anzahlJe },
          }),
        );
      } else {
        await pruefen(await api.inventar.gegenstaende.$post({ json }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: inventarKeys.alle });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const istTeil = teilVon !== null;
    const eingabe = {
      name,
      beschreibung,
      // A part always takes its parent's category (the API resolves it).
      kategorieId: istTeil ? null : (kategorieId ?? ''),
      teilVon,
      virtuell: teilVon === null && virtuell,
      anzahlJe: teilVon !== null ? (typeof anzahlJe === 'number' ? anzahlJe : Number.NaN) : null,
      anzahl: typeof gesamt === 'number' ? gesamt : Number.NaN,
      grund: istTeil ? undefined : (grund as (typeof ZUGANG_GRUENDE)[number]),
      datum: istTeil ? undefined : datum,
      teile:
        istTeil || gegenstand
          ? []
          : teile.map((t) => ({
              name: t.name,
              anzahlJe: typeof t.anzahlJe === 'number' ? t.anzahlJe : Number.NaN,
              platz: t.ziel ? zielAusWert(t.ziel) : null,
            })),
      platz:
        ziel && !virtuell
          ? { ...zielAusWert(ziel), anzahl: typeof amPlatz === 'number' ? amPlatz : Number.NaN }
          : null,
    };
    const parsed = (gegenstand ? gegenstandSchema : gegenstandAnlegenSchema).safeParse(eingabe);
    if (!parsed.success) {
      // Errors inside a part row belong to that row, the rest goes to the alert.
      const zeilen: Record<number, string> = {};
      let allgemein: string | null = null;
      for (const issue of parsed.error.issues) {
        const [feld, index] = issue.path;
        const zeile = feld === 'teile' && typeof index === 'number' ? teile[index] : undefined;
        if (zeile) zeilen[zeile.key] ??= issue.message;
        else allgemein ??= issue.message;
      }
      setTeilFehler(zeilen);
      return setFehler(allgemein ?? (Object.keys(zeilen).length ? null : 'Ungültige Eingabe.'));
    }
    setTeilFehler({});
    const regel =
      !gegenstand &&
      eingabe.platz &&
      zuVielVerteiltFehler(eingabe.name.trim(), eingabe.anzahl, 0, 0, eingabe.platz.anzahl);
    if (regel) return setFehler(regel);
    setFehler(null);
    speichern.mutate(eingabe);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={gegenstand ? 'Gegenstand bearbeiten' : 'Gegenstand anlegen'}
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          {teilVon === null ? (
            <Select
              label="Kategorie"
              placeholder="Kategorie wählen"
              searchable
              inputMode="text"
              nothingFoundMessage="Keine Kategorie gefunden"
              data={optionen}
              value={kategorieId}
              onChange={setKategorieId}
            />
          ) : (
            <Text size="sm" c="dimmed">
              Kategorie: {eltern ? pfad(kategorien, eltern.kategorieId) : '–'} (vom übergeordneten
              Gegenstand)
            </Text>
          )}
          {teilVon !== null && (
            <ZahlFeld
              label={`Anzahl je ${eltern?.name ?? 'übergeordnetem Gegenstand'}`}
              allowDecimal={false}
              allowNegative={false}
              min={1}
              inputMode="numeric"
              value={anzahlJe}
              onChange={setAnzahlJe}
              description={
                !gegenstand && typeof gesamt === 'number' && gesamt !== 1
                  ? `Gesamt: ${gesamt}`
                  : undefined
              }
            />
          )}
          {teilVon === null && (
            <Switch
              label="Nur virtuell"
              description="Besteht nur aus seinen Teilen und hat keinen eigenen Platz."
              checked={virtuell}
              onChange={(e) => setVirtuell(e.currentTarget.checked)}
            />
          )}
          {!gegenstand && teilVon === null && (
            <>
              <ZahlFeld
                label="Anzahl"
                allowDecimal={false}
                allowNegative={false}
                min={1}
                inputMode="numeric"
                value={anzahl}
                onChange={setAnzahl}
              />
              <Group grow align="flex-start" wrap="wrap">
                <Select
                  label="Grund"
                  allowDeselect={false}
                  data={ZUGANG_GRUENDE.map((g) => ({ value: g, label: label(GRUND_LABELS, g) }))}
                  value={grund}
                  onChange={(v) => v && setGrund(v)}
                  miw={160}
                />
                <DatumFeld label="Datum" value={datum} onWert={setDatum} miw={160} />
              </Group>
            </>
          )}
          {!gegenstand && !virtuell && (
            <PfadSelect
              label="Platz (optional)"
              placeholder="Lagerort oder IFCO wählen"
              searchable
              clearable
              inputMode="text"
              nothingFoundMessage="Nichts gefunden"
              data={platzOptionen}
              value={ziel}
              onChange={setZiel}
            />
          )}
          {!gegenstand && !virtuell && ziel && (gesamt !== 1 || amPlatz !== 1) && (
            <ZahlFeld
              label="Anzahl an diesem Platz"
              allowDecimal={false}
              allowNegative={false}
              min={1}
              inputMode="numeric"
              value={amPlatz}
              onChange={setPlatzAnzahl}
            />
          )}
          {!gegenstand && teilVon === null && (
            <Stack gap="xs">
              <div>
                <Text size="sm" fw={500}>
                  Teile (optional)
                </Text>
                <Text size="xs" c="dimmed">
                  Teile übernehmen Kategorie und Beschaffung von diesem Gegenstand.
                </Text>
              </div>
              {teile.map((t, i) => {
                const je = typeof t.anzahlJe === 'number' ? t.anzahlJe : 1;
                const gesamt = (typeof anzahl === 'number' ? anzahl : 1) * je;
                const aendern = (teil: Partial<TeilZeile>) =>
                  setTeile((alle) => alle.map((x) => (x.key === t.key ? { ...x, ...teil } : x)));
                return (
                  <Paper key={t.key} withBorder p="sm" radius="md">
                    <Stack gap="xs">
                      <Group justify="space-between" wrap="nowrap" align="flex-end">
                        <TextInput
                          style={{ flex: 1 }}
                          label={`Teil ${i + 1}`}
                          placeholder="Name des Teils"
                          value={t.name}
                          error={teilFehler[t.key]}
                          ref={(el) => {
                            if (el && fokusKey.current === t.key) {
                              fokusKey.current = null;
                              el.focus();
                            }
                          }}
                          onChange={(e) => aendern({ name: e.currentTarget.value })}
                        />
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size={42}
                          aria-label="Teil entfernen"
                          mb={teilFehler[t.key] ? 22 : 0}
                          onClick={() => setTeile((alle) => alle.filter((x) => x.key !== t.key))}
                        >
                          <IconTrash size={20} />
                        </ActionIcon>
                      </Group>
                      <ZahlFeld
                        label={`Anzahl je ${name.trim() || 'Stück'}`}
                        allowDecimal={false}
                        allowNegative={false}
                        min={1}
                        inputMode="numeric"
                        value={t.anzahlJe}
                        onChange={(v) => aendern({ anzahlJe: v })}
                      />
                      {!virtuell && (
                        <PfadSelect
                          label="Platz (optional)"
                          placeholder={
                            ziel ? `Platz wie ${name.trim() || 'Gegenstand'}` : 'Ohne Platz'
                          }
                          searchable
                          clearable
                          inputMode="text"
                          nothingFoundMessage="Nichts gefunden"
                          data={platzOptionen}
                          value={t.ziel}
                          onChange={(v) => aendern({ ziel: v })}
                        />
                      )}
                      {gesamt !== 1 && (
                        <Text size="xs" c="dimmed">
                          Gesamt: {gesamt}
                        </Text>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
              <Button
                variant="light"
                size="md"
                fullWidth
                onClick={() => {
                  const key = naechsterKey.current++;
                  fokusKey.current = key;
                  setTeile((alle) => [...alle, { key, name: '', anzahlJe: 1, ziel: null }]);
                }}
              >
                Teil hinzufügen
              </Button>
            </Stack>
          )}
          <Textarea
            label="Beschreibung (optional)"
            placeholder="Seriennummer, Quelle, …"
            autosize
            minRows={2}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.currentTarget.value)}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {gegenstand ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
