import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Checkbox,
  Chip,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Radio,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconCalendarEvent,
  IconCalendarQuestion,
  IconListCheck,
  IconPlus,
  IconTemplate,
  IconTrash,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  heuteBerlin,
  leererKreis,
  MITGLIED_STATI,
  moeglicheAntworten,
  tagNachher,
  UMFRAGE_ERGEBNISSE,
  UMFRAGE_ERINNERUNG_STANDARD,
  UMFRAGE_ERINNERUNG_TAGE,
  umfrageEingabeSchema,
  type MitgliedStatus,
  type UmfrageDetailDto,
  type UmfrageErgebnisse,
  type EventKategorieDto,
  type UmfrageKreis,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { DatumFeld } from '../DatumFeld';
import { labelFuer, MITGLIED_STATUS_LABELS, UMFRAGE_ERGEBNISSE_LABELS } from '../i18n';
import { mitgliedOptionen, useMitgliederListe } from '../organisator';
import { erinnerungLabel, umfrageLink, umfragenInvalidieren, useUmfrage } from '../umfrageDaten';
import { useEventKategorien, useVorlagen } from '../kalenderDaten';
import {
  neuesDatum,
  neueTerminWerte,
  TerminListe,
  TerminQuelleFelder,
  terminEingabeAus,
  terminKategorie,
  terminWerteAus,
  UmfrageTerminFelder,
  type TerminDatum,
  type TerminWerte,
} from '../UmfrageTerminFelder';
import { SortierbareListe } from '../SortierbareListe';
import { ZahlFeld } from '../ZahlFeld';
import { ApiFehler, fehlerText } from '../warenApi';
import { postenKeys } from '../queryKeys';

let zaehler = 0;
const neuerKey = () => `k${++zaehler}`;

interface OptionWert {
  key: string;
  id?: string;
  text: string;
}

interface FrageWert {
  key: string;
  id?: string;
  text: string;
  freitext: boolean;
  /** Any number of answers (`maxAntworten` null). */
  alle: boolean;
  maxAntworten: number;
  optionen: OptionWert[];
}

const neueFrage = (): FrageWert => ({
  key: neuerKey(),
  text: '',
  freitext: false,
  alle: false,
  maxAntworten: 1,
  optionen: [
    { key: neuerKey(), text: '' },
    { key: neuerKey(), text: '' },
  ],
});

/** Kind of poll, chosen before the form: questions, or scheduling with or without an event. */
export type UmfrageTyp = 'fragen' | 'termin' | 'termin_vorlage' | 'termin_frei';

export const UMFRAGE_TYPEN: { typ: UmfrageTyp; titel: string; beschreibung: string }[] = [
  {
    typ: 'fragen',
    titel: 'Frage oder Fragen',
    beschreibung: 'Eigene Fragen mit festen Antworten und auf Wunsch eigenen Antworten.',
  },
  {
    typ: 'termin',
    titel: 'Terminfindung',
    beschreibung:
      'Die Antworten sind Termine. Den gewählten Termin legst du danach als Event einer Kategorie an.',
  },
  {
    typ: 'termin_vorlage',
    titel: 'Terminfindung aus Vorlage',
    beschreibung:
      'Wie Terminfindung, das Event entsteht aus einer Vorlage mit ihren Zeiten und Schichten.',
  },
  {
    typ: 'termin_frei',
    titel: 'Terminfindung ohne Event',
    beschreibung:
      'Termine mit Datum und auf Wunsch Uhrzeit, zum Beispiel für ein Treffen. Daraus entsteht kein Event.',
  },
];

const typVon = (u: UmfrageDetailDto): UmfrageTyp =>
  u.termin
    ? u.termin.vorlageId
      ? 'termin_vorlage'
      : 'termin'
    : u.terminFrei
      ? 'termin_frei'
      : 'fragen';

