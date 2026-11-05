import { createContext, useContext } from 'react';
import type { AnwesenheitsVerlauf, ProtokollArt, ProtokollMitgliedDto } from '@c4/shared';
import { quorumBeiEroeffnung, type AnwesenheitPerson } from './anwesenheit';

/** What the Baustein node views need to know about the document they live in. */
export interface ProtokollKontextWert {
  /** ISO instant of the Sitzung: separates past from upcoming events. */
  sitzungBeginn: string;
  /** Art of the Sitzung (quorum rule). */
  art: ProtokollArt;
  /** Everybody in the attendance list with the attendance that currently counts. */
  teilnahme: readonly AnwesenheitPerson[];
  /** The active EMs (candidates for a Neues EM block next to the attendance list). */
  ems: readonly ProtokollMitgliedDto[];
  /** Quorum at the opening and at each Anwesenheit / Abstimmung / Neues EM / Aufnahme block of the current document. */
  verlauf: AnwesenheitsVerlauf;
}

export const ProtokollKontext = createContext<ProtokollKontextWert>({
  sitzungBeginn: new Date().toISOString(),
  art: 'sitzung',
  teilnahme: [],
  ems: [],
  verlauf: { start: quorumBeiEroeffnung('sitzung', []), bausteine: {}, anwesendePersonen: {} },
});

export const useProtokollKontext = (): ProtokollKontextWert => useContext(ProtokollKontext);
