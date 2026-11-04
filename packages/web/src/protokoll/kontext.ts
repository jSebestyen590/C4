import { createContext, useContext } from 'react';
import type { AnwesenheitsVerlauf, ProtokollArt } from '@c4/shared';
import { quorumBeiEroeffnung, type AnwesenheitPerson } from './anwesenheit';

/** What the Baustein node views need to know about the document they live in. */
export interface ProtokollKontextWert {
  /** ISO instant of the Sitzung: separates past from upcoming events. */
  sitzungBeginn: string;
  /** Art of the Sitzung (quorum rule). */
  art: ProtokollArt;
  /** Everybody in the attendance list with the attendance that currently counts. */
  teilnahme: readonly AnwesenheitPerson[];
  /** Quorum at the opening and at each Anwesenheit / Beschluss block of the current document. */
  verlauf: AnwesenheitsVerlauf;
}

export const ProtokollKontext = createContext<ProtokollKontextWert>({
  sitzungBeginn: new Date().toISOString(),
  art: 'sitzung',
  teilnahme: [],
  verlauf: { start: quorumBeiEroeffnung('sitzung', []), bausteine: {} },
});

export const useProtokollKontext = (): ProtokollKontextWert => useContext(ProtokollKontext);