interface Werte {
  typ: UmfrageTyp;
  titel: string;
  beschreibung: string;
  endetAm: string;
  anonym: boolean;
  ergebnisse: UmfrageErgebnisse;
  pflicht: UmfrageKreis;
  optional: UmfrageKreis;
  erinnerungenPflicht: number[];
  erinnerungenOptional: number[];
  fragen: FrageWert[];
  /** Set for scheduling polls; then `fragen` is not used. */
  termin: TerminWerte | null;
  /** Dates of a scheduling poll without an event (`fragen` holds only the question's id). */
  freieTermine: TerminDatum[];
}

const neueWerte = (typ: UmfrageTyp): Werte => ({
  typ,
  titel: '',
  beschreibung: '',
  endetAm: tagNachher(heuteBerlin(), 14),
  anonym: false,
  ergebnisse: 'sofort',
  pflicht: { ...leererKreis(), status: ['mitglied'] },
  optional: leererKreis(),
  erinnerungenPflicht: [...UMFRAGE_ERINNERUNG_STANDARD.pflicht],
  erinnerungenOptional: [...UMFRAGE_ERINNERUNG_STANDARD.optional],
  fragen: [neueFrage()],
  termin:
    typ === 'termin' || typ === 'termin_vorlage'
      ? { ...neueTerminWerte(), quelle: typ === 'termin_vorlage' ? 'vorlage' : 'kategorie' }
      : null,
  freieTermine: [neuesDatum(tagNachher(heuteBerlin(), 7))],
});

const werteAus = (u: UmfrageDetailDto): Werte => ({
  typ: typVon(u),
  titel: u.titel,
  beschreibung: u.beschreibung ?? '',
  endetAm: u.endetAm,
  anonym: u.anonym,
  ergebnisse: u.ergebnisse,
  pflicht: u.pflicht,
  optional: u.optional,
  erinnerungenPflicht: u.erinnerungenPflicht,
  erinnerungenOptional: u.erinnerungenOptional,
  fragen: u.fragen.map((f) => ({
    key: neuerKey(),
    id: f.id,
    text: f.text,
    freitext: f.freitext,
    alle: f.maxAntworten === null,
    maxAntworten: f.maxAntworten ?? 1,
    optionen: f.optionen.map((o) => ({ key: neuerKey(), id: o.id, text: o.text })),
  })),
  termin: terminWerteAus(u),
  freieTermine: u.terminFrei
    ? (u.fragen[0]?.optionen ?? []).flatMap((o) =>
        o.termin
          ? [
              {
                key: neuerKey(),
                id: o.id,
                datum: o.termin.datum,
                bis: o.termin.datum,
                beginn: o.termin.beginn ?? '',
                ende: o.termin.ende ?? '',
                name: o.termin.name ?? '',
              },
            ]
          : [],
      )
    : [],
});

/** The single question of a scheduling poll without an event, its answers from the dates. */
const freieFrageAus = (w: Werte) => [
  {
    ...(w.fragen[0]?.id && { id: w.fragen[0].id }),
    text: '',
    freitext: false,
    maxAntworten: null,
    optionen: w.freieTermine
      .filter((d) => d.datum !== '')
      .map((d) => ({
        ...(d.id && { id: d.id }),
        text: '',
        termin: {
          datum: d.datum,
          bis: null,
          beginn: d.beginn || null,
          ende: d.ende || null,
          name: d.name.trim() || null,
        },
      })),
  },
];

/** The body for the API; empty options are left out. `art` is that of the event Kategorie. */
const eingabeAus = (w: Werte, kategorie?: EventKategorieDto) => ({
  titel: w.titel,
  beschreibung: w.beschreibung,
  endetAm: w.endetAm,
  anonym: w.anonym && w.typ !== 'termin_frei',
  ergebnisse: w.ergebnisse,
  pflicht: w.pflicht,
  optional: w.optional,
  erinnerungenPflicht: w.erinnerungenPflicht,
  erinnerungenOptional: w.erinnerungenOptional,
  fragen:
    w.typ === 'termin_frei'
      ? freieFrageAus(w)
      : w.fragen.map((f) => ({
          ...(f.id && { id: f.id }),
          text: f.text,
          freitext: f.freitext,
          maxAntworten: f.alle ? null : f.maxAntworten,
          optionen: f.optionen
            .filter((o) => o.text.trim() !== '')
            .map((o) => ({ ...(o.id && { id: o.id }), text: o.text })),
        })),
  terminFrei: w.typ === 'termin_frei',
  ...(w.termin ? { anonym: false, ...terminEingabeAus(w.termin, kategorie) } : { termin: null }),
});

