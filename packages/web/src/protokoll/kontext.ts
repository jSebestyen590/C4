import { createContext, useContext } from 'react';
import type {
  AnwesenheitsVerlauf,
  ProtokollArt,
  ProtokollMitgliedDto,
  StimmenPruefung,
} from '@c4/shared';
import type { ErwaehnungPerson } from './erwaehnungLogik';
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
  /** All members (names of @mentions, also of people who are not in the attendance list). */
  mitglieder: readonly ErwaehnungPerson[];
  /** Quorum at the opening and at each Anwesenheit / Abstimmung / Neues EM / Aufnahme block of the current document. */
  verlauf: AnwesenheitsVerlauf;
  /** Vote count checks of the binding votes (Abstimmung, Wahl rounds) against the members present. */
  stimmen: readonly StimmenPruefung[];
  /** URLs of the images of the protocol by key (presigned, local previews of fresh uploads included). */
  bilder: Readonly<Record<string, string>>;
  /** An image failed to load (probably an expired URL): fetch fresh ones. Throttled by the provider. */
  bilderErneuern?: () => void;
  /** A person got an Erscheint / Geht block: lets the page lock them to "da" in the Kopf. Editable documents only. */
  onAnwesenheit?: (sub: string) => void;
}

export const ProtokollKontext = createContext<ProtokollKontextWert>({
  sitzungBeginn: new Date().toISOString(),
  art: 'sitzung',
  teilnahme: [],
  ems: [],
  mitglieder: [],
  verlauf: { start: quorumBeiEroeffnung('sitzung', []), bausteine: {}, anwesendePersonen: {} },
  stimmen: [],
  bilder: {},
});

export const useProtokollKontext = (): ProtokollKontextWert => useContext(ProtokollKontext);
