import { Alert, Anchor, Box, Button, Group, Paper, Progress, Stack, Text } from '@mantine/core';
import {
  IconCamera,
  IconFileUpload,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BELEG_DATEI_MAX_BYTES,
  belegDateiSchluessel,
  type BelegDatei as BelegDateiDaten,
  type BelegDateiTyp,
  type BelegUploadDto,
} from '@c4/shared';
import { useApi } from './api';
import { dateiTypVon, hexVon } from './belegFormular';
import { belegPfad, jsonOderFehler } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { InfoHinweis } from './InfoHinweis';
import { fehlerText } from './warenApi';

/** PUT of the file to the presigned URL; both headers are signed, the body is the original file. */
function hochladenAnS3(
  upload: BelegUploadDto,
  datei: File,
  typ: BelegDateiTyp,
  fortschritt: (anteil: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', upload.uploadUrl);
    xhr.setRequestHeader('Content-Type', typ);
    xhr.setRequestHeader('x-amz-checksum-sha256', upload.checksumSha256);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) fortschritt(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error('Der Upload ist fehlgeschlagen. Bitte versuch es noch einmal.'));
    xhr.onerror = () =>
      reject(new Error('Der Upload ist fehlgeschlagen. Bitte prüfe deine Verbindung.'));
    xhr.send(datei);
  });
}

/** The zoomable preview of a Beleg file: PDF in a frame, images with zoom buttons. */
export function BelegVorschau({
  url,
  typ,
  name,
}: Readonly<{ url: string; typ: BelegDateiTyp; name: string }>) {
  const [zoom, setZoom] = useState(1);
  const [bildFehler, setBildFehler] = useState(false);
  const istPdf = typ === 'application/pdf';
  const oeffnen = (
    <Anchor href={url} target="_blank" rel="noreferrer" size="sm">
      Datei in neuem Tab öffnen
    </Anchor>
  );
  return (
    <Stack gap="xs">
      {istPdf ? (
        <Box
          component="iframe"
          src={url}
          title={`Vorschau ${name}`}
          h={{ base: 420, lg: 'calc(100dvh - 200px)' }}
          w="100%"
          style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}
        />
      ) : bildFehler ? (
        <Alert color="gray">
          Dieses Format kann der Browser nicht anzeigen (z. B. HEIC). Die Datei ist trotzdem
          gespeichert.
        </Alert>
      ) : (
        <>
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<IconZoomOut size={18} />}
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              disabled={zoom <= 1}
            >
              Kleiner
            </Button>
            <Button
              variant="default"
              leftSection={<IconZoomIn size={18} />}
              onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
              disabled={zoom >= 4}
            >
              Größer
            </Button>
            <Button
              variant="subtle"
              leftSection={<IconZoomReset size={18} />}
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
            >
              Zurücksetzen
            </Button>
          </Group>
          <Box
            h={{ base: 420, lg: 'calc(100dvh - 240px)' }}
            style={{
              overflow: 'auto',
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 4,
            }}
          >
            <img
              src={url}
              alt={`Beleg ${name}`}
              onError={() => setBildFehler(true)}
              style={{ width: `${zoom * 100}%`, maxWidth: 'none', display: 'block' }}
            />
          </Box>
        </>
      )}
      {oeffnen}
    </Stack>
  );
}

/**
 * Upload of the Beleg file: pick, drop or (phone) photograph a file; it is hashed in the browser
 * (SHA-256), uploaded straight into the archive and shown as a preview. Mobile first: the buttons
 * are large, "Foto aufnehmen" opens the camera on phones.
 */
