import { ActionIcon, CopyButton, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

/** A hash in monospace that wraps instead of scrolling, with a copy button. */
export function HashAnzeige({ label, wert }: Readonly<{ label: string; wert: string }>) {
  return (
    <Stack gap={2}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Text ff="monospace" size="sm" style={{ wordBreak: 'break-all', flex: 1, minWidth: 0 }}>
          {wert}
        </Text>
        <CopyButton value={wert} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Kopiert' : 'Kopieren'} withArrow>
              <ActionIcon
                variant="subtle"
                color={copied ? 'teal' : 'gray'}
                size={42}
                onClick={copy}
                aria-label={`${label} kopieren`}
              >
                {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Stack>
  );
}
