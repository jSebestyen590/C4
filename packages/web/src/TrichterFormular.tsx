import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import {
  TRICHTER_AUSLAESSE_MAX,
  mlZuLiter,
  trichterEingabeSchema,
  type TrichterDto,
} from '@c4/shared';
import { useApi } from './api';
import { trichterInvalidieren } from './trichterDaten';
import { fehlerText, pruefen } from './warenApi';
import { alsZahl } from './zahlSchritt';
import { ZahlFeld } from './ZahlFeld';

/** Creates a funnel or edits `trichter`; editing can also archive or reactivate it. */
export function TrichterFormular({
  trichter,
  onClose,
}: Readonly<{ trichter?: TrichterDto; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(trichter?.name ?? '');
  const [volumen, setVolumen] = useState<number | string>(
    trichter ? mlZuLiter(trichter.volumenMl) : 3,
  );
  const [auslaesse, setAuslaesse] = useState<number | string>(trichter?.auslaesse ?? 4);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const speichern = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = trichterEingabeSchema.safeParse({
      name,
      volumenL: alsZahl(volumen) ?? Number.NaN,
      auslaesse: alsZahl(auslaesse) ?? Number.NaN,
    });
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    await ausfuehren(async () => {
      if (trichter) {
        await pruefen(
          await api.trichter[':id'].$put({ param: { id: trichter.id }, json: parsed.data }),
        );
      } else {
        await pruefen(await api.trichter.$post({ json: parsed.data }));
      }
    });
  };

  const archivieren = (archiviert: boolean) =>
    ausfuehren(async () => {
      if (!trichter) return;
      await pruefen(
        await api.trichter[':id'].$put({ param: { id: trichter.id }, json: { archiviert } }),
      );
    });

  async function ausfuehren(aktion: () => Promise<void>) {
    setFehler(null);
    setLaeuft(true);
    try {
      await aktion();
      await trichterInvalidieren(qc);
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={trichter ? 'Trichter bearbeiten' : 'Trichter anlegen'}>
      <form onSubmit={(e) => void speichern(e)}>
        <Stack>
          <TextInput
            size="md"
            label="Name"
            placeholder="z. B. Großer Trichter"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <ZahlFeld
            label="Volumen (l)"
            required
            value={volumen}
            onChange={setVolumen}
            min={0.5}
            step={0.5}
            decimalScale={2}
            allowDecimal
            decimalSeparator=","
            allowNegative={false}
            inputMode="decimal"
          />
          <ZahlFeld
            label="Auslässe"
            required
            value={auslaesse}
            onChange={setAuslaesse}
            min={1}
            max={TRICHTER_AUSLAESSE_MAX}
            step={1}
            allowDecimal={false}
            allowNegative={false}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={laeuft}>
              {trichter ? 'Speichern' : 'Anlegen'}
            </Button>
          </Group>
          {trichter && (
            <Button
              variant="subtle"
              color={trichter.archiviert ? 'blue' : 'red'}
              disabled={laeuft}
              onClick={() => void archivieren(!trichter.archiviert)}
            >
              {trichter.archiviert ? 'Reaktivieren' : 'Archivieren'}
            </Button>
          )}
        </Stack>
      </form>
    </Modal>
  );
}
