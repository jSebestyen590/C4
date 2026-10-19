import { mhdNormalisieren, vergleicheGebinde, type Gebinde, type MhdArt } from '@c4/shared';

/** A Ware as needed for counting: master data plus aliases (for the search). */
export interface WareInfo {
  id: string;
  name: string;
  mhdArt: MhdArt;
  gebindeIds: string[];
  aliase: string[];
  archiviert: boolean;
}

export interface Soll {
  wareId: string;
  gebindeId: string;
  mhd: string | null;
  menge: number;
}

export interface Zaehlung {
  wareId: string;
  gebindeId: string;
  mhd: string | null;
  anzahl: number;
}

/** One node of an inventory as returned by `GET /inventuren/:id`. */
export interface KnotenDaten {
  lagerortId: string;
  name: string;
  pfad: string;
  wareIds: string[];
  soll: Soll[];
  zaehlungen: Zaehlung[];
}

/** One table row: a Ware with one MHD (or without), one input text per Gebinde. */
export interface Zeile {
  key: string;
  wareId: string;
  /** Input value: `YYYY-MM-DD` (Tag), `YYYY-MM` (Monat) or empty. */
  mhd: string;
  /** MHD comes from Soll / saved counts and cannot be edited. */
  fest: boolean;
  /** Digits per Gebinde id; empty or missing = take Soll. */
  anzahl: Record<string, string>;
}

/** Local (source of truth while editing) state of one node. */
export interface KnotenZustand {
  zeilen: Zeile[];
  /** Wares added ad hoc (not in the Warenliste, no Soll). */
  extra: string[];
  /** Ad hoc wares that should join the Warenliste of the node permanently. */
  inListe: string[];
}

let zaehler = 0;
export const neueZeile = (wareId: string, mhd = '', fest = false): Zeile => ({
  key: `z${++zaehler}`,
  wareId,
  mhd,
  fest,
  anzahl: {},
});

export const mhdEingabe = (mhd: string | null, art: MhdArt): string =>
  !mhd || art === 'keins' ? '' : art === 'monat' ? mhd.slice(0, 7) : mhd;

export function mhdAusEingabe(eingabe: string, art: MhdArt): string | null {
  if (!eingabe) return null;
  return mhdNormalisieren(art === 'monat' ? `${eingabe}-01` : eingabe, art);
}

/** `YYYY-MM-DDTHH:mm` of now in local time, as `datetime-local` expects it. */
export function jetztLokal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Gebinde of a Ware, Obergebinde first. */
export function gebindeVonWare(ware: WareInfo, alle: Gebinde[]): Gebinde[] {
  return alle
    .filter((g) => ware.gebindeIds.includes(g.id))
    .sort(
      (a, b) =>
        Number(!!b.unterGebindeId) - Number(!!a.unterGebindeId) || vergleicheGebinde(a, b, alle),
    );
}

/** Wares of a node: the configured list, then wares with Soll or saved counts that are not in it. */
export function knotenWaren(knoten: KnotenDaten, waren: Map<string, WareInfo>): string[] {
  const liste = knoten.wareIds.filter((id) => waren.has(id));
  const bekannt = new Set(liste);
  const weitere = [...new Set([...knoten.soll, ...knoten.zaehlungen].map((x) => x.wareId))]
    .filter((id) => !bekannt.has(id) && waren.has(id))
    .sort((a, b) => waren.get(a)!.name.localeCompare(waren.get(b)!.name, 'de'));
  return [...liste, ...weitere];
}

/** Rows of one Ware: one per known MHD (Soll and saved counts), saved counts prefilled. */
export function wareZeilen(ware: WareInfo, knoten: KnotenDaten): Zeile[] {
  const eigene = <T extends { wareId: string }>(xs: T[]) => xs.filter((x) => x.wareId === ware.id);
  const zaehlungen = eigene(knoten.zaehlungen);
  const mhds =
    ware.mhdArt === 'keins'
      ? ['']
      : [
          ...new Set(
            [...eigene(knoten.soll), ...zaehlungen].map((x) => mhdEingabe(x.mhd, ware.mhdArt)),
          ),
        ]
          .filter((m) => m !== '')
          .sort();
  if (mhds.length === 0) return [neueZeile(ware.id)];
  return mhds.map((mhd) => {
    const zeile = neueZeile(ware.id, mhd, ware.mhdArt !== 'keins');
    for (const z of zaehlungen) {
      if (mhdEingabe(z.mhd, ware.mhdArt) === mhd) zeile.anzahl[z.gebindeId] = String(z.anzahl);
    }
    return zeile;
  });
}

export function knotenZustand(knoten: KnotenDaten, waren: Map<string, WareInfo>): KnotenZustand {
  return {
    zeilen: knotenWaren(knoten, waren).flatMap((id) => wareZeilen(waren.get(id)!, knoten)),
    extra: [],
    inListe: [],
  };
}

const sollKey = (wareId: string, gebindeId: string, mhd: string | null) =>
  `${wareId}|${gebindeId}|${mhd ?? ''}`;

/** Lookup of the expected amount per (Ware, Gebinde, MHD) of a node; 0 when there is none. */
export function sollLookup(
  soll: Soll[],
): (wareId: string, gebindeId: string, mhd: string | null) => number {
  const karte = new Map<string, number>();
  for (const s of soll) {
    const key = sollKey(s.wareId, s.gebindeId, s.mhd);
    karte.set(key, (karte.get(key) ?? 0) + s.menge);
  }
  return (wareId, gebindeId, mhd) => karte.get(sollKey(wareId, gebindeId, mhd)) ?? 0;
}

/**
 * Counted lines for the API: only non-empty inputs. Rows of MHD wares without a (valid) MHD are
 * left out and reported as `unvollstaendig`.
 */
export function zaehlungenAus(
  zustand: KnotenZustand,
  waren: Map<string, WareInfo>,
): { zaehlungen: Zaehlung[]; unvollstaendig: boolean } {
  const zaehlungen = new Map<string, Zaehlung>();
  let unvollstaendig = false;
  for (const zeile of zustand.zeilen) {
    const ware = waren.get(zeile.wareId);
    if (!ware) continue;
    const werte = Object.entries(zeile.anzahl).filter(([, a]) => a !== '');
    if (werte.length === 0) continue;
    const mhd = mhdAusEingabe(zeile.mhd, ware.mhdArt);
    if (ware.mhdArt !== 'keins' && !mhd) {
      unvollstaendig = true;
      continue;
    }
    for (const [gebindeId, anzahl] of werte) {
      zaehlungen.set(sollKey(zeile.wareId, gebindeId, mhd), {
        wareId: zeile.wareId,
        gebindeId,
        mhd,
        anzahl: Number(anzahl),
      });
    }
  }
  return { zaehlungen: [...zaehlungen.values()], unvollstaendig };
}
