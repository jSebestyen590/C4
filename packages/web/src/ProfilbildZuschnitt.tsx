import { Button, Group, Modal, Slider, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { Ausschnitt } from './profilbild';

/** Dialog to pick the square part of a chosen picture that becomes the profile picture. */
export function ProfilbildZuschnitt({
  datei,
  onAbbrechen,
  onUebernehmen,
}: Readonly<{
  datei: File | null;
  onAbbrechen: () => void;
  onUebernehmen: (datei: File, ausschnitt: Ausschnitt) => void;
}>) {
  return (
    <Modal
      opened={datei !== null}
      onClose={onAbbrechen}
      title="Ausschnitt wählen"
      centered
      closeButtonProps={{ 'aria-label': 'Schließen' }}
    >
      {datei && <Zuschnitt datei={datei} onAbbrechen={onAbbrechen} onUebernehmen={onUebernehmen} />}
    </Modal>
  );
}

function Zuschnitt({
  datei,
  onAbbrechen,
  onUebernehmen,
}: Readonly<{
  datei: File;
  onAbbrechen: () => void;
  onUebernehmen: (datei: File, ausschnitt: Ausschnitt) => void;
}>) {
  const [url, setUrl] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [bereich, setBereich] = useState<Area | null>(null);

  useEffect(() => {
    const leser = new FileReader();
    leser.onload = () => setUrl(String(leser.result));
    leser.readAsDataURL(datei);
    return () => {
      leser.onload = null;
    };
  }, [datei]);

  return (
    <Stack>
      <div style={{ position: 'relative', width: '100%', height: '60dvh', maxHeight: 360 }}>
        {url && (
          <Cropper
            image={url}
            crop={position}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setPosition}
            onZoomChange={setZoom}
            onCropComplete={(_, pixel) => setBereich(pixel)}
          />
        )}
      </div>
      <div>
        <Text size="sm" c="dimmed" id="zoom-label">
          Zoom
        </Text>
        <Slider
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={setZoom}
          label={null}
          aria-labelledby="zoom-label"
          size="lg"
        />
      </div>
      <Text size="sm" c="dimmed">
        Verschiebe das Bild und zoome, bis der Ausschnitt passt.
      </Text>
      <Group grow>
        <Button variant="default" onClick={onAbbrechen}>
          Abbrechen
        </Button>
        <Button disabled={!bereich} onClick={() => bereich && onUebernehmen(datei, bereich)}>
          Übernehmen
        </Button>
      </Group>
    </Stack>
  );
}
