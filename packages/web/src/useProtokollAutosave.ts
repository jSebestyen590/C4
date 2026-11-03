import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProtokollDokument, ProtokollKopf } from '@c4/shared';
import { useProtokollSpeichern } from './protokollDaten';

export const AUTOSAVE_VERZOEGERUNG_MS = 2000;

export type SpeicherZustand =
  /** Nothing changed since the last save (or since loading). */
  | { art: 'sauber'; um: Date | null }
  /** Changed, waiting for the debounce. */
  | { art: 'geaendert' }
  | { art: 'laeuft' }
  | { art: 'fehler' }
  /** Somebody else saved a newer version; saving is stopped until the page reloads. */
  | { art: 'konflikt' };

/**
 * Debounced autosave of a protocol. Saves never overlap: every save is chained after the previous one and
 * always sends the latest content. The version returned by a save is used for the next one. After a
 * conflict nothing is sent anymore (the page offers "Neu laden", which remounts everything).
 */
export function useProtokollAutosave({
  id,
  version,
  inhalt,
  kopf,
  aktiv,
}: Readonly<{
  id: string;
  version: number;
  inhalt: ProtokollDokument;
  kopf: ProtokollKopf;
  /** Only writers of a draft save. */
  aktiv: boolean;
}>) {
  const speichern = useProtokollSpeichern();
  const speichernRef = useRef(speichern);
  useEffect(() => {
    speichernRef.current = speichern;
  });

  const [zustand, setZustand] = useState<SpeicherZustand>({ art: 'sauber', um: null });
  const stand = useRef({ inhalt, kopf, version, schmutzig: false, konflikt: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kette = useRef<Promise<void>>(Promise.resolve());

  const einmal = useCallback(async () => {
    const s = stand.current;
    if (!s.schmutzig || s.konflikt) return;
    s.schmutzig = false;
    setZustand({ art: 'laeuft' });
    try {
      const r = await speichernRef.current(id, {
        inhalt: s.inhalt,
        kopf: s.kopf,
        version: s.version,
      });
      if (r.art === 'konflikt') {
        s.konflikt = true;
        setZustand({ art: 'konflikt' });
        return;
      }
      s.version = r.version;
      // Changes made while the request was running are still waiting for the next save.
      setZustand(s.schmutzig ? { art: 'geaendert' } : { art: 'sauber', um: new Date() });
    } catch {
      s.schmutzig = true;
      setZustand({ art: 'fehler' });
    }
  }, [id]);

  const einreihen = useCallback((): Promise<void> => {
    kette.current = kette.current.then(einmal);
    return kette.current;
  }, [einmal]);

  const planen = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void einreihen();
    }, AUTOSAVE_VERZOEGERUNG_MS);
  }, [einreihen]);

  /** Reports a change of the document and/or the Kopf. */
  const aendern = useCallback(
    (neu: { inhalt?: ProtokollDokument; kopf?: ProtokollKopf }) => {
      const s = stand.current;
      if (!aktiv || s.konflikt) return;
      if (neu.inhalt) s.inhalt = neu.inhalt;
      if (neu.kopf) s.kopf = neu.kopf;
      s.schmutzig = true;
      setZustand((z) => (z.art === 'laeuft' ? z : { art: 'geaendert' }));
      planen();
    },
    [aktiv, planen],
  );

  /** Saves now (cancels the debounce); resolves to true when nothing unsaved is left. */
  const jetzt = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await einreihen();
    return !stand.current.schmutzig && !stand.current.konflikt;
  }, [einreihen]);

  /** The server version after something other than the autosave changed it (status change). */
  const versionSetzen = useCallback((v: number) => {
    stand.current.version = v;
  }, []);

  const ungespeichert = zustand.art !== 'sauber';

  // Warn before the tab closes while something is not saved yet.
  useEffect(() => {
    if (!ungespeichert) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [ungespeichert]);

  // Leaving the page (route change) must not lose the last two seconds: flush on unmount.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void einreihen();
      }
    },
    [einreihen],
  );

  return { zustand, aendern, jetzt, versionSetzen, ungespeichert };
}
