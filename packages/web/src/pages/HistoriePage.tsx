import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  MultiSelect,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  heuteBerlin,
  MITGLIED_STATI,
  statusZeitraeume,
  tagNachher,
  type Mitglied,
  type MitgliedHistorie,
  type MitgliedStatus,
  type Posten,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { labelFuer, MITGLIED_STATUS_LABELS } from '../i18n';
import { anzeigename, mitgliedLink, mitgliedName, nebenname } from '../mitglied';
import { BADGE_FARBE, StatusName } from '../StatusAnzeige';
import { Zeitstrahl, ZeitstrahlGruppe, ZeitstrahlStyle, type ZeitZeile } from '../Zeitstrahl';
import {
  besetzungSegmente,
  fruehestes,
  mantineFarbe,
  spaetestes,
  personenFarben,
  zeitraumText,
} from '../zeitstrahlLogik';

type Ansicht = 'mitglieder' | 'posten';

const liste = (wert: string | null): string[] => (wert ? wert.split(',').filter(Boolean) : []);
const UNBEKANNT_FARBE = 'gray.5';

/** A swatch plus text, for the legends. */
function LegendeEintrag({
  farbe,
  gestrichelt,
  children,
}: Readonly<{ farbe: string; gestrichelt?: boolean; children: React.ReactNode }>) {
  const c = mantineFarbe(farbe);
  return (
    <Group gap={6} wrap="nowrap">
      <Box
        aria-hidden
        style={{
          width: 16,
          height: 12,
          borderRadius: 3,
          flex: '0 0 auto',
          ...(gestrichelt
            ? {
                border: `1px dashed ${c}`,
                backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 2px, transparent 2px 6px)`,
              }
            : { background: c }),
        }}
      />
      <Text size="sm">{children}</Text>
    </Group>
  );
}

interface PersonDaten {
  kennung: string;
  mitglied: Mitglied | null;
  historie: MitgliedHistorie;
}

/** Status row plus one row per Posten ever held; bars follow the status during each Besetzung. */
function MitgliedBlock({
  person,
  bereich,
  heute,
}: Readonly<{ person: PersonDaten; bereich: { von: string; bis: string }; heute: string }>) {
  const { mitglied: m, historie } = person;
  if (!m) return <Alert color="yellow">Mitglied „{person.kennung}“ nicht gefunden.</Alert>;
  const ende = historie.deaktiviertAm ?? heute;
  const offen = historie.deaktiviertAm === null;
  const zeitraeume = statusZeitraeume(historie.statusVerlauf, ende);
  // For Besetzungen planned beyond today the current status is assumed to continue.
  const zeitraeumePosten =
    offen && zeitraeume.length > 0 && bereich.bis > ende
      ? [...zeitraeume.slice(0, -1), { ...zeitraeume.at(-1)!, bis: bereich.bis }]
      : zeitraeume;
  const name = (s: MitgliedStatus) => labelFuer(MITGLIED_STATUS_LABELS, s, m.anrede);

  const statusZeile: ZeitZeile = {
    key: 'status',
    label: (
      <Text size="sm" c="dimmed">
        Status
      </Text>
    ),
    balken: zeitraeume.map((z) => ({
      von: z.von,
      bis: z.bis,
      farbe: `${BADGE_FARBE[z.status]}.6`,
      titel: zeitraumText(name(z.status), z.von, z.bis, offen && z.bis === ende),
    })),
  };
  const postenZeilen = new Map<string, ZeitZeile>();
  for (const b of [...historie.besetzungen].sort((x, y) => (x.start < y.start ? -1 : 1))) {
    const bis = b.ende ?? ende;
    if (bis < b.start) continue;
    const zeile = postenZeilen.get(b.postenId) ?? {
      key: b.postenId,
      label: b.postenName,
      balken: [],
    };
    for (const seg of besetzungSegmente(b.start, bis, zeitraeumePosten)) {
      const bisOffen = offen && b.ende === null && seg.bis === bis;
      zeile.balken.push({
        von: seg.von,
        bis: seg.bis,
        farbe: seg.status ? `${BADGE_FARBE[seg.status]}.6` : UNBEKANNT_FARBE,
        gestrichelt: seg.status === null,
        titel: zeitraumText(
          `${b.postenName} · ${seg.status ? name(seg.status) : 'Status unbekannt'}`,
          seg.von,
          seg.bis,
          bisOffen,
        ),
      });
    }
    postenZeilen.set(b.postenId, zeile);
  }

  return (
    <Stack gap={4} className="zs-block">
      <Text component="div" size="lg">
        <Link to={mitgliedLink(m)} style={{ textDecoration: 'none' }}>
          <StatusName status={m.status}>{anzeigename(m)}</StatusName>
        </Link>
        {nebenname(m) && (
          <Text component="span" c="dimmed" size="sm">
            {' '}
            ({nebenname(m)})
          </Text>
        )}
      </Text>
      {zeitraeume.length === 0 && (
        <Text size="sm" c="dimmed">
          Kein Status mit Datum erfasst.
        </Text>
      )}
      <Zeitstrahl
        bereich={bereich}
        beschriftung={`Zeitstrahl von ${anzeigename(m)}`}
        zeilen={[statusZeile, ...postenZeilen.values()]}
      />
    </Stack>
  );
}

function MitgliederAnsicht({ kennungen }: Readonly<{ kennungen: string[] }>) {
  const api = useApi();
  const heute = heuteBerlin();
  const abfragen = useQueries({
    queries: kennungen.map((kennung) => ({
      queryKey: ['historie', kennung],
      queryFn: async (): Promise<Omit<PersonDaten, 'kennung'>> => {
        const [mres, historie] = await Promise.all([
          api.mitglieder[':kennung'].$get({ param: { kennung } }),
          api.mitglieder[':kennung'].historie.$get({ param: { kennung } }),
        ]);
        if (mres.status === 404 || historie.status === 404)
          return {
            mitglied: null,
            historie: { statusVerlauf: [], besetzungen: [], deaktiviertAm: null },
          };
        return { mitglied: await unwrap(mres), historie: await unwrap(historie) };
      },
    })),
  });
  if (abfragen.some((q) => q.isPending)) return <Loader aria-label="Historie wird geladen" />;
  if (abfragen.some((q) => q.isError))
    return <Alert color="red">Die Historie konnte nicht geladen werden.</Alert>;
  const personen: PersonDaten[] = abfragen.map((q, i) => ({
    kennung: kennungen[i]!,
    ...q.data!,
  }));
  const daten = personen.flatMap((p) => [
    ...p.historie.statusVerlauf.flatMap((e) => (e.ab ? [e.ab] : [])),
    ...p.historie.besetzungen.map((b) => b.start),
  ]);
  const von = fruehestes(daten, tagNachher(heute, -365));
  // Besetzungen may already have a planned end after today.
  const bis = spaetestes(
    personen.flatMap((p) => p.historie.besetzungen.flatMap((b) => (b.ende ? [b.ende] : []))),
    heute,
  );
  const bereich = { von, bis };
  return (
    <Stack gap="xl">
      {personen.map((p) => (
        <MitgliedBlock key={p.kennung} person={p} bereich={bereich} heute={heute} />
      ))}
      <Group gap="md" aria-label="Legende">
        {MITGLIED_STATI.map((s) => (
          <LegendeEintrag key={s} farbe={`${BADGE_FARBE[s]}.6`}>
            {labelFuer(MITGLIED_STATUS_LABELS, s, 'neutral')}
          </LegendeEintrag>
        ))}
        <LegendeEintrag farbe={UNBEKANNT_FARBE} gestrichelt>
          Status unbekannt
        </LegendeEintrag>
      </Group>
    </Stack>
  );
}

function PostenAnsicht({ ids, posten }: Readonly<{ ids: string[]; posten: Posten[] }>) {
  const heute = heuteBerlin();
  const gewaehlt = ids.flatMap((id) => posten.find((p) => p.id === id) ?? []);
  const alle = gewaehlt.flatMap((p) =>
    p.besetzungen.map((b) => ({ key: b.mitgliedSub, start: b.start })),
  );
  const farben = personenFarben(alle);
  const von = fruehestes(
    alle.map((a) => a.start),
    tagNachher(heute, -365),
  );
  const bereich = {
    von,
    bis: spaetestes(
      gewaehlt.flatMap((p) => p.besetzungen.flatMap((b) => (b.ende ? [b.ende] : []))),
      heute,
    ),
  };
  const personen = new Map<string, Posten['besetzungen'][number]['mitglied'] & { sub: string }>();
  for (const p of gewaehlt)
    for (const b of p.besetzungen)
      personen.set(b.mitgliedSub, { ...b.mitglied, sub: b.mitgliedSub });
  const legende = [...personen.values()].sort((a, b) =>
    (farben.get(a.sub) ?? '') === (farben.get(b.sub) ?? '')
      ? 0
      : alle.findIndex((x) => x.key === a.sub) - alle.findIndex((x) => x.key === b.sub),
  );

  return (
    <Stack gap="xl">
      {gewaehlt.map((p) => {
        const nachPerson = new Map<string, typeof p.besetzungen>();
        for (const b of p.besetzungen)
          nachPerson.set(b.mitgliedSub, [...(nachPerson.get(b.mitgliedSub) ?? []), b]);
        const zeilen: ZeitZeile[] = [...nachPerson.entries()]
          .map(([sub, bs]) => ({
            sub,
            bs: [...bs].sort((x, y) => (x.start < y.start ? -1 : 1)),
          }))
          .sort((a, b) =>
            a.bs[0]!.start < b.bs[0]!.start ? -1 : a.bs[0]!.start > b.bs[0]!.start ? 1 : 0,
          )
          .map(({ sub, bs }) => {
            const m = bs[0]!.mitglied;
            return {
              key: sub,
              label: (
                <Link
                  to={mitgliedLink({ username: m.username, sub })}
                  style={{ textDecoration: 'none' }}
                >
                  <StatusName status={m.status}>{mitgliedName(m)}</StatusName>
                </Link>
              ),
              balken: bs.map((b) => ({
                von: b.start,
                bis: b.ende ?? heute,
                farbe: farben.get(sub) ?? UNBEKANNT_FARBE,
                titel: zeitraumText(
                  `${p.name} · ${mitgliedName(m)}`,
                  b.start,
                  b.ende ?? heute,
                  b.ende === null,
                ),
              })),
            };
          });
        return (
          <Stack key={p.id} gap={4} className="zs-block">
            <Title order={4}>
              <Link
                to={`/posten/${encodeURIComponent(p.id)}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {p.name}
              </Link>
              {p.archiviert ? ' (archiviert)' : ''}
            </Title>
            {zeilen.length === 0 ? (
              <Text size="sm" c="dimmed">
                Dieser Posten wurde noch nie besetzt.
              </Text>
            ) : (
              <Zeitstrahl
                bereich={bereich}
                beschriftung={`Zeitstrahl von ${p.name}`}
                zeilen={zeilen}
              />
            )}
          </Stack>
        );
      })}
      <Group gap="md" aria-label="Legende">
        {legende.map((m) => (
          <LegendeEintrag key={m.sub} farbe={farben.get(m.sub) ?? UNBEKANNT_FARBE}>
            <StatusName status={m.status}>{mitgliedName(m)}</StatusName>
          </LegendeEintrag>
        ))}
      </Group>
    </Stack>
  );
}

