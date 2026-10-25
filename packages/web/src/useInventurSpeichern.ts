import { useEffect, useRef, useState } from 'react';
import { useApi } from './api';
import { zaehlungenAus, type KnotenZustand, type WareInfo } from './inventurDaten';
import { fehlerAnzeigen, pruefen } from './warenApi';

export type SpeicherStatus = 'leer' | 'speichert' | 'gespeichert' | 'fehler' | 'unvollstaendig';

const VERZOEGERUNG_MS = 800;

/**
 * Autosave of the inventory draft per node: debounced while typing, immediately on blur.
 * Saves of one node run one after another and always send the latest local state.
 */
export function useInventurSpeichern(
  inventurId: string,
  lesen: () => { zustaende: Record<string, KnotenZustand>; waren: Map<string, WareInfo> },
) {
  const api = useApi();
  const [status, setStatus] = useState<SpeicherStatus>('leer');
  const [intern] = useState(() => ({
    dirty: new Set<string>(),
    timer: new Map<string, ReturnType<typeof setTimeout>>(),
    kette: new Map<string, Promise<boolean>>(),
    laufend: 0,
    unvollstaendig: new Set<string>(),
    fehler: false,
  }));
  const lesenRef = useRef(lesen);
  useEffect(() => {
    lesenRef.current = lesen;
  });

  const speichern = (lid: string): Promise<boolean> => {
    clearTimeout(intern.timer.get(lid));
    intern.timer.delete(lid);
    const vorher = intern.kette.get(lid) ?? Promise.resolve(true);
    const lauf = vorher.then(async () => {
      if (!intern.dirty.has(lid)) return true;
      const { zustaende, waren } = lesenRef.current();
      const zustand = zustaende[lid];
      if (!zustand) return true;
      intern.dirty.delete(lid);
      intern.laufend += 1;
      setStatus('speichert');
      const { zaehlungen, unvollstaendig } = zaehlungenAus(zustand, waren);
      try {
        await pruefen(
          await api.inventuren[':id'].knoten[':lid'].$put({
            param: { id: inventurId, lid },
            json: {
              zaehlungen,
              inListeAufnehmen: zustand.inListe.filter((w) => zustand.extra.includes(w)),
            },
          }),
        );
        if (unvollstaendig) intern.unvollstaendig.add(lid);
        else intern.unvollstaendig.delete(lid);
        return true;
      } catch (e) {
        intern.dirty.add(lid);
        intern.fehler = true;
        fehlerAnzeigen(e, 'Das Speichern ist fehlgeschlagen.');
        return false;
      } finally {
        intern.laufend -= 1;
        if (intern.laufend === 0) {
          setStatus(
            intern.fehler
              ? 'fehler'
              : intern.unvollstaendig.size > 0
                ? 'unvollstaendig'
                : 'gespeichert',
          );
          intern.fehler = false;
        }
      }
    });
    intern.kette.set(lid, lauf);
    return lauf;
  };

  /** Marks a node as changed and saves it shortly after the last change. */
  const geaendert = (lid: string) => {
    intern.dirty.add(lid);
    clearTimeout(intern.timer.get(lid));
    intern.timer.set(
      lid,
      setTimeout(() => void speichern(lid), VERZOEGERUNG_MS),
    );
  };

  const beiBlur = (lid: string) => {
    if (intern.dirty.has(lid)) void speichern(lid);
  };

  /** Saves everything pending; resolves to false when a save failed. */
  const alleSpeichern = async (): Promise<boolean> => {
    const ergebnisse = await Promise.all(
      [...new Set([...intern.dirty, ...intern.kette.keys()])].map((lid) => speichern(lid)),
    );
    return ergebnisse.every(Boolean);
  };

  /** Drops all pending saves (draft discarded). */
  const verwerfen = () => {
    for (const t of intern.timer.values()) clearTimeout(t);
    intern.timer.clear();
    intern.dirty.clear();
  };

  useEffect(
    () => () => {
      // Leaving the page: write out what is still pending.
      for (const lid of [...intern.dirty]) void speichern(lid);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { status, geaendert, beiBlur, alleSpeichern, verwerfen };
}
