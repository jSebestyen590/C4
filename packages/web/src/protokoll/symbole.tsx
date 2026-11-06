import {
  IconBan,
  IconCalendarEvent,
  IconChartBar,
  IconGavel,
  IconHistory,
  IconLogin2,
  IconLogout2,
  IconNotes,
  IconCrown,
  IconQuote,
  IconTemplate,
  IconUsersGroup,
  IconUserCheck,
  IconUserPlus,
} from '@tabler/icons-react';
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
    case 'ohne':
      return <IconBan size={size} />;
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
};

export const BAUSTEIN_TITEL: Record<BausteinTyp, string> = {
  bausteinEvent: 'Event',
  bausteinThema: 'Thema',
  bausteinVergangenesEvent: 'Vergangenes Event',
  bausteinAnwaerter: 'Neue:r Anwärter:in',
  bausteinBeschluss: 'Abstimmung',
  bausteinEm: 'Neues EM',
  bausteinAnwesenheit: 'Anwesenheit',
  bausteinMeinungsbild: 'Meinungsbild',
  bausteinAufnahme: 'Aufnahme',
  bausteinWahl: 'Wahl',
};