/** Timeline of status changes and Posten for selected members, or of the holders of selected Posten. */
export function HistoriePage() {
  const api = useApi();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const ansicht: Ansicht = params.get('ansicht') === 'posten' ? 'posten' : 'mitglieder';
  const kennungen = liste(params.get('mitglieder'));
  const postenIds = liste(params.get('posten'));
  const mitDeaktivierten = can('users:manage');
  const mitArchiv = can('posten:bearbeiten');

  // Same cache entries as the Mitglieder and Posten pages.
  const mitglieder = useQuery({
    queryKey: mitDeaktivierten ? ['mitglieder', { deaktivierte: true }] : ['mitglieder'],
    queryFn: async () =>
      unwrap(
        mitDeaktivierten
          ? await api.mitglieder.$get({ query: { deaktivierte: '1' } } as never)
          : await api.mitglieder.$get(),
      ),
  });
  const posten = useQuery({
    queryKey: ['posten', { archiv: mitArchiv }],
    queryFn: async () => unwrap(await api.posten.$get({ query: mitArchiv ? { archiv: '1' } : {} })),
  });

  const mitgliedOptionen = useMemo(
    () =>
      (mitglieder.data ?? [])
        .map((m) => {
          const neben = nebenname(m);
          const text = neben ? `${anzeigename(m)} (${neben})` : anzeigename(m);
          return {
            value: m.username ?? m.sub,
            label: m.deaktiviert ? `${text} – deaktiviert` : text,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [mitglieder.data],
  );
  const postenOptionen = useMemo(
    () =>
      (posten.data ?? [])
        .map((p) => ({ value: p.id, label: p.archiviert ? `${p.name} (archiviert)` : p.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [posten.data],
  );

  const setze = (aenderung: Record<string, string>) =>
    setParams(
      (alt) => {
        const neu = new URLSearchParams(alt);
        for (const [k, v] of Object.entries(aenderung)) {
          if (v) neu.set(k, v);
          else neu.delete(k);
        }
        return neu;
      },
      { replace: true },
    );

  const auswahlLeer = (ansicht === 'mitglieder' ? kennungen : postenIds).length === 0;

  return (
    <Stack>
      <ZeitstrahlStyle />
      <Title order={2} data-druck="aus">
        Historie
      </Title>
      <Stack data-druck="aus">
        <SegmentedControl
          size="md"
          fullWidth
          aria-label="Ansicht"
          value={ansicht}
          onChange={(v) => setze({ ansicht: v })}
          data={[
            { value: 'mitglieder', label: 'Mitglieder' },
            { value: 'posten', label: 'Posten' },
          ]}
        />
        {ansicht === 'mitglieder' ? (
          <MultiSelect
            label="Mitglieder"
            placeholder="Mitglieder wählen"
            searchable
            data={mitgliedOptionen}
            value={kennungen}
            onChange={(v) => setze({ mitglieder: v.join(',') })}
            nothingFoundMessage="Kein Mitglied gefunden"
          />
        ) : (
          <MultiSelect
            label="Posten"
            placeholder="Posten wählen"
            searchable
            data={postenOptionen}
            value={postenIds}
            onChange={(v) => setze({ posten: v.join(',') })}
            nothingFoundMessage="Kein Posten gefunden"
          />
        )}
        <div>
          <Button
            variant="default"
            leftSection={<IconPrinter size={18} />}
            disabled={auswahlLeer}
            onClick={() => window.print()}
          >
            Drucken
          </Button>
        </div>
      </Stack>
      {auswahlLeer && (
        <Text c="dimmed">
          {ansicht === 'mitglieder'
            ? 'Wähle ein oder mehrere Mitglieder, um ihren Status und ihre Posten im Zeitverlauf zu sehen.'
            : 'Wähle einen oder mehrere Posten, um zu sehen, wer sie wann innehatte.'}
        </Text>
      )}
      {!auswahlLeer && ansicht === 'mitglieder' && (
        <ZeitstrahlGruppe>
          <MitgliederAnsicht kennungen={kennungen} />
        </ZeitstrahlGruppe>
      )}
      {!auswahlLeer && ansicht === 'posten' && posten.isPending && (
        <Loader aria-label="Posten werden geladen" />
      )}
      {!auswahlLeer && ansicht === 'posten' && posten.isError && (
        <Alert color="red">Die Posten konnten nicht geladen werden.</Alert>
      )}
      {!auswahlLeer && ansicht === 'posten' && posten.data && (
        <ZeitstrahlGruppe>
          <PostenAnsicht ids={postenIds} posten={posten.data} />
        </ZeitstrahlGruppe>
      )}
    </Stack>
  );
}
