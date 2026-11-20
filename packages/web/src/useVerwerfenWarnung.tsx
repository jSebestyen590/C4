import { Button, Modal, Stack, Text } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns before unsaved input is lost: on reload/close and on in-app navigation. Call
 * `abgeschlossen()` after a successful save so the next navigation is not blocked, and render
 * `dialog` somewhere in the page.
 */
export function useVerwerfenWarnung(ungespeichert: boolean) {
  const fertig = useRef(false);
  const blocker = useBlocker(() => ungespeichert && !fertig.current);
  useEffect(() => {
    if (!ungespeichert) return;
    fertig.current = false;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [ungespeichert]);
  const dialog = (
    <Modal
      opened={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      title="Eingabe verwerfen?"
      centered
    >
      <Stack>
        <Text>
          Du hast noch nicht gespeichert. Wenn du die Seite verlässt, gehen deine Eingaben verloren.
        </Text>
        <Button fullWidth color="red" onClick={() => blocker.proceed?.()}>
          Verwerfen
        </Button>
        <Button fullWidth variant="default" onClick={() => blocker.reset?.()}>
          Weiter bearbeiten
        </Button>
      </Stack>
    </Modal>
  );
  return {
    dialog,
    abgeschlossen: () => (fertig.current = true),
    /** Runs a navigation of the page itself (e.g. a `replace` after saving) without the warning. */
    ohneWarnung: (aktion: () => void) => {
      const vorher = fertig.current;
      fertig.current = true;
      try {
        aktion();
      } finally {
        fertig.current = vorher;
      }
    },
  };
}

/**
 * Whether the list of a Mantine select/combobox input is open. Mantine's searchable `Select` sets
 * `data-expanded` (and `aria-controls`) while open, but not `aria-expanded` unless asked to.
 */
export const dropdownOffen = (el: Element): boolean =>
  el.getAttribute('aria-expanded') === 'true' ||
  el.hasAttribute('data-expanded') ||
  el.hasAttribute('aria-controls');

/** Enter in a `data-nav` field moves to the next one; after the last one `amEnde` runs. */
export function enterWeiter(
  e: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    target: EventTarget;
    preventDefault(): void;
    nativeEvent: { isComposing: boolean };
  },
  wurzel: HTMLElement | null,
  amEnde: () => void,
) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    amEnde();
    return;
  }
  const el = e.target as HTMLElement;
  if (!el.matches('[data-nav]')) return;
  // An open dropdown uses Enter to pick the highlighted entry.
  if (dropdownOffen(el)) return;
  const felder = [...(wurzel?.querySelectorAll<HTMLElement>('[data-nav]') ?? [])];
  const naechstes = felder[felder.indexOf(el) + 1];
  e.preventDefault();
  if (naechstes) naechstes.focus();
  else amEnde();
}
