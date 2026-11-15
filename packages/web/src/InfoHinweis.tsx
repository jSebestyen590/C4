import { ActionIcon, Group, Popover, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';

/**
 * Small info icon that opens an explanation on click, tap, Enter or Space (not hover-only, so it
 * works on touch and keyboard). It is focusable but has no `data-nav`, so Enter in a field jumps
 * to the next input and skips it. Texts live in `finanzenHilfe.ts`.
 */
export function InfoHinweis({ feld, text }: Readonly<{ feld: string; text: string }>) {
  return (
    <Popover width={300} position="bottom" withArrow shadow="md" trapFocus={false}>
      <Popover.Target>
        <ActionIcon
          type="button"
          variant="subtle"
          color="gray"
          size={28}
          radius="xl"
          aria-label={`Erklärung zu ${feld}`}
        >
          <IconInfoCircle size={18} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
          {text}
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}

/** A field label followed by its `InfoHinweis`; use as the `label` of a Mantine input. */
export function FeldLabel({ text, hilfe }: Readonly<{ text: string; hilfe: string }>) {
  return (
    <Group gap={2} wrap="nowrap" component="span" display="inline-flex" align="center">
      <span>{text}</span>
      <InfoHinweis feld={text} text={hilfe} />
    </Group>
  );
}
