import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProtokollMitgliedDto } from '@c4/shared';
import { useProtokollSperreApi } from './protokollDaten';

/** The editing page extends the lock this often; the server expires it 2 minutes after the last one. */
export const SPERRE_HERZSCHLAG_MS = 30_000;

export type SperreZustand =
  /** Not a writer, or not a draft: no lock involved. */
  | { art: 'inaktiv' }
  /** The first request is running. */
  | { art: 'pruefe' }
  /** This tab holds the lock; `frei` is set once after a read-only phase ended (the page shows a notice). */
  | { art: 'eigen'; frei: boolean }
  /** Somebody else (or this person in another tab) holds it; `von` is null when unknown. */
  | { art: 'gesperrt'; von: ProtokollMitgliedDto | null; eigene: boolean };

/**
 * The edit lock of an open draft (see docs/protokolle.md, Bearbeitungssperre). While `aktiv` it takes the
 * lock, extends it every 30 s and releases it when the page closes. Without the lock it re-checks every
 * 30 s; as soon as the lock is free it takes it, calls `beiFrei` (reload the latest version) and switches
 * to `eigen`.
 */
export function useProtokollSperre({
  id,
  aktiv,
  beiFrei,
}: Readonly<{
  id: string;
  aktiv: boolean;
  /** Called after the lock was taken following a read-only phase; resolves once the latest version is loaded. */
  beiFrei: () => Promise<unknown>;
}>) {
  const sperreApi = useProtokollSperreApi();
  const apiRef = useRef(sperreApi);
  const beiFreiRef = useRef(beiFrei);
  useEffect(() => {
    apiRef.current = sperreApi;
    beiFreiRef.current = beiFrei;
  });

  const [zustand, setZustand] = useState<SperreZustand>(
    aktiv ? { art: 'pruefe' } : { art: 'inaktiv' },
  );
  const zustandRef = useRef(zustand);
  const pruefenRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!aktiv) {
      zustandRef.current = { art: 'inaktiv' };
      setZustand(zustandRef.current);
      return;
    }
    let beendet = false;
    const setzen = (z: SperreZustand) => {
      zustandRef.current = z;
      setZustand(z);
    };
    const pruefen = async () => {
      try {
        const r = await apiRef.current.nehmen(id);
        if (beendet) return;
        if (r.art === 'gesperrt') {
          setzen({ art: 'gesperrt', von: r.von, eigene: r.eigene });
          return;
        }
        const warGesperrt = zustandRef.current.art === 'gesperrt';
        if (warGesperrt) {
          await beiFreiRef.current();
          if (beendet) return;
          setzen({ art: 'eigen', frei: true });
        } else if (zustandRef.current.art !== 'eigen') {
          setzen({ art: 'eigen', frei: false });
        }
      } catch {
        // Network trouble: keep the current state, the next round tries again.
      }
    };
    pruefenRef.current = pruefen;
    if (zustandRef.current.art === 'inaktiv') setzen({ art: 'pruefe' });
    void pruefen();
    const timer = setInterval(() => void pruefen(), SPERRE_HERZSCHLAG_MS);
    const loesen = () => void apiRef.current.loesen(id).catch(() => {});
    window.addEventListener('pagehide', loesen);
    return () => {
      beendet = true;
      clearInterval(timer);
      window.removeEventListener('pagehide', loesen);
      loesen();
    };
  }, [id, aktiv]);

  /** A save or status change was refused: the lock is gone. Shows the read-only view and checks again now. */
  const verloren = useCallback((von: ProtokollMitgliedDto | null, eigene: boolean) => {
    const z: SperreZustand = { art: 'gesperrt', von, eigene };
    zustandRef.current = z;
    setZustand(z);
    void pruefenRef.current();
  }, []);

  /** Dismisses the "Das Protokoll ist jetzt frei" notice. */
  const hinweisSchliessen = useCallback(() => {
    setZustand((z) => {
      const neu: SperreZustand = z.art === 'eigen' ? { art: 'eigen', frei: false } : z;
      zustandRef.current = neu;
      return neu;
    });
  }, []);

  return { zustand, verloren, hinweisSchliessen };
}
