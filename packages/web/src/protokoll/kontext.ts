import { createContext, useContext } from 'react';

/** What the Baustein node views need to know about the document they live in. */
export interface ProtokollKontextWert {
  /** ISO instant of the Sitzung: separates past from upcoming events. */
  sitzungBeginn: string;
}

export const ProtokollKontext = createContext<ProtokollKontextWert>({
  sitzungBeginn: new Date().toISOString(),
});

export const useProtokollKontext = (): ProtokollKontextWert => useContext(ProtokollKontext);
