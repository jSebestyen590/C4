import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { durchgangEingabeSchema, mlZuLiter } from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { mitgliedOptionen, useEigeneSub, useMitgliederListe } from '../organisator';
import { alsZahl } from '../zahlSchritt';
import { ZahlFeld } from '../ZahlFeld';
import { jePersonMl, literAnzeigen, trichterOptionLabel } from '../trichterAnzeige';
import { trichterInvalidieren, useTrichterListe } from '../trichterDaten';
import { fehlerText, pruefen } from '../warenApi';

/** Records a Durchgang: funnel, participants (not oneself), shared volume and time. */
export function TrichterDurchgangPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const darfVerwalten = useAuth().can('trichter:verwalten');
  const telefon = useMediaQuery('(max-width: 48em)');
  const eigeneSub = useEigeneSub();
  const trichterListe = useTrichterListe();
  const mitglieder = useMitgliederListe();

  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [teilnehmende, setTeilnehmende] = useState<string[]>([]);
  const [volumen, setVolumen] = useState<number | string>('');
  const [anderer, setAnderer] = useState(false);
  const [zeitpunkt, setZeitpunkt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const aktive = useMemo(
    () => (trichterListe.data ?? []).filter((t) => !t.archiviert),
    [trichterListe.data],
  );
  // Exactly one active funnel is preselected.
  const trichterId = gewaehlt ?? (aktive.length === 1 ? (aktive[0]?.id ?? null) : null);
  const trichter = aktive.find((t) => t.id === trichterId);
  const maxLiter = trichter ? mlZuLiter(trichter.volumenMl) : undefined;
  // Until the volume is touched it follows the funnel.
  const volumenWert = volumen === '' && maxLiter !== undefined ? maxLiter : volumen;
  const liter = alsZahl(volumenWert);

  const optionen = useMemo(
    () => mitgliedOptionen((mitglieder.data ?? []).filter((m) => m.sub !== eigeneSub)),
    [mitglieder.data, eigeneSub],
  );

  const trichterWechseln = (id: string | null) => {
    setGewaehlt(id);
    const neu = aktive.find((t) => t.id === id);
    if (!neu) return;
    setTeilnehmende((t) => t.slice(0, neu.auslaesse));
    setVolumen(mlZuLiter(neu.volumenMl));
  };

  const senden = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = {
      trichterId: trichterId ?? '',
      volumenL: liter ?? Number.NaN,
      teilnehmende,
      ...(anderer &&
        zeitpunkt && { zeitpunkt: new Date(zeitpunkt.replace(' ', 'T')).toISOString() }),
    };
    const parsed = durchgangEingabeSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    setLaeuft(true);
    try {
      await pruefen(await api.trichter.durchgaenge.$post({ json: parsed.data }));
      await trichterInvalidieren(qc);
      notifications.show({ color: 'green', message: 'Der Durchgang wurde eingetragen.' });
      navigate('/trichter');
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  const laden = trichterListe.isPending || mitglieder.isPending;
  return (
    <Stack maw={600}>
      <Anchor component={Link} to="/trichter" size="sm">
        <Group gap={4} wrap="nowrap">
          <IconChevronLeft size={16} />
          Zurück zum Trichter
        </Group>
      </Anchor>
      <Title order={2}>Trichtern eintragen</Title>
      {laden && <Loader m="md" />}
      {(trichterListe.isError || mitglieder.isError) && (
        <Alert color="red">Die Daten konnten nicht geladen werden.</Alert>
      )}
      {trichterListe.data && aktive.length === 0 && (
        <Alert color="yellow">
          Es gibt keinen aktiven Trichter.{' '}
          {darfVerwalten ? (
            <Anchor component={Link} to="/trichter/verwaltung">
              Trichter anlegen
            </Anchor>
          ) : (
            'Bitte den Vorstand, einen anzulegen.'
          )}
        </Alert>
      )}
      {trichterListe.data && aktive.length > 0 && mitglieder.data && (
        <form onSubmit={(e) => void senden(e)}>
          <Stack>
            <Select
              size="md"
              label="Trichter"
              required
              data={aktive.map((t) => ({ value: t.id, label: trichterOptionLabel(t) }))}
              value={trichterId}
              allowDeselect={false}
              onChange={trichterWechseln}
            />
            <MultiSelect
              size="md"
              label="Teilnehmende"
              description={
                trichter
                  ? `bis zu ${trichter.auslaesse} ${trichter.auslaesse === 1 ? 'Person' : 'Personen'}`
                  : undefined
              }
              placeholder="Mitglieder auswählen"
              required
              searchable
              hidePickedOptions
              nothingFoundMessage="Niemand gefunden"
              // Once every outlet is taken the others are greyed out instead of looking pickable.
              data={
                trichter && teilnehmende.length >= trichter.auslaesse
                  ? // Picked ones stay enabled, otherwise their chips lose the remove button.
                    optionen.map((o) => ({ ...o, disabled: !teilnehmende.includes(o.value) }))
                  : optionen
              }
              value={teilnehmende}
              onChange={setTeilnehmende}
              maxValues={trichter?.auslaesse}
            />
            <Text size="sm" c="dimmed" mt={-8}>
              Dich selbst tragen andere ein.
            </Text>
            <ZahlFeld
              label="Volumen (l)"
              required
              value={volumenWert}
              onChange={setVolumen}
              min={0.5}
              max={maxLiter}
              step={0.5}
              decimalScale={2}
              allowDecimal
              decimalSeparator=","
              allowNegative={false}
              inputMode="decimal"
            />
            {liter !== undefined && teilnehmende.length > 0 && (
              <Text size="sm" c="dimmed" mt={-8}>
                je Person {literAnzeigen(jePersonMl(liter * 1000, teilnehmende.length))}
              </Text>
            )}
            <Switch
              size="md"
              label="Anderer Zeitpunkt"
              checked={anderer}
              onChange={(e) => setAnderer(e.currentTarget.checked)}
            />
            {anderer && (
              <DateTimePicker
                size="md"
                label="Zeitpunkt"
                required
                valueFormat="DD.MM.YYYY HH:mm"
                maxDate={new Date()}
                dropdownType={telefon ? 'modal' : 'popover'}
                value={zeitpunkt}
                onChange={setZeitpunkt}
              />
            )}
            {fehler && <Alert color="red">{fehler}</Alert>}
            <Button type="submit" size="md" loading={laeuft}>
              Eintragen
            </Button>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
