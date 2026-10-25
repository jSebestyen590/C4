import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBan,
  IconCalendarPlus,
  IconChevronLeft,
  IconEdit,
  IconPlayerPlay,
  IconTrash,
  IconUserMinus,
  IconUserPlus,
  IconUsersPlus,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  datumBerlin,
  schichtDetails,
  ueberlappendeSchichten,
  type DienstDto,
  type EventDto,
  type SchichtDto,
} from '@c4/shared';
import { useApi } from '../api';
import { AktionsMenue } from '../AktionsMenue';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { DienstEintragenModal, type EintragModus } from '../DienstEintragenModal';
import { SCHICHT_ART_LABELS } from '../i18n';
import {
  AmpelBadge,
  FehltInfo,
  kategorieFarbe,
  PersonName,
  personAnzeigename,
} from '../KalenderAnzeige';
import { kalenderInvalidieren, useDienstformen, useKalenderEvent } from '../kalenderDaten';
import { schichtZeitAnzeigen, zeitraumAnzeigen } from '../kalenderZeit';
import { useEigeneSub } from '../organisator';
import { dienstIcsHerunterladen } from '../kalenderIcs';
import { pruefen } from '../warenApi';

type Dialog =
  | { art: 'eintragen'; schicht: SchichtDto; modus: EintragModus }
  | { art: 'entfernen'; dienst: DienstDto }
  | { art: 'absagen' }
  | { art: 'loeschen' };

