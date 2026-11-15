import { ActionIcon, Group, Popover, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useRef, useState, type KeyboardEvent } from 'react';

/**
 * Small info icon that opens an explanation on click, tap, Enter or Space (not hover-only, so it
 * works on touch and keyboard). It is focusable but has no `data-nav`, so Enter in a field jumps
 * to the next input and skips it. Escape closes only the open explanation (also inside a Modal,
 * which then stays open) and returns the focus to the icon. Texts live in `finanzenHilfe.ts`.
 */
export function InfoHinweis({ feld, text }: Readonly<{ feld: string; text: string }>) {
  const [offen, setOffen] = useState(false);
  const icon = useRef<HTMLButtonElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !offen) return;
    e.stopPropagation();
    e.preventDefault();
    setOffen(false);
    icon.current?.focus();
  };
  return (
    <Popover
      opened={offen}
      onChange={setOffen}
      width={300}
      position="bottom"
      withArrow
      shadow="md"
      trapFocus={false}
      closeOnEscape={false}
    >
      <Popover.Target>
        <ActionIcon
          ref={icon}
          type="button"
          variant="subtle"
          color="gray"
          size={28}
          radius="xl"
          aria-label={`Erklärung zu ${feld}`}
          data-mantine-stop-propagation={offen ? 'true' : undefined}
          onClick={() => setOffen((o) => !o)}
          onKeyDown={onKeyDown}
        >
          <IconInfoCircle size={18} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown data-mantine-stop-propagation="true" onKeyDown={onKeyDown}>
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
