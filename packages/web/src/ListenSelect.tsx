import { ActionIcon, MultiSelect, Select } from '@mantine/core';
import type { MultiSelectProps, SelectProps } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { forwardRef, useCallback, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

/** Width of the chevron section; with a clear button next to it the section needs more room. */
const ABSCHNITT_BREITE = 42;
const ABSCHNITT_BREITE_MIT_LEEREN = 72;

/**
 * Props for a searchable Mantine Select / MultiSelect whose list can be toggled: Mantine only opens
 * the list on a click into the field or on the chevron, so an open list could not be closed by
 * clicking again. The list state is controlled here; the chevron (a real button inside the field) and
 * a click into the field while the list is open close it. The clear button (X) stays next to it.
 */
export function useListeUmschalten({ clearable = false }: { clearable?: boolean } = {}) {
  const [offen, setOffen] = useState(false);
  // State at the moment of the press: Mantine's click-outside already closes the list on mousedown.
  const warOffen = useRef<boolean | null>(null);
  const schliessen = useCallback(() => setOffen(false), []);

  const props = {
    dropdownOpened: offen,
    onDropdownOpen: () => setOffen(true),
    onDropdownClose: () => setOffen(false),
    rightSection: (
      <ActionIcon
        variant="subtle"
        color="gray"
        size={42}
        aria-label={offen ? 'Liste schließen' : 'Liste öffnen'}
        // Keep the focus where it is (no blur that would close the list right away).
        onMouseDown={(e: MouseEvent) => {
          warOffen.current = offen;
          e.preventDefault();
        }}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          // The click must not reach Mantine's own "open" handler of the field.
          e.stopPropagation();
          // Keyboard activation has no mousedown: fall back to the current state.
          const war = warOffen.current ?? offen;
          warOffen.current = null;
          if (war) {
            setOffen(false);
            return;
          }
          setOffen(true);
          e.currentTarget
            .closest('[data-position="right"]')
            ?.parentElement?.querySelector<HTMLInputElement>('input:not([type="hidden"])')
            ?.focus();
        }}
      >
        <IconChevronDown size={18} />
      </ActionIcon>
    ),
    rightSectionPointerEvents: 'all' as const,
    rightSectionWidth: clearable ? ABSCHNITT_BREITE_MIT_LEEREN : ABSCHNITT_BREITE,
    wrapperProps: {
      // A click into the field while the list is open closes it (Mantine would only "open" again).
      onClickCapture: (e: MouseEvent<HTMLElement>) => {
        if (!offen) return;
        const ziel = e.target as HTMLElement;
        if (ziel.closest('button, label, [class*="-description"], [class*="-error"]')) return;
        e.stopPropagation();
        setOffen(false);
      },
    },
  };
  return { offen, schliessen, props };
}

/** Searchable Select whose list closes on a second click on the field or the chevron. */
export const ListenSelect = forwardRef<HTMLInputElement, SelectProps>(
  function ListenSelect(props, ref) {
    const liste = useListeUmschalten({ clearable: !!props.clearable && !!props.value });
    return <Select ref={ref} {...props} {...liste.props} />;
  },
);

/** Searchable MultiSelect whose list closes on a second click on the field or the chevron. */
export const ListenMultiSelect = forwardRef<
  HTMLInputElement,
  MultiSelectProps & { schliessenNachWahl?: boolean }
>(function ListenMultiSelect({ schliessenNachWahl, onChange, ...props }, ref) {
  const liste = useListeUmschalten({
    clearable: !!props.clearable && (props.value?.length ?? 0) > 0,
  });
  return (
    <MultiSelect
      ref={ref}
      {...props}
      {...liste.props}
      onChange={(werte) => {
        if (schliessenNachWahl) liste.schliessen();
        onChange?.(werte);
      }}
    />
  );
});