/** Event with its Schichten: who is in, what is missing, and the buttons to sign up. */
export function EventDetailPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const eigeneSub = useEigeneSub();
  const event = useKalenderEvent(id);
  const dienstformen = useDienstformen();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const verwalten = can('events:verwalten');

  const rueckweg = (
    <Anchor component={Link} to="/kalender" size="sm">
      <Group gap={4} wrap="nowrap">
        <IconChevronLeft size={16} />
        Zurück zum Kalender
      </Group>
    </Anchor>
  );
  if (event.isError || dienstformen.isError) {
    return (
      <Stack>
        {rueckweg}
        <Alert color="red">Das Event konnte nicht geladen werden.</Alert>
      </Stack>
    );
  }
  if (event.isPending || dienstformen.isPending) return <Loader m="md" />;
  const e: EventDto = event.data;
  const tag = datumBerlin(e.beginn);
  const hatDienste = e.schichten.some((s) => s.dienste.length > 0);

  const meineSchichten = e.schichten.filter((s) =>
    s.dienste.some((d) => d.person.art === 'mitglied' && d.person.sub === eigeneSub),
  );
  const ueberlappungen = ueberlappendeSchichten(meineSchichten);

  const darfEntfernen = (d: DienstDto) =>
    verwalten ||
    (d.person.art === 'mitglied' && d.person.sub === eigeneSub) ||
    (d.person.art === 'extern' && d.eingetragenVon === eigeneSub);

  const absageSetzen = async (abgesagt: boolean) => {
    await pruefen(
      await api.kalender.events[':id'].absage.$put({ param: { id: e.id }, json: { abgesagt } }),
    );
    await kalenderInvalidieren(qc);
    notifications.show({
      color: 'green',
      message: abgesagt ? 'Das Event wurde abgesagt.' : 'Das Event findet wieder statt.',
    });
  };

  return (
    <Stack maw={800} gap="md">
      {rueckweg}
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <Stack gap={4}>
          <Title
            order={2}
            td={e.abgesagt ? 'line-through' : undefined}
            style={{ overflowWrap: 'anywhere' }}
          >
            {e.titel}
          </Title>
          <Text>{zeitraumAnzeigen(e.beginn, e.ende)} Uhr</Text>
          <Group gap="xs">
            <AmpelBadge bewertung={e.bewertung} />
            {e.kategorie && (
              <Badge color={kategorieFarbe(e.kategorie)} variant="outline">
                {e.kategorie.name}
              </Badge>
            )}
          </Group>
        </Stack>
        <AktionsMenue
          label="Event-Aktionen"
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconEdit size={18} />,
              onClick: () => void navigate(`/kalender/events/${e.id}/bearbeiten`),
              sichtbar: verwalten,
            },
            {
              text: 'Absagen',
              icon: <IconBan size={18} />,
              onClick: () => setDialog({ art: 'absagen' }),
              sichtbar: verwalten && !e.abgesagt,
            },
            {
              text: 'Wieder aufnehmen',
              icon: <IconPlayerPlay size={18} />,
              onClick: () => void absageSetzen(false),
              sichtbar: verwalten && e.abgesagt,
            },
            {
              text: 'Löschen',
              icon: <IconTrash size={18} />,
              color: 'red',
              trenner: true,
              onClick: () => setDialog({ art: 'loeschen' }),
              sichtbar: verwalten && !hatDienste,
            },
          ]}
        />
      </Group>

      {e.abgesagt && (
        <Alert color="gray" title="Abgesagt">
          Dieses Event findet nicht statt. Man kann sich nicht mehr eintragen.
        </Alert>
      )}
      {e.beschreibung && <Text style={{ whiteSpace: 'pre-wrap' }}>{e.beschreibung}</Text>}
      {ueberlappungen.length > 0 && (
        <Alert color="yellow" title="Überschneidung">
          {ueberlappungen.map(([a, b]) => (
            <Text key={a.id + b.id} size="sm">
              Du bist in „{a.name}“ und „{b.name}“ eingetragen, die sich zeitlich überschneiden.
            </Text>
          ))}
        </Alert>
      )}

      {e.schichten.length === 0 && <Text c="dimmed">Dieses Event hat keine Schichten.</Text>}
      {e.schichten.map((s) => {
        const details = schichtDetails(s);
        const ich = s.dienste.some(
          (d) => d.person.art === 'mitglied' && d.person.sub === eigeneSub,
        );
        const ohneBedarf = s.bedarfe.length === 0;
        const gesperrt = e.abgesagt || ohneBedarf;
        return (
          <Paper key={s.id} withBorder p="sm" radius="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={700} size="lg" style={{ overflowWrap: 'anywhere' }}>
                    {s.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {SCHICHT_ART_LABELS[s.art]} · {schichtZeitAnzeigen(s, tag)} Uhr
                  </Text>
                </Stack>
                {!e.abgesagt && <AmpelBadge bewertung={details.bewertung} size="sm" />}
              </Group>

              {details.dienstformen.length > 0 && (
                <Group gap="xs">
                  {details.dienstformen.map((d) => (
                    <Badge
                      key={d.dienstformId}
                      variant="light"
                      color={d.bisMinimum > 0 ? 'red' : d.bisWunsch > 0 ? 'yellow' : 'green'}
                      size="lg"
                      tt="none"
                    >
                      {dienstformen.nachId.get(d.dienstformId)?.name ?? 'Dienst'} {d.vorhanden}/
                      {d.wunsch} (min. {d.minimum})
                    </Badge>
                  ))}
                </Group>
              )}
              {!e.abgesagt && <FehltInfo schicht={s} dienstformen={dienstformen.nachId} />}

              {s.dienste.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Noch niemand eingetragen.
                </Text>
              ) : (
                <Stack gap={0}>
                  {s.dienste.map((d) => {
                    const eigener = d.person.art === 'mitglied' && d.person.sub === eigeneSub;
                    return (
                      <Group
                        key={d.id}
                        justify="space-between"
                        wrap="nowrap"
                        gap="xs"
                        py={4}
                        style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                      >
                        <Stack gap={0} style={{ minWidth: 0 }}>
                          <Text>
                            <PersonName person={d.person} />
                          </Text>
                          <Text size="sm" c="dimmed">
                            {dienstformen.nachId.get(d.dienstformId)?.name ?? 'Dienst'}
                            {d.kommentar ? ` · ${d.kommentar}` : ''}
                          </Text>
                        </Stack>
                        {darfEntfernen(d) &&
                          (eigener ? (
                            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                              <ActionIcon
                                variant="light"
                                size={44}
                                aria-label="Zum Kalender hinzufügen"
                                title="Zum Kalender hinzufügen"
                                onClick={() =>
                                  dienstIcsHerunterladen(
                                    [
                                      {
                                        id: d.id,
                                        eventId: e.id,
                                        eventTitel: e.titel,
                                        schichtName: s.name,
                                        dienstformName:
                                          dienstformen.nachId.get(d.dienstformId)?.name ?? 'Dienst',
                                        beginn: s.beginn,
                                        ende: s.ende,
                                        abgesagt: e.abgesagt,
                                      },
                                    ],
                                    `dienst-${datumBerlin(s.beginn)}.ics`,
                                  )
                                }
                              >
                                <IconCalendarPlus size={20} />
                              </ActionIcon>
                              <Button
                                variant="light"
                                color="red"
                                leftSection={<IconUserMinus size={18} />}
                                onClick={() => setDialog({ art: 'entfernen', dienst: d })}
                              >
                                Austragen
                              </Button>
                            </Group>
                          ) : (
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size={44}
                              aria-label={`${personAnzeigename(d.person)} entfernen`}
                              onClick={() => setDialog({ art: 'entfernen', dienst: d })}
                            >
                              <IconUserMinus size={20} />
                            </ActionIcon>
                          ))}
                      </Group>
                    );
                  })}
                </Stack>
              )}

              <Group gap="xs">
                <Button
                  leftSection={<IconUserPlus size={18} />}
                  disabled={gesperrt || ich}
                  onClick={() => setDialog({ art: 'eintragen', schicht: s, modus: 'selbst' })}
                >
                  Eintragen
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconUsersPlus size={18} />}
                  disabled={gesperrt}
                  onClick={() => setDialog({ art: 'eintragen', schicht: s, modus: 'extern' })}
                >
                  Externe eintragen
                </Button>
                {verwalten && (
                  <Button
                    variant="default"
                    leftSection={<IconUserPlus size={18} />}
                    disabled={gesperrt}
                    onClick={() => setDialog({ art: 'eintragen', schicht: s, modus: 'mitglied' })}
                  >
                    Mitglied eintragen
                  </Button>
                )}
              </Group>
              {ich && !e.abgesagt && (
                <Text size="sm" c="dimmed">
                  Du bist in dieser Schicht schon eingetragen.
                </Text>
              )}
              {ohneBedarf && !e.abgesagt && (
                <Text size="sm" c="dimmed">
                  Für diese Schicht gibt es keinen Bedarf, daher kann man sich nicht eintragen.
                </Text>
              )}
            </Stack>
          </Paper>
        );
      })}

      {dialog?.art === 'eintragen' && (
        <DienstEintragenModal
          schicht={dialog.schicht}
          modus={dialog.modus}
          dienstformen={dienstformen.nachId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.art === 'entfernen' && (
        <BestaetigenDialog
          titel={
            dialog.dienst.person.art === 'mitglied' && dialog.dienst.person.sub === eigeneSub
              ? 'Austragen'
              : 'Eintrag entfernen'
          }
          bestaetigenText={
            dialog.dienst.person.art === 'mitglied' && dialog.dienst.person.sub === eigeneSub
              ? 'Austragen'
              : 'Entfernen'
          }
          onClose={() => setDialog(null)}
          onBestaetigt={async () => {
            await pruefen(
              await api.kalender.dienste[':id'].$delete({ param: { id: dialog.dienst.id } }),
            );
            await kalenderInvalidieren(qc);
          }}
        >
          <Text>
            <PersonName person={dialog.dienst.person} verlinken={false} mitQuelle={false} /> wird
            aus dem Dienst „{dienstformen.nachId.get(dialog.dienst.dienstformId)?.name ?? 'Dienst'}“
            ausgetragen.
          </Text>
        </BestaetigenDialog>
      )}
      {dialog?.art === 'absagen' && (
        <BestaetigenDialog
          titel="Event absagen"
          bestaetigenText="Absagen"
          onClose={() => setDialog(null)}
          onBestaetigt={() => absageSetzen(true)}
        >
          <Text>
            „{e.titel}“ wird abgesagt. Die Einträge bleiben erhalten, zählen aber nicht in der
            Statistik. Du kannst das Event später wieder aufnehmen.
          </Text>
        </BestaetigenDialog>
      )}
      {dialog?.art === 'loeschen' && (
        <BestaetigenDialog
          titel="Event löschen"
          bestaetigenText="Löschen"
          onClose={() => setDialog(null)}
          onBestaetigt={async () => {
            await pruefen(await api.kalender.events[':id'].$delete({ param: { id: e.id } }));
            void navigate('/kalender', { replace: true });
            await kalenderInvalidieren(qc);
          }}
        >
          <Text>„{e.titel}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.</Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
