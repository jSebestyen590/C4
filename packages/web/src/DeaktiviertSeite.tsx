import { Button, Center, Stack, Text, Title } from '@mantine/core';

/** Replaces the whole app when the API reports the signed-in account as deactivated. */
export function DeaktiviertSeite({ onAbmelden }: Readonly<{ onAbmelden: () => void }>) {
  return (
    <Center mih="100dvh" p="md">
      <Stack maw={420} align="center" ta="center">
        <Title order={2}>Account deaktiviert</Title>
        <Text>Dein Account ist deaktiviert. Wende dich an den Vorstand.</Text>
        <Button size="md" mih={44} fullWidth onClick={onAbmelden}>
          Abmelden
        </Button>
      </Stack>
    </Center>
  );
}
