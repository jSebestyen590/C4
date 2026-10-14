import { mhdNormalisieren, type Gebinde, type MhdArt } from '@c4/shared';

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
  erledigt: boolean;
}

/** Empty input = not counted (= 0 when saving). */
export type Anzahl = number | '';

/** All counts of one MHD (or of the single "no MHD" block) per Gebinde. */
export interface MhdGruppe {
  key: string;
  /** Input value: `YYYY-MM-DD` (Tag), `YYYY-MM` (Monat) or empty. */
  mhd: string;
  anzahl: Record<string, Anzahl>;
}

/** Unsaved input of one node. */
export interface KnotenEntwurf {
  gruppen: Record<string, MhdGruppe[]>;
  /** Wares added ad hoc (not in the Warenliste, no Soll). */
  extra: string[];
  /** Ad hoc wares that should join the Warenliste of the node permanently. */
  inListe: string[];
}

let zaehler = 0;
export const neueGruppe = (mhd = ''): MhdGruppe => ({ key: `g${++zaehler}`, mhd, anzahl: {} });

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
        Number(!!b.unterGebindeId) - Number(!!a.unterGebindeId) ||
        a.name.localeCompare(b.name, 'de'),
    );
}

/** Wares of a node: the configured list, then wares with Soll or saved counts that are not in it. */
export function knotenWaren(
  knoten: KnotenDaten,
  waren: Map<string, WareInfo>,
): { liste: string[]; weitere: string[] } {
  const liste = knoten.wareIds.filter((id) => waren.has(id));
  const bekannt = new Set(liste);
  const weitere = [...new Set([...knoten.soll, ...knoten.zaehlungen].map((x) => x.wareId))]
    .filter((id) => !bekannt.has(id) && waren.has(id))
    .sort((a, b) => waren.get(a)!.name.localeCompare(waren.get(b)!.name, 'de'));
  return { liste, weitere };
}

/** Groups for one Ware: one per known MHD (from Soll and saved counts), saved counts prefilled. */
export function wareGruppen(ware: WareInfo, knoten: KnotenDaten): MhdGruppe[] {
  const eigene = <T extends { wareId: string; mhd: string | null }>(xs: T[]) =>
    xs.filter((x) => x.wareId === ware.id);
  const zaehlungen = eigene(knoten.zaehlungen);
  const mhds =
    ware.mhdArt === 'keins'
      ? ['']
      : [
          ...new Set(
            [...eigene(knoten.soll), ...zaehlungen].map((x) => mhdEingabe(x.mhd, ware.mhdArt)),
          ),
        ].sort();
  if (mhds.length === 0) mhds.push('');
  return mhds.map((mhd) => {
    const gruppe = neueGruppe(mhd);
    for (const z of zaehlungen) {
      if (mhdEingabe(z.mhd, ware.mhdArt) === mhd) gruppe.anzahl[z.gebindeId] = z.anzahl;
    }
    return gruppe;
  });
}

export function knotenEntwurf(knoten: KnotenDaten, waren: Map<string, WareInfo>): KnotenEntwurf {
  const { liste, weitere } = knotenWaren(knoten, waren);
  return {
    gruppen: Object.fromEntries(
      [...liste, ...weitere].map((id) => [id, wareGruppen(waren.get(id)!, knoten)]),
    ),
    extra: [],
    inListe: [],
  };
}

/** Counted lines for the API; empty inputs are left out. Returns an error text when input is incomplete. */
export function zaehlungenAus(
  entwurf: KnotenEntwurf,
  waren: Map<string, WareInfo>,
): { zaehlungen: Zaehlung[] } | { fehler: string } {
  const zaehlungen: Zaehlung[] = [];
  for (const [wareId, gruppen] of Object.entries(entwurf.gruppen)) {
    const ware = waren.get(wareId);
    if (!ware) continue;
    for (const g of gruppen) {
      const werte = Object.entries(g.anzahl).filter(([, a]) => a !== '');
      if (werte.length === 0) continue;
      const mhd = mhdAusEingabe(g.mhd, ware.mhdArt);
      if (ware.mhdArt !== 'keins' && !mhd)
        return { fehler: `Bitte gib bei „${ware.name}“ ein MHD an.` };
      for (const [gebindeId, anzahl] of werte) {
        zaehlungen.push({ wareId, gebindeId, mhd, anzahl: Number(anzahl) });
      }
    }
  }
  return { zaehlungen };
}