/** First step of a new poll: what kind of poll it is. */
function TypWahl({ onWahl }: Readonly<{ onWahl: (typ: UmfrageTyp) => void }>) {
  return (
    <Stack gap="sm">
      <Text>Was möchtest du erstellen?</Text>
      {UMFRAGE_TYPEN.map((t) => (
        <UnstyledButton key={t.typ} onClick={() => onWahl(t.typ)}>
          <Paper withBorder p="md" mih={42}>
            <Group gap="sm" wrap="nowrap" align="flex-start">
              {TYP_ICONS[t.typ]}
              <Stack gap={2}>
                <Text fw={600}>{t.titel}</Text>
                <Text size="sm" c="dimmed">
                  {t.beschreibung}
                </Text>
              </Stack>
            </Group>
          </Paper>
        </UnstyledButton>
      ))}
    </Stack>
  );
}

const TYP_ICONS: Record<UmfrageTyp, ReactNode> = {
  fragen: <IconListCheck size={26} />,
  termin: <IconCalendarEvent size={26} />,
  termin_vorlage: <IconTemplate size={26} />,
  termin_frei: <IconCalendarQuestion size={26} />,
};

/** Moves the entry at `i` by `richtung` (-1 up, 1 down). */
function verschieben<T>(liste: T[], i: number, richtung: -1 | 1): T[] {
  const j = i + richtung;
  if (j < 0 || j >= liste.length) return liste;
  const neu = [...liste];
  [neu[i], neu[j]] = [neu[j]!, neu[i]!];
  return neu;
}

/** A circle: statuses, current holders of Posten and individual members. */
function KreisFelder({
  titel,
  hinweis,
  kreis,
  anderer,
  onChange,
}: Readonly<{
  titel: string;
  hinweis: string;
  kreis: UmfrageKreis;
  /** The other circle: what is chosen there cannot be chosen here. */
  anderer: UmfrageKreis;
  onChange: (k: UmfrageKreis) => void;
}>) {
  const api = useApi();
  const mitglieder = useMitgliederListe();
  const posten = useQuery({
    queryKey: postenKeys.liste(false),
    queryFn: async () => unwrap(await api.posten.$get({ query: {} })),
  });
  return (
    <Stack gap="xs">
      <Title order={4}>{titel}</Title>
      <Text size="sm" c="dimmed">
        {hinweis}
      </Text>
      <Checkbox.Group
        label="Status"
        value={kreis.status}
        onChange={(v) => onChange({ ...kreis, status: v as MitgliedStatus[] })}
      >
        <Group gap="md" mt="xs">
          {MITGLIED_STATI.map((s) => (
            <Checkbox
              key={s}
              value={s}
              size="md"
              disabled={anderer.status.includes(s)}
              label={labelFuer(MITGLIED_STATUS_LABELS, s, 'neutral')}
            />
          ))}
        </Group>
      </Checkbox.Group>
      <MultiSelect
        size="md"
        label="Posten"
        description="Wer den Posten gerade innehat."
        placeholder={kreis.posten.length === 0 ? 'Posten wählen' : undefined}
        searchable
        clearable
        hidePickedOptions
        nothingFoundMessage="Kein Posten gefunden"
        data={(posten.data ?? [])
          .filter((p) => !anderer.posten.includes(p.id))
          .map((p) => ({ value: p.id, label: p.name }))}
        value={kreis.posten}
        onChange={(v) => onChange({ ...kreis, posten: v })}
      />
      <MultiSelect
        size="md"
        label="Einzelne Personen"
        placeholder={kreis.personen.length === 0 ? 'Personen wählen' : undefined}
        searchable
        clearable
        hidePickedOptions
        nothingFoundMessage="Niemand gefunden"
        data={mitgliedOptionen(
          (mitglieder.data ?? []).filter((m) => !anderer.personen.includes(m.sub)),
        )}
        value={kreis.personen}
        onChange={(v) => onChange({ ...kreis, personen: v })}
      />
    </Stack>
  );
}

