import {
  IconBan,
  IconPencilExclamation,
  IconChecklist,
  IconCalendarEvent,
  IconChartBar,
  IconGavel,
  IconHistory,
  IconLogin2,
  IconLogout2,
  IconNotes,
  IconPhoto,
  IconCrown,
  IconListCheck,
  IconQuote,
  IconTemplate,
  IconUsersGroup,
  IconUserCheck,
  IconUserPlus,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import type { MantineColor } from '@mantine/core';
import type { BausteinTyp } from '@c4/shared';
import type { SlashSymbol } from './slashLogik';

export function SlashIcon({ symbol, size = 20 }: Readonly<{ symbol: SlashSymbol; size?: number }>) {
  switch (symbol) {
    case 'event':
      return <IconCalendarEvent size={size} />;
    case 'thema':
      return <IconNotes size={size} />;
    case 'vergangenes':
      return <IconHistory size={size} />;
    case 'anwaerter':
      return <IconUserPlus size={size} />;
    case 'beschluss':
      return <IconGavel size={size} />;
    case 'aufnahme':
      return <IconUserCheck size={size} />;
    case 'meinungsbild':
      return <IconChartBar size={size} />;
    case 'wahl':
      return <IconUsersGroup size={size} />;
    case 'auswahl':
      return <IconListCheck size={size} />;
    case 'em':
      return <IconCrown size={size} />;
    case 'erscheint':
      return <IconLogin2 size={size} />;
    case 'geht':
      return <IconLogout2 size={size} />;
    case 'vorlage':
      return <IconTemplate size={size} />;
    case 'zitat':
      return <IconQuote size={size} />;
    case 'bild':
      return <IconPhoto size={size} />;
    case 'ohne':
      return <IconBan size={size} />;
    case 'person':
      return <IconUser size={size} />;
    case 'gruppe':
      return <IconUsers size={size} />;
    case 'todo':
      return <IconChecklist size={size} />;
    case 'merker':
      return <IconPencilExclamation size={size} />;
  }
}

export const BAUSTEIN_SYMBOL: Record<BausteinTyp, SlashSymbol> = {
  bausteinEvent: 'event',
  bausteinThema: 'thema',
  bausteinVergangenesEvent: 'vergangenes',
  bausteinAnwaerter: 'anwaerter',
  bausteinBeschluss: 'beschluss',
  bausteinEm: 'em',
  bausteinAnwesenheit: 'erscheint',
  bausteinMeinungsbild: 'meinungsbild',
  bausteinAufnahme: 'aufnahme',
  bausteinWahl: 'wahl',
  bausteinAuswahl: 'auswahl',
  bausteinTodo: 'todo',
  bausteinMerker: 'merker',
};

/**
 * Colour of a Baustein: the bar on the left edge of its card and its icon in the outline (the only
 * place of the map). Mantine's -6 shades read well on light and dark.
 */
export const BAUSTEIN_FARBE: Record<BausteinTyp, MantineColor> = {
  bausteinEvent: 'green',
  bausteinVergangenesEvent: 'lime',
  bausteinThema: 'violet',
  bausteinAnwaerter: 'cyan',
  bausteinBeschluss: 'red',
  bausteinEm: 'orange',
  bausteinAnwesenheit: 'teal',
  bausteinMeinungsbild: 'pink',
  bausteinAufnahme: 'indigo',
  bausteinWahl: 'grape',
  bausteinAuswahl: 'yellow',
  bausteinTodo: 'gray',
  bausteinMerker: 'yellow',
};

/** CSS value of the Baustein colour. */
export const bausteinFarbeCss = (typ: BausteinTyp): string =>
  `var(--mantine-color-${BAUSTEIN_FARBE[typ]}-6)`;

/** Symbol of a Baustein from its fields: Anwesenheit shows "erscheint" or "geht". */
export function bausteinSymbol(typ: BausteinTyp, daten: unknown): SlashSymbol {
  if (typ === 'bausteinAnwesenheit') {
    const art = (daten as { art?: unknown } | null)?.art;
    return art === 'geht' ? 'geht' : 'erscheint';
  }
  return BAUSTEIN_SYMBOL[typ];
}

export const BAUSTEIN_TITEL: Record<BausteinTyp, string> = {
  bausteinEvent: 'Event',
  bausteinThema: 'Thema',
  bausteinVergangenesEvent: 'Vergangenes Event',
  bausteinAnwaerter: 'Neue:r Anwärter:in',
  bausteinBeschluss: 'Abstimmung',
  bausteinEm: 'Austritt',
  bausteinAnwesenheit: 'Anwesenheit',
  bausteinMeinungsbild: 'Meinungsbild',
  bausteinAufnahme: 'Aufnahme',
  bausteinWahl: 'Wahl',
  bausteinAuswahl: 'Abstimmung (Auswahl)',
  bausteinTodo: 'Todo',
  bausteinMerker: 'Überarbeiten',
};
