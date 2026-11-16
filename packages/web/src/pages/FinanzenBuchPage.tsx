import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { BuchSeiteDto } from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { BUCH_KEY, BuchInhaber, Saldo, seitePfad, useBuchSeiten } from '../buchDaten';
import { HILFE } from '../finanzenHilfe';
import { jsonOderFehler } from '../finanzenDaten';
import { FeldLabel } from '../InfoHinweis';
import { KartenOderTabelle, KlickKarte } from '../KartenOderTabelle';
import { mitgliedOptionen, useMitgliederListe } from '../organisator';
import { fehlerText } from '../warenApi';
import { ZahlFeld } from '../ZahlFeld';
import { ZurueckLink } from '../ZurueckLink';

const BETRAG = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;

/** Modal: new page for a member or an external name; the next free number is preselected. */
function SeiteAnlegenModal({
  seiten,
  onClose,
}: Readonly<{ seiten: readonly BuchSeiteDto[]; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mitglieder = useMitgliederListe();
  const [nummer, setNummer] = useState<number | string>(
    Math.max(0, ...seiten.map((s) => s.nummer)) + 1,
  );
  const [art, setArt] = useState<'mitglied' | 'extern'>('mitglied');
  const [sub, setSub] = useState<string | null>(null);
  const [externName, setExternName] = useState('');

  const vergeben = new Set(seiten.flatMap((s) => (s.mitglied ? [s.mitglied.sub] : [])));
  const optionen = mitgliedOptionen(
    (mitglieder.data ?? []).filter((m) => !m.deaktiviert && !vergeben.has(m.sub)),
  );
  const nummerOk = typeof nummer === 'number' && Number.isInteger(nummer) && nummer >= 1;
  const nummerBelegt = nummerOk && seiten.some((s) => s.nummer === nummer);
  const inhaberOk = art === 'mitglied' ? sub !== null : externName.trim() !== '';
  const gueltig = nummerOk && !nummerBelegt && inhaberOk;

  const anlegen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      jsonOderFehler<{ id: string }>(
        await api.buch.seiten.$post({
          json: {
            nummer: Number(nummer),
            ...(art === 'mitglied' ? { mitgliedSub: sub } : { externName: externName.trim() }),
          },
        }),
      ),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: BUCH_KEY });
      notifications.show({ color: 'green', message: `Seite ${nummer} angelegt.` });
      onClose();
      void navigate(seitePfad(id));
    },
  });

  return (
    <Modal opened onClose={onClose} title="Seite anlegen">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (gueltig) anlegen.mutate();
        }}
      >
        <Stack>
          <ZahlFeld
            size="md"
            label={<FeldLabel text="Nummer" hilfe={HILFE.buch.nummer} />}
            value={nummer}
            onChange={setNummer}
            min={1}
            max={9999}
            allowDecimal={false}
            error={
              nummerBelegt ? 'Die Nummer ist bei einer aktiven Seite schon vergeben.' : undefined
            }
          />
          <SegmentedControl
            fullWidth
            size="md"
            value={art}
            onChange={(v) => setArt(v as 'mitglied' | 'extern')}
            data={[
              { value: 'mitglied', label: 'Mitglied' },
              { value: 'extern', label: 'Extern' },
            ]}
          />
          {art === 'mitglied' ? (
            <Select
              size="md"
              label={<FeldLabel text="Mitglied" hilfe={HILFE.buch.inhaber} />}
              placeholder="Mitglied suchen"
              searchable
              data={optionen}
              value={sub}
              onChange={setSub}
              nothingFoundMessage="Nichts gefunden"
              description="Nur Mitglieder ohne aktive Seite."
            />
          ) : (
            <TextInput
              size="md"
              label={<FeldLabel text="Externer Name" hilfe={HILFE.buch.inhaber} />}
              value={externName}
              onChange={(e) => setExternName(e.currentTarget.value)}
              maxLength={100}
            />
          )}
          {anlegen.isError && <Alert color="red">{fehlerText(anlegen.error)}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={anlegen.isPending} disabled={!gueltig}>
              Anlegen
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** All pages of the Buch with balance (desktop first); entry to Abrechnen and Tarife. */
export function FinanzenBuchPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [ansicht, setAnsicht] = useState<'aktiv' | 'archiv'>('aktiv');
  const [anlegen, setAnlegen] = useState(false);
  const seiten = useBuchSeiten(ansicht === 'archiv');
  const aktive = useBuchSeiten(false);
  const liste = seiten.data ?? [];
  const darfBuchen = can('finanzen:buchen');
  const summe = liste.reduce((s, x) => s + x.saldoCent, 0);

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Title order={2}>Buch</Title>
      <Text c="dimmed" size="sm">
        Die Strichlisten aller Mitglieder und Gäste. Das Buch ist ein Nebenbuch: Es erzeugt keine
        Journalbuchungen.
      </Text>
      <Group gap="sm">
        {darfBuchen && (
          <Button component={Link} to="/finanzen/buch/abrechnen">
            Abrechnen
          </Button>
        )}
        {darfBuchen && (
          <Button variant="default" onClick={() => setAnlegen(true)} disabled={!aktive.data}>
            Seite anlegen
          </Button>
        )}
        <Button component={Link} to="/finanzen/buch/tarife" variant="default">
          Tarife
        </Button>
      </Group>
      <SegmentedControl
        size="md"
        value={ansicht}
        onChange={(v) => setAnsicht(v as 'aktiv' | 'archiv')}
        data={[
          { value: 'aktiv', label: 'Aktive Seiten' },
          { value: 'archiv', label: 'Archiviert' },
        ]}
        maw={360}
      />
      {seiten.isPending && <Loader m="md" aria-label="Seiten werden geladen" />}
      {seiten.isError && <Alert color="red">Die Seiten konnten nicht geladen werden.</Alert>}
      {seiten.data && liste.length === 0 && (
        <Text c="dimmed">
          {ansicht === 'aktiv' ? 'Noch keine Seiten angelegt.' : 'Keine archivierten Seiten.'}
        </Text>
      )}
      <KartenOderTabelle
        zeilen={liste}
        zeilenKey={(s) => s.id}
        tabelle={{ verticalSpacing: 6, highlightOnHover: true }}
        karte={(s) => (
          <KlickKarte to={seitePfad(s.id)}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text c="dimmed" size="sm">
                  Seite {s.nummer}
                </Text>
                <Text>
                  <BuchInhaber seite={s} verlinken={false} />
                </Text>
              </Stack>
              <Stack gap={2} align="flex-end">
                <Saldo cent={s.saldoCent} />
                {s.ueberzug && <Badge color="red">Überzogen</Badge>}
              </Stack>
            </Group>
          </KlickKarte>
        )}
        kopf={
          <Table.Tr>
            <Table.Th w={90}>Nummer</Table.Th>
            <Table.Th>Mitglied / Extern</Table.Th>
            <Table.Th style={BETRAG}>Saldo</Table.Th>
            <Table.Th w={120} />
          </Table.Tr>
        }
        zeile={(s) => (
          <Table.Tr
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('a')) void navigate(seitePfad(s.id));
            }}
          >
            <Table.Td>
              <Link to={seitePfad(s.id)} style={{ color: 'inherit', textDecoration: 'none' }}>
                {s.nummer}
              </Link>
            </Table.Td>
            <Table.Td>
              <BuchInhaber seite={s} />
            </Table.Td>
            <Table.Td style={BETRAG}>
              <Saldo cent={s.saldoCent} />
            </Table.Td>
            <Table.Td>{s.ueberzug && <Badge color="red">Überzogen</Badge>}</Table.Td>
          </Table.Tr>
        )}
      />
      {liste.length > 0 && (
        <Text size="sm" c="dimmed">
          {liste.length} {liste.length === 1 ? 'Seite' : 'Seiten'} · Summe der Salden:{' '}
          <Saldo cent={summe} fett={false} />
        </Text>
      )}
      {anlegen && aktive.data && (
        <SeiteAnlegenModal seiten={aktive.data} onClose={() => setAnlegen(false)} />
      )}
    </Stack>
  );
}