function ErinnerungFelder({
  label,
  werte,
  onChange,
}: Readonly<{ label: string; werte: number[]; onChange: (w: number[]) => void }>) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <Chip.Group
        multiple
        value={werte.map(String)}
        onChange={(v) => onChange(v.map(Number).sort((a, b) => b - a))}
      >
        <Group gap="xs">
          {[...UMFRAGE_ERINNERUNG_TAGE].reverse().map((t) => (
            <Chip key={t} value={String(t)} size="md">
              {erinnerungLabel(t)}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </Stack>
  );
}

function FrageEditor({
  frage,
  nr,
  anzahl,
  onChange,
  onEntfernen,
  onVerschieben,
}: Readonly<{
  frage: FrageWert;
  nr: number;
  anzahl: number;
  onChange: (f: FrageWert) => void;
  onEntfernen: () => void;
  onVerschieben: (richtung: -1 | 1) => void;
}>) {
  const gefuellt = frage.optionen.filter((o) => o.text.trim() !== '');
  const moeglich = Math.max(1, moeglicheAntworten({ ...frage, optionen: gefuellt }));
  const setOption = (i: number, text: string) =>
    onChange({
      ...frage,
      optionen: frage.optionen.map((o, j) => (j === i ? { ...o, text } : o)),
    });
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600}>Frage {nr}</Text>
          <Group gap={0} wrap="nowrap">
            <ActionIcon
              variant="subtle"
              color="gray"
              size={42}
              aria-label="Frage nach oben"
              disabled={nr === 1}
              onClick={() => onVerschieben(-1)}
            >
              <IconArrowUp size={20} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              size={42}
              aria-label="Frage nach unten"
              disabled={nr === anzahl}
              onClick={() => onVerschieben(1)}
            >
              <IconArrowDown size={20} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              size={42}
              aria-label="Frage entfernen"
              disabled={anzahl === 1}
              onClick={onEntfernen}
            >
              <IconTrash size={20} />
            </ActionIcon>
          </Group>
        </Group>
        <Textarea
          size="md"
          label="Frage"
          placeholder="z. B. Wann soll das Sommerfest sein?"
          // A single question may be left empty; the title is used instead.
          required={anzahl > 1}
          autosize
          minRows={1}
          value={frage.text}
          onChange={(e) => onChange({ ...frage, text: e.currentTarget.value })}
        />
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Antworten
          </Text>
          <SortierbareListe
            eintraege={frage.optionen}
            onChange={(optionen) => onChange({ ...frage, optionen })}
            griffLabel={(i) => `Antwort ${i + 1} verschieben`}
            zeile={(o, i, griff) => (
              <Group gap={4} wrap="nowrap">
                {griff}
                <TextInput
                  size="md"
                  style={{ flex: 1 }}
                  aria-label={`Antwort ${i + 1}`}
                  placeholder={`Antwort ${i + 1}`}
                  value={o.text}
                  onChange={(e) => setOption(i, e.currentTarget.value)}
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={42}
                  aria-label={`Antwort ${i + 1} entfernen`}
                  onClick={() =>
                    onChange({ ...frage, optionen: frage.optionen.filter((_, j) => j !== i) })
                  }
                >
                  <IconTrash size={20} />
                </ActionIcon>
              </Group>
            )}
          />
          <Button
            variant="default"
            leftSection={<IconPlus size={18} />}
            onClick={() =>
              onChange({ ...frage, optionen: [...frage.optionen, { key: neuerKey(), text: '' }] })
            }
          >
            Antwort hinzufügen
          </Button>
        </Stack>
        <Switch
          size="md"
          label="Eigene Antwort (Freitext) erlauben"
          checked={frage.freitext}
          onChange={(e) => onChange({ ...frage, freitext: e.currentTarget.checked })}
        />
        <Switch
          size="md"
          label="Beliebig viele Antworten wählbar"
          checked={frage.alle}
          onChange={(e) => onChange({ ...frage, alle: e.currentTarget.checked })}
        />
        {!frage.alle && (
          <ZahlFeld
            size="md"
            label="Höchstens wählbar"
            min={1}
            max={moeglich}
            allowDecimal={false}
            value={Math.min(frage.maxAntworten, moeglich)}
            onChange={(v) => onChange({ ...frage, maxAntworten: typeof v === 'number' ? v : 1 })}
          />
        )}
      </Stack>
    </Paper>
  );
}