export function BelegDateiFeld({
  datei,
  vorschauUrl,
  onDatei,
  onEntfernen,
  disabled = false,
  fehler,
  doppeltText,
  einreichung = false,
  vorschauSichtbar = true,
  onVorschau,
}: Readonly<{
  datei: BelegDateiDaten | null;
  /** Presigned or local URL of the file for the preview. */
  vorschauUrl: string | null;
  onDatei: (datei: BelegDateiDaten, lokaleUrl: string) => void;
  onEntfernen: () => void;
  disabled?: boolean;
  fehler?: string;
  /** Warning text of a loaded draft whose file is already part of a booked Beleg. */
  doppeltText?: string;
  /** Member submission: uploads through the `einreichungen` route (needs only `belege:einreichen`). */
  einreichung?: boolean;
  /** Whether the preview of the file is shown (default); with `onVorschau` a button switches it. */
  vorschauSichtbar?: boolean;
  onVorschau?: (sichtbar: boolean) => void;
}>) {
  const api = useApi();
  const waehlen = useRef<HTMLInputElement>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState<'hash' | 'upload' | null>(null);
  const [anteil, setAnteil] = useState(0);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [doppelt, setDoppelt] = useState<{ id: string; nummer: string } | null>(null);
  const [ziehen, setZiehen] = useState(false);

  const verarbeiten = async (gewaehlt: File | undefined) => {
    if (!gewaehlt) return;
    setMeldung(null);
    setDoppelt(null);
    const typ = dateiTypVon(gewaehlt);
    if (!typ) return setMeldung('Erlaubt sind PDF, JPEG, PNG und HEIC.');
    if (gewaehlt.size > BELEG_DATEI_MAX_BYTES) return setMeldung('Die Datei ist größer als 20 MB.');
    if (gewaehlt.size === 0) return setMeldung('Die Datei ist leer.');
    try {
      setLaeuft('hash');
      setAnteil(0);
      const sha256 = hexVon(await crypto.subtle.digest('SHA-256', await gewaehlt.arrayBuffer()));
      const upload = await jsonOderFehler<BelegUploadDto>(
        await (
          einreichung ? api.finanzen.einreichungen.upload : api.finanzen['beleg-dateien'].upload
        ).$post({
          json: { sha256, groesse: gewaehlt.size, typ, name: gewaehlt.name },
        }),
      );
      setLaeuft('upload');
      await hochladenAnS3(upload, gewaehlt, typ, setAnteil);
      setDoppelt(upload.schonGebucht);
      onDatei(
        { sha256, schluessel: belegDateiSchluessel(sha256, typ), typ, name: gewaehlt.name },
        URL.createObjectURL(gewaehlt),
      );
    } catch (e) {
      setMeldung(fehlerText(e, e instanceof Error ? e.message : 'Der Upload ist fehlgeschlagen.'));
    } finally {
      setLaeuft(null);
      if (waehlen.current) waehlen.current.value = '';
      if (kamera.current) kamera.current.value = '';
    }
  };

  const gesperrt = disabled || laeuft !== null;
  return (
    <Stack gap="sm">
      <Group gap={2}>
        <Text fw={500} size="sm">
          Beleg-Datei
        </Text>
        <InfoHinweis feld="Beleg-Datei" text={HILFE.belege.datei} />
      </Group>
      <input
        ref={waehlen}
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        hidden
        aria-label="Datei wählen"
        onChange={(e) => void verarbeiten(e.currentTarget.files?.[0])}
      />
      <input
        ref={kamera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Foto aufnehmen"
        onChange={(e) => void verarbeiten(e.currentTarget.files?.[0])}
      />
      {!datei && laeuft === null && (
        <Paper
          withBorder
          p="lg"
          onDragOver={(e) => {
            e.preventDefault();
            if (!gesperrt) setZiehen(true);
          }}
          onDragLeave={() => setZiehen(false)}
          onDrop={(e) => {
            e.preventDefault();
            setZiehen(false);
            if (!gesperrt) void verarbeiten(e.dataTransfer.files[0]);
          }}
          style={{
            borderStyle: 'dashed',
            borderColor: fehler ? 'var(--mantine-color-red-6)' : undefined,
            background: ziehen ? 'var(--mantine-color-blue-light)' : undefined,
          }}
        >
          <Stack align="center" gap="sm">
            <Text ta="center" c="dimmed" size="sm">
              Datei hierher ziehen oder wählen (PDF, JPEG, PNG, HEIC; höchstens 20 MB).
            </Text>
            <Group justify="center">
              <Button
                size="md"
                leftSection={<IconFileUpload size={20} />}
                onClick={() => waehlen.current?.click()}
                disabled={gesperrt}
              >
                Datei wählen
              </Button>
              <Button
                size="md"
                variant="light"
                leftSection={<IconCamera size={20} />}
                onClick={() => kamera.current?.click()}
                disabled={gesperrt}
                hiddenFrom="lg"
              >
                Foto aufnehmen
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
      {laeuft !== null && (
        <Stack gap={4} role="status">
          <Text size="sm">
            {laeuft === 'hash' ? 'Datei wird geprüft …' : 'Datei wird hochgeladen …'}
          </Text>
          <Progress value={laeuft === 'hash' ? 0 : anteil * 100} animated />
        </Stack>
      )}
      {fehler && !datei && (
        <Text size="sm" c="red">
          {fehler}
        </Text>
      )}
      {meldung && <Alert color="red">{meldung}</Alert>}
      {doppelt && (
        <Alert color="orange" title="Diese Datei gibt es schon">
          Sie ist bereits als Beleg{' '}
          <Anchor component={Link} to={belegPfad(doppelt.id)} target="_blank">
            {doppelt.nummer}
          </Anchor>{' '}
          gebucht. Beim Buchen musst du das bestätigen.
        </Alert>
      )}
      {!doppelt && datei && doppeltText && (
        <Alert color="orange" title="Diese Datei gibt es schon">
          {doppeltText}
        </Alert>
      )}
      {datei && (
        <Stack gap="xs">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm" style={{ overflowWrap: 'anywhere' }} fw={500}>
              {datei.name}
            </Text>
            {!disabled && (
              <Group gap="xs">
                {onVorschau && (
                  <Button variant="default" onClick={() => onVorschau(!vorschauSichtbar)}>
                    {vorschauSichtbar ? 'Vorschau ausblenden' : 'Vorschau einblenden'}
                  </Button>
                )}
                <Button
                  variant="default"
                  onClick={() => waehlen.current?.click()}
                  disabled={gesperrt}
                >
                  Andere Datei
                </Button>
                <Button variant="subtle" color="red" onClick={onEntfernen} disabled={gesperrt}>
                  Entfernen
                </Button>
              </Group>
            )}
          </Group>
          {!vorschauSichtbar ? null : vorschauUrl ? (
            <BelegVorschau url={vorschauUrl} typ={datei.typ} name={datei.name} />
          ) : (
            <Text size="sm" c="dimmed">
              Keine Vorschau verfügbar.
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
