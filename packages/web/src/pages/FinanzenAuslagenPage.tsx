import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { centAnzeigen, datumAnzeigen, type AuslageMitgliedDto } from '@c4/shared';
import { useAuth } from '../auth';
import { ErstattungDialog } from '../ErstattungDialog';
import { BETRAG_STIL, belegPfad, useAuslagen } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

/** Open Auslagen per member; select Belege of one member to reimburse them in one booking. */
export function FinanzenAuslagenPage() {
  const auslagen = useAuslagen();
  const { can } = useAuth();
  const [auswahl, setAuswahl] = useState<ReadonlySet<string>>(new Set());
  const [erstatten, setErstatten] = useState<AuslageMitgliedDto | null>(null);
  const mitglieder = auslagen.data?.mitglieder ?? [];

  const umschalten = (ids: readonly string[], an: boolean) =>
    setAuswahl((alt) => {
      const neu = new Set(alt);
      for (const id of ids) {
        if (an) neu.add(id);
        else neu.delete(id);
      }
      return neu;
    });

  return (
    <Stack maw={1000}>
      <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
      <Group gap={4}>
        <Title order={2}>Offene Auslagen</Title>
        <InfoHinweis feld="Offene Auslagen" text={HILFE.belege.auslage} />
      </Group>
      {auslagen.isPending && <Loader m="md" aria-label="Auslagen werden geladen" />}
      {auslagen.isError && <Alert color="red">Die Auslagen konnten nicht geladen werden.</Alert>}
      {auslagen.data && mitglieder.length === 0 && (
        <Text c="dimmed">Es gibt keine offenen Auslagen.</Text>
      )}
      {mitglieder.map((m) => {
        const ids = m.belege.map((b) => b.id);
        const gewaehlt = m.belege.filter((b) => auswahl.has(b.id));
        const alle = gewaehlt.length === m.belege.length;
        return (
          <Paper key={m.mitgliedId} withBorder p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Stack gap={0}>
                  {m.mitglied ? (
                    <Anchor component={Link} to={mitgliedLink(m.mitglied)}>
                      <StatusName status={m.mitglied.status}>{mitgliedName(m.mitglied)}</StatusName>
                    </Anchor>
                  ) : (
                    <Text fw={700}>Unbekanntes Mitglied</Text>
                  )}
                  <Text size="sm" c="dimmed">
                    {m.belege.length} {m.belege.length === 1 ? 'Beleg' : 'Belege'}, zusammen{' '}
                    <Text span fw={600} c={m.summeCent < 0 ? 'red.8' : 'dark'}>
                      {centAnzeigen(m.summeCent)}
                    </Text>
                  </Text>
                  {m.summeCent < 0 && (
                    <Text size="sm" fw={600} c="red.8">
                      {m.mitglied ? (
                        <StatusName status={m.mitglied.status}>
                          {mitgliedName(m.mitglied)}
                        </StatusName>
                      ) : (
                        'Das Mitglied'
                      )}{' '}
                      schuldet dem Verein {centAnzeigen(-m.summeCent)}.
                    </Text>
                  )}
                </Stack>
                {can('finanzen:buchen') && (
                  <Button disabled={gewaehlt.length === 0} onClick={() => setErstatten(m)}>
                    {gewaehlt.length === 0
                      ? 'Belege wählen'
                      : gewaehlt.reduce((s, b) => s + b.summeCent, 0) < 0
                        ? `${gewaehlt.length} als Einlage buchen (${centAnzeigen(-gewaehlt.reduce((s, b) => s + b.summeCent, 0))})`
                        : `${gewaehlt.length} erstatten (${centAnzeigen(gewaehlt.reduce((s, b) => s + b.summeCent, 0))})`}
                  </Button>
                )}
              </Group>
              {can('finanzen:buchen') && (
                <Checkbox
                  label="Alle Belege wählen"
                  checked={alle}
                  indeterminate={!alle && gewaehlt.length > 0}
                  onChange={(e) => umschalten(ids, e.currentTarget.checked)}
                />
              )}
              <Table verticalSpacing={6} tabularNums>
                <Table.Tbody>
                  {m.belege.map((b) => (
                    <Table.Tr key={b.id}>
                      {can('finanzen:buchen') && (
                        <Table.Td w={42}>
                          <Checkbox
                            aria-label={`Beleg ${b.nummer} wählen`}
                            checked={auswahl.has(b.id)}
                            onChange={(e) => umschalten([b.id], e.currentTarget.checked)}
                          />
                        </Table.Td>
                      )}
                      <Table.Td>
                        <Anchor component={Link} to={belegPfad(b.id)}>
                          {b.nummer}
                        </Anchor>
                        <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                          {b.rechnungssteller}, {datumAnzeigen(b.belegdatum)}
                        </Text>
                      </Table.Td>
                      <Table.Td style={BETRAG_STIL}>{centAnzeigen(b.summeCent)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Paper>
        );
      })}
      {erstatten && (
        <ErstattungDialog
          mitglied={erstatten.mitglied}
          mitgliedId={erstatten.mitgliedId}
          belege={erstatten.belege.filter((b) => auswahl.has(b.id))}
          onClose={() => {
            setErstatten(null);
            setAuswahl(new Set());
          }}
        />
      )}
    </Stack>
  );
}