function Formular({ umfrage, typ }: Readonly<{ umfrage?: UmfrageDetailDto; typ: UmfrageTyp }>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [w, setW] = useState<Werte>(() => (umfrage ? werteAus(umfrage) : neueWerte(typ)));
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [betroffene, setBetroffene] = useState<number | null>(null);
  const set = <K extends keyof Werte>(k: K, v: Werte[K]) => setW((alt) => ({ ...alt, [k]: v }));

  const kategorien = useEventKategorien();
  const vorlagen = useVorlagen();
  const speichern = async (bestaetigt = false) => {
    const kategorie = w.termin
      ? terminKategorie(w.termin, kategorien.liste, vorlagen.data ?? [])
      : undefined;
    if (w.termin?.quelle === 'vorlage' && !w.termin.vorlageId) {
      return setFehler('Bitte wähle eine Vorlage.');
    }
    if (
      w.termin?.quelle === 'kategorie' &&
      kategorie?.art === 'dienste' &&
      !w.termin.dienstformId
    ) {
      return setFehler('Bitte wähle die Dienstform.');
    }
    const json = eingabeAus(w, kategorie);
    const parsed = umfrageEingabeSchema.safeParse(json);
    if (!parsed.success) {
      return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    }
    if (json.endetAm < heuteBerlin()) {
      return setFehler('Das Ablaufdatum liegt in der Vergangenheit.');
    }
    setFehler(null);
    setLaeuft(true);
    try {
      let id = umfrage?.id;
      if (umfrage) {
        const res = await api.umfragen[':id'].$put({
          param: { id: umfrage.id },
          json: { ...json, bestaetigt },
        });
        if (res.status === 409) {
          const body = (await res.json()) as { error?: string; betroffene?: number };
          if (body.betroffene) return setBetroffene(body.betroffene);
          throw new ApiFehler(409, body.error ?? 'Die Umfrage ist beendet.');
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new ApiFehler(res.status, body?.error ?? 'Die Aktion ist fehlgeschlagen.');
        }
      } else {
        const res = await api.umfragen.$post({ json });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new ApiFehler(res.status, body?.error ?? 'Die Aktion ist fehlgeschlagen.');
        }
        id = ((await res.json()) as { id: string }).id;
      }
      await umfragenInvalidieren(qc);
      navigate(umfrageLink(id!), { replace: true });
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  };

  const setFrage = (i: number, f: FrageWert) =>
    set(
      'fragen',
      w.fragen.map((x, j) => (j === i ? f : x)),
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void speichern();
      }}
    >
      <Stack>
        {/* The Kategorie or Vorlage decides what the rest of the form asks for. */}
        {w.termin && <TerminQuelleFelder werte={w.termin} onChange={(t) => set('termin', t)} />}
        <TextInput
          size="md"
          label="Titel"
          placeholder={w.typ === 'fragen' ? 'z. B. Sommerfest 2027' : 'z. B. Nächste Sitzung'}
          description={
            w.typ === 'termin_vorlage'
              ? 'Wird der Titel des Events. Leer lassen: Titel der Vorlage.'
              : w.typ === 'termin'
                ? 'Wird der Titel des Events. Leer lassen: Name der Kategorie.'
                : w.typ === 'fragen' && w.fragen.length === 1
                  ? 'Bei nur einer Frage reicht Titel oder Frage, das andere wird übernommen.'
                  : undefined
          }
          required={w.typ === 'termin_frei' || (w.typ === 'fragen' && w.fragen.length > 1)}
          value={w.titel}
          onChange={(e) => set('titel', e.currentTarget.value)}
        />
        <Textarea
          size="md"
          label="Beschreibung"
          autosize
          minRows={2}
          value={w.beschreibung}
          onChange={(e) => set('beschreibung', e.currentTarget.value)}
        />
        <DatumFeld
          size="md"
          label="Läuft bis einschließlich"
          required
          loeschbar={false}
          min={heuteBerlin()}
          value={w.endetAm}
          onWert={(v) => set('endetAm', v)}
        />

        {w.termin ? (
          <>
            <Title order={3} mt="md">
              Termine
            </Title>
            <UmfrageTerminFelder werte={w.termin} onChange={(t) => set('termin', t)} />
          </>
        ) : w.typ === 'termin_frei' ? (
          <>
            <Title order={3} mt="md">
              Termine
            </Title>
            <Text size="sm" c="dimmed">
              Alle kreuzen an, was ihnen passt, oder „An keinem der Termine“.
            </Text>
            <TerminListe
              termine={w.freieTermine}
              onChange={(t) => set('freieTermine', t)}
              mitBis={false}
              mitZeiten
              zeitenOptional
            />
          </>
        ) : (
          <>
            <Title order={3} mt="md">
              Fragen
            </Title>
            {w.fragen.map((f, i) => (
              <FrageEditor
                key={f.key}
                frage={f}
                nr={i + 1}
                anzahl={w.fragen.length}
                onChange={(neu) => setFrage(i, neu)}
                onEntfernen={() =>
                  set(
                    'fragen',
                    w.fragen.filter((_, j) => j !== i),
                  )
                }
                onVerschieben={(r) => set('fragen', verschieben(w.fragen, i, r))}
              />
            ))}
            <Button
              variant="default"
              leftSection={<IconPlus size={18} />}
              onClick={() => set('fragen', [...w.fragen, neueFrage()])}
            >
              Frage hinzufügen
            </Button>
          </>
        )}

        <Title order={3} mt="md">
          Wer stimmt ab?
        </Title>
        <KreisFelder
          titel="Müssen abstimmen"
          hinweis="Bekommen alle Erinnerungen, auch wenn sie Umfrage-Erinnerungen ausgeschaltet haben."
          kreis={w.pflicht}
          anderer={w.optional}
          onChange={(k) => set('pflicht', k)}
        />
        <ErinnerungFelder
          label="Erinnerungen (morgens, nur wer noch nicht abgestimmt hat)"
          werte={w.erinnerungenPflicht}
          onChange={(v) => set('erinnerungenPflicht', v)}
        />
        <KreisFelder
          titel="Dürfen abstimmen"
          hinweis="Optional. Was oben gewählt ist, lässt sich hier nicht wählen. Wer über verschiedene Wege in beiden Kreisen landet (z. B. Posten und Status), muss abstimmen."
          kreis={w.optional}
          anderer={w.pflicht}
          onChange={(k) => set('optional', k)}
        />
        <ErinnerungFelder
          label="Erinnerungen für Optionale"
          werte={w.erinnerungenOptional}
          onChange={(v) => set('erinnerungenOptional', v)}
        />

        <Title order={3} mt="md">
          Sichtbarkeit
        </Title>
        <Switch
          size="md"
          label="Anonym"
          description={
            w.termin || w.typ === 'termin_frei'
              ? 'Terminumfragen sind nicht anonym, sonst lässt sich niemand eintragen.'
              : umfrage?.hatStimmen
                ? 'Lässt sich nach der ersten Stimme nicht mehr ändern.'
                : 'Niemand sieht, wer abgestimmt hat oder was, auch du nicht.'
          }
          disabled={umfrage?.hatStimmen || w.termin !== null || w.typ === 'termin_frei'}
          checked={w.anonym && w.termin === null && w.typ !== 'termin_frei'}
          onChange={(e) => set('anonym', e.currentTarget.checked)}
        />
        <Radio.Group
          label="Ergebnisse sichtbar"
          value={w.ergebnisse}
          onChange={(v) => set('ergebnisse', v as UmfrageErgebnisse)}
        >
          <Stack gap="sm" mt="xs">
            {UMFRAGE_ERGEBNISSE.map((e) => (
              <Radio
                key={e}
                value={e}
                size="md"
                label={UMFRAGE_ERGEBNISSE_LABELS[e].titel}
                description={UMFRAGE_ERGEBNISSE_LABELS[e].beschreibung}
              />
            ))}
          </Stack>
        </Radio.Group>

        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button
            variant="default"
            component={Link}
            to={umfrage ? umfrageLink(umfrage.id) : '/umfragen'}
          >
            Abbrechen
          </Button>
          <Button type="submit" loading={laeuft}>
            {umfrage ? 'Speichern' : 'Erstellen'}
          </Button>
        </Group>
      </Stack>
      {betroffene !== null && (
        <BestaetigenDialog
          titel="Stimmen werden ungültig"
          bestaetigenText="Trotzdem speichern"
          color="orange"
          onClose={() => setBetroffene(null)}
          onBestaetigt={() => speichern(true)}
        >
          <Text>
            {betroffene === 1
              ? 'Eine Person hat schon so abgestimmt, dass ihre Stimme durch die Änderung nicht mehr zählt.'
              : `${betroffene} Personen haben schon so abgestimmt, dass ihre Stimmen durch die Änderung nicht mehr zählen.`}{' '}
            Sie bekommen eine Nachricht und müssen erneut abstimmen.
          </Text>
        </BestaetigenDialog>
      )}
    </form>
  );
}

