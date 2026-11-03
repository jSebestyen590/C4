import {
  ActionIcon,
  Alert,
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
  IconEdit,
  IconPhoto,
  IconPlayerPlay,
  IconTrash,
  IconUserMinus,
  IconUserPlus,
  IconUsersPlus,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  datumBerlin,
  schichtDetails,
  schichtBezeichnung,
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
import {
  AmpelBadge,
  dienstName,
  EventStatusBadge,
  FehltInfo,
  kategorieFarbe,
  PersonName,
  personAnzeigename,
} from '../KalenderAnzeige';
import { kalenderInvalidieren, useDienstformen, useKalenderEvent } from '../kalenderDaten';
import { kalenderLink, zeitraumAnzeigen } from '../kalenderZeit';
import { useEigeneSub } from '../organisator';
import { EventAboButton, EventTeilnahme, EventVerfuegbarkeit } from '../EventTeilnahme';
import { SCHICHT_ART_LABELS } from '../i18n';
import { fehlerAnzeigen, pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

type Dialog =
  | { art: 'eintragen'; schicht: SchichtDto; modus: EintragModus }
  | { art: 'entfernen'; dienst: DienstDto; schicht: SchichtDto }
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
  const [ordnerLaeuft, setOrdnerLaeuft] = useState(false);
  const verwalten = can('events:verwalten');

  const rueckweg = (
    <ZurueckLink to={kalenderLink(event.data ? datumBerlin(event.data.beginn) : null)}>
      Zurück zum Kalender
    </ZurueckLink>
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
  const hatDienste = e.schichten.some((s) => s.dienste.length > 0);

  const meineSchichten = e.schichten.filter((s) =>
    s.dienste.some((d) => d.person.art === 'mitglied' && d.person.sub === eigeneSub),
  );
  const ueberlappungen = ueberlappendeSchichten(meineSchichten);

  // Every member may remove any member's Dienst; Externe only who entered them (or managers).
  const darfEntfernen = (d: DienstDto) =>
    d.person.art === 'mitglied' || verwalten || d.eingetragenVon === eigeneSub;

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

  const ordnerAnlegen = async () => {
    setOrdnerLaeuft(true);
    try {
      await pruefen(
        await api.kalender.events[':id']['bilder-ordner'].$post({ param: { id: e.id } }),
      );
      await kalenderInvalidieren(qc);
      notifications.show({ color: 'green', message: 'Bilder-Ordner angelegt.' });
    } catch (err) {
      fehlerAnzeigen(err);
    } finally {
      setOrdnerLaeuft(false);
    }
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
            {e.anzeigeTitel}
          </Title>
          <Text>
            {zeitraumAnzeigen(e.beginn, e.ende, e.dauer)}
            {e.dauer === 'ganztaegig' ? '' : ' Uhr'}
          </Text>
          <Group gap="xs">
            <EventStatusBadge event={e} />
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
      {e.verantwortlich && (
        <Text>
          Verantwortlich: <PersonName person={e.verantwortlich} />
        </Text>
      )}
      {e.beschreibung && <Text style={{ whiteSpace: 'pre-wrap' }}>{e.beschreibung}</Text>}
      <EventAboButton event={e} />
      {e.bilderOrdnerUrl ? (
        <Group>
          <Button
            variant="default"
            component="a"
            href={e.bilderOrdnerUrl}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconPhoto size={18} />}
          >
            Bilder
          </Button>
        </Group>
      ) : (
        can('bilder:lesen') &&
        !e.abgesagt && (
          <Group>
            <Button
              variant="default"
              leftSection={<IconPhoto size={18} />}
              loading={ordnerLaeuft}
              onClick={() => void ordnerAnlegen()}
            >
              Bilder-Ordner anlegen
            </Button>
          </Group>
        )
      )}
      {e.art === 'teilnahme' && <EventTeilnahme event={e} />}
      {ueberlappungen.length > 0 && (
        <Alert color="yellow" title="Überschneidung">
          {ueberlappungen.map(([a, b]) => (
            <Text key={a.id + b.id} size="sm">
              Du bist in „{schichtBezeichnung(a, e.beginn)}“ und „{schichtBezeichnung(b, e.beginn)}“
              eingetragen, die sich zeitlich überschneiden.
            </Text>
          ))}
        </Alert>
      )}

      {e.art === 'dienste' && e.schichten.length === 0 && (
        <Text c="dimmed">Dieses Event hat keine Schichten.</Text>
      )}
      {(e.art === 'dienste' ? e.schichten : []).map((s) => {
        const details = schichtDetails(s);
        const ich = s.dienste.some(
          (d) => d.person.art === 'mitglied' && d.person.sub === eigeneSub,
        );
        const ohneBedarf = s.art === 'betrieb' && s.bedarfe.length === 0;
        const gesperrt = e.abgesagt || ohneBedarf;
        return (
          <Paper key={s.id} withBorder p="sm" radius="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={700} size="lg" style={{ overflowWrap: 'anywhere' }}>
                    {schichtBezeichnung(s, e.beginn)}
                  </Text>
                </Stack>
                {!e.abgesagt && <AmpelBadge bewertung={details.bewertung} size="sm" />}
              </Group>

              {(details.dienstformen.length > 0 || details.anzahl) && (
                <Group gap="xs">
                  {details.anzahl && (
                    <Badge
                      variant="light"
                      color={
                        details.anzahl.bisMinimum > 0
                          ? 'red'
                          : details.anzahl.bisWunsch > 0
                            ? 'yellow'
                            : 'green'
                      }
                      size="lg"
                      tt="none"
                    >
                      {SCHICHT_ART_LABELS[s.art]} {details.anzahl.vorhanden}/{details.anzahl.wunsch}{' '}
                      (min. {details.anzahl.minimum})
                    </Badge>
                  )}
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
                          {(d.dienstformId !== null || d.kommentar) && (
                            <Text size="sm" c="dimmed">
                              {[
                                d.dienstformId !== null
                                  ? dienstName(s, d.dienstformId, dienstformen.nachId)
                                  : null,
                                d.kommentar,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          )}
                        </Stack>
                        {darfEntfernen(d) &&
                          (eigener ? (
                            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                              <Button
                                variant="light"
                                color="red"
                                leftSection={<IconUserMinus size={18} />}
                                onClick={() =>
                                  setDialog({ art: 'entfernen', dienst: d, schicht: s })
                                }
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
                              onClick={() => setDialog({ art: 'entfernen', dienst: d, schicht: s })}
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
                <Button
                  variant="default"
                  leftSection={<IconUserPlus size={18} />}
                  disabled={gesperrt}
                  onClick={() => setDialog({ art: 'eintragen', schicht: s, modus: 'mitglied' })}
                >
                  Mitglied eintragen
                </Button>
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

      <EventVerfuegbarkeit event={e} />

      {dialog?.art === 'eintragen' && (
        <DienstEintragenModal
          nichtVerfuegbar={e.nichtVerfuegbar}
          schicht={dialog.schicht}
          eventBeginn={e.beginn}
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
            aus dem Dienst „
            {dienstName(dialog.schicht, dialog.dienst.dienstformId, dienstformen.nachId)}“
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
            „{e.anzeigeTitel}“ wird abgesagt. Die Einträge bleiben erhalten, zählen aber nicht in
            der Dienstschwein-Auswertung. Du kannst das Event später wieder aufnehmen.
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
            void navigate(kalenderLink(datumBerlin(e.beginn)), { replace: true });
            await kalenderInvalidieren(qc);
          }}
        >
          <Text>
            „{e.anzeigeTitel}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
