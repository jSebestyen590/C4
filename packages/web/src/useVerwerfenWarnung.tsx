import { Button, Modal, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns before unsaved input is lost: on reload/close and on in-app navigation. Call
 * `abgeschlossen()` after a successful save so the next navigation is not blocked, and render
 * `dialog` somewhere in the page.
 *
 * With `speichern` (drafts with autosave) an in-app navigation does not ask first: it saves, waits
 * for the result and then goes on. Only when saving fails the dialog asks whether to leave anyway
 * (the typed input stays in the local mirror of the device). Closing the tab still warns.
 */
export function useVerwerfenWarnung(ungespeichert: boolean, speichern?: () => Promise<boolean>) {
  const fertig = useRef(false);
  const blocker = useBlocker(() => ungespeichert && !fertig.current);
  // The blocked navigation whose save failed (the object changes with every new block).
  const [fehlgeschlagenFuer, setFehlgeschlagenFuer] = useState<unknown>(null);
  const speichernRef = useRef(speichern);
  useEffect(() => {
    speichernRef.current = speichern;
  });
  useEffect(() => {
    if (!ungespeichert) return;
    fertig.current = false;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [ungespeichert]);
  const gesperrt = blocker.state === 'blocked';
  useEffect(() => {
    if (!gesperrt) return;
    const sichern = speichernRef.current;
    if (!sichern) return;
    let aktiv = true;
    const ort = blocker.location;
    sichern()
      .catch(() => false)
      .then((ok) => {
        if (!aktiv) return;
        if (ok) blocker.proceed?.();
        else setFehlgeschlagenFuer(ort);
      });
    return () => {
      aktiv = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesperrt]);
  const dialog = speichern ? (
    <Modal
      opened={gesperrt && fehlgeschlagenFuer === blocker.location}
      onClose={() => blocker.reset?.()}
      title="Speichern fehlgeschlagen"
      centered
    >
      <Stack>
        <Text>
          Speichern fehlgeschlagen – trotzdem verlassen? Deine Eingaben bleiben auf diesem Gerät
          gespeichert.
        </Text>
        <Button fullWidth color="red" onClick={() => blocker.proceed?.()}>
          Verlassen
        </Button>
        <Button fullWidth variant="default" onClick={() => blocker.reset?.()}>
          Bleiben
        </Button>
      </Stack>
    </Modal>
  ) : (
    <Modal opened={gesperrt} onClose={() => blocker.reset?.()} title="Eingabe verwerfen?" centered>
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