/** Creates a poll (`/umfragen/neu`) or edits one (`/umfragen/:id/bearbeiten`). */
export function UmfrageFormularPage() {
  const { id } = useParams();
  const umfrage = useUmfrage(id);
  // New polls start with the choice of their kind; the form follows it.
  const [typ, setTyp] = useState<UmfrageTyp | null>(null);
  return (
    <Stack maw={720}>
      <Anchor component={Link} to={id ? umfrageLink(id) : '/umfragen'} size="sm">
        ← Zurück
      </Anchor>
      <Title order={2}>{id ? 'Umfrage bearbeiten' : 'Umfrage erstellen'}</Title>
      {!id && !typ && <TypWahl onWahl={setTyp} />}
      {!id && typ && (
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Text fw={600} style={{ flex: '1 1 auto', minWidth: 0 }}>
            {UMFRAGE_TYPEN.find((t) => t.typ === typ)?.titel}
          </Text>
          <Button variant="subtle" style={{ flexShrink: 0 }} onClick={() => setTyp(null)}>
            Anderen Typ wählen
          </Button>
        </Group>
      )}
      {id && umfrage.isPending && <Loader m="md" aria-label="Umfrage wird geladen" />}
      {id && umfrage.isError && <Alert color="red">Die Umfrage konnte nicht geladen werden.</Alert>}
      {id && umfrage.data && !umfrage.data.darfBearbeiten && (
        <Alert color="red">Du darfst diese Umfrage nicht bearbeiten.</Alert>
      )}
      {id && umfrage.data?.darfBearbeiten && (
        <Formular key={umfrage.data.id} umfrage={umfrage.data} typ={typVon(umfrage.data)} />
      )}
      {!id && typ && <Formular key={typ} typ={typ} />}
    </Stack>
  );
}
