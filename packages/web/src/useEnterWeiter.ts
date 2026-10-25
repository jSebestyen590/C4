import type { KeyboardEvent } from 'react';

/**
 * Enter in a table input jumps to the next `[data-zeile]` input (across sections); after the last
 * one the element with `letztesId` (the main button) gets the focus.
 */
export function useEnterWeiter(letztesId: string) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const ziel = e.target as HTMLElement;
    if (!ziel.matches('input[data-zeile]')) return;
    e.preventDefault();
    const alle = [...e.currentTarget.querySelectorAll<HTMLElement>('input[data-zeile]')];
    const naechstes = alle[alle.indexOf(ziel) + 1];
    if (naechstes) naechstes.focus();
    else document.getElementById(letztesId)?.focus();
  };
}
