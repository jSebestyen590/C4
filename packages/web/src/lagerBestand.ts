import { bestandAnzeigen, mhdAnzeigen, pfad, tiefensuche, type Gebinde } from '@c4/shared';
import type { LagerKnoten } from './LagerBaum';
import { gebindeVonWare, type WareInfo } from './inventurDaten';

/** Current stock of one Ware and Gebinde on one node (summed over MHD), as `GET /lagerorte/bestand`. */
export interface BestandsZeile {
  lagerortId: string;
  wareId: string;
  gebindeId: string;
  menge: number;
  fruehestesMhd: string | null;
}

const key = (lagerortId: string, wareId: string, gebindeId: string) =>
  `${lagerortId}|${wareId}|${gebindeId}`;

/** Stock per (node, Ware, Gebinde). */
export function bestandKarte(zeilen: BestandsZeile[]): Map<string, number> {
  const karte = new Map<string, number>();
  for (const z of zeilen) {
    const k = key(z.lagerortId, z.wareId, z.gebindeId);
    karte.set(k, (karte.get(k) ?? 0) + z.menge);
  }
  return karte;
}

export type BestandKarte = Map<string, number>;

export const bestandVon = (
  karte: BestandKarte,
  lagerortId: string,
  wareId: string,
  gebindeId: string,
): number => Math.max(0, karte.get(key(lagerortId, wareId, gebindeId)) ?? 0);

/** The given wares in Warenliste order first, then the others alphabetically. */
export function warenSortieren(
  ids: Iterable<string>,
  liste: string[] | undefined,
  waren: Map<string, WareInfo>,
): string[] {
  const alle = new Set([...ids].filter((id) => waren.has(id)));
  const inListe = (liste ?? []).filter((id) => alle.has(id));
  const gelistet = new Set(inListe);
  const rest = [...alle]
    .filter((id) => !gelistet.has(id))
    .sort((a, b) => waren.get(a)!.name.localeCompare(waren.get(b)!.name, 'de'));
  return [...inListe, ...rest];
}

/** Stock lines of one node for the Lager tree: `Krosti: 9 Kästen, 13 Flaschen` plus the earliest MHD. */
export interface BestandsAnzeige {
  wareId: string;
  name: string;
  text: string;
  mhd: string;
}

export function bestandAnzeigeJeKnoten(
  zeilen: BestandsZeile[],
  listen: Map<string, string[]>,
  waren: Map<string, WareInfo>,
  gebinde: Gebinde[],
): Map<string, BestandsAnzeige[]> {
  const jeKnoten = new Map<string, Map<string, BestandsZeile[]>>();
  for (const z of zeilen) {
    if (z.menge === 0) continue;
    const knoten = jeKnoten.get(z.lagerortId) ?? new Map<string, BestandsZeile[]>();
    knoten.set(z.wareId, [...(knoten.get(z.wareId) ?? []), z]);
    jeKnoten.set(z.lagerortId, knoten);
  }
  const ergebnis = new Map<string, BestandsAnzeige[]>();
  for (const [lagerortId, jeWare] of jeKnoten) {
    const eintraege: BestandsAnzeige[] = [];
    for (const wareId of warenSortieren(jeWare.keys(), listen.get(lagerortId), waren)) {
      const ware = waren.get(wareId)!;
      const wareZeilen = jeWare.get(wareId)!;
      const mhds = wareZeilen
        .map((z) => z.fruehestesMhd)
        .filter((m): m is string => m !== null)
        .sort();
      eintraege.push({
        wareId,
        name: ware.name,
        text: bestandAnzeigen(wareZeilen, gebinde),
        mhd: mhdAnzeigen(mhds[0], ware.mhdArt),
      });
    }
    ergebnis.set(lagerortId, eintraege);
  }
  return ergebnis;
}

/** One Ware of a section of Entnahme / Umlagerung with the Gebinde that can be taken. */
export interface AusgangWare {
  ware: WareInfo;
  gebinde: Gebinde[];
}

export interface AusgangAbschnittDaten {
  lagerortId: string;
  pfad: string;
  waren: AusgangWare[];
}

/**
 * Sections of the withdrawal tables: the non-archived nodes of the subtree (depth first) that have
 * stock; per node the wares with stock (Warenliste order, then alphabetical). A Gebinde is offered
 * when it has stock on the node or when one of its Obergebinde has (bottles out of a crate).
 */
export function ausgangAbschnitte(
  rootId: string,
  lagerorte: LagerKnoten[],
  zeilen: BestandsZeile[],
  listen: Map<string, string[]>,
  waren: Map<string, WareInfo>,
  alleGebinde: Gebinde[],
): AusgangAbschnittDaten[] {
  const karte = bestandKarte(zeilen);
  const abschnitte: AusgangAbschnittDaten[] = [];
  for (const k of tiefensuche(lagerorte, rootId)) {
    if (k.archiviert) continue;
    const wareIds = new Set(
      zeilen.filter((z) => z.lagerortId === k.id && z.menge > 0).map((z) => z.wareId),
    );
    const eintraege: AusgangWare[] = [];
    for (const wareId of warenSortieren(wareIds, listen.get(k.id), waren)) {
      const ware = waren.get(wareId)!;
      const gebinde = gebindeVonWare(ware, alleGebinde).filter(
        (g) =>
          bestandVon(karte, k.id, wareId, g.id) > 0 ||
          alleGebinde.some(
            (o) => o.unterGebindeId === g.id && bestandVon(karte, k.id, wareId, o.id) > 0,
          ),
      );
      if (gebinde.length > 0) eintraege.push({ ware, gebinde });
    }
    if (eintraege.length > 0)
      abschnitte.push({ lagerortId: k.id, pfad: pfad(lagerorte, k.id), waren: eintraege });
  }
  return abschnitte;
}

/** Entered amounts of one row, Gebinde id -> digits. */
export type Eingaben = Record<string, Record<string, string>>;

export const zeilenKey = (lagerortId: string, wareId: string) => `${lagerortId}|${wareId}`;

/**
 * How many of a Gebinde can be taken: its own stock plus, for a Untergebinde, the content of the
 * Obergebinde not yet taken in the same row (`unterAnzahl` each).
 */
export function verfuegbar(
  karte: BestandKarte,
  lagerortId: string,
  wareId: string,
  g: Gebinde,
  warenGebinde: Gebinde[],
  eingabe: Record<string, string> | undefined,
): number {
  const eigen = bestandVon(karte, lagerortId, wareId, g.id);
  const ausOber = warenGebinde
    .filter((o) => o.unterGebindeId === g.id)
    .reduce(
      (summe, o) =>
        summe +
        Math.max(0, bestandVon(karte, lagerortId, wareId, o.id) - Number(eingabe?.[o.id] || 0)) *
          (o.unterAnzahl ?? 1),
      0,
    );
  return eigen + ausOber;
}

export interface AusgangPosition {
  lagerortId: string;
  wareId: string;
  gebindeId: string;
  anzahl: number;
}

/** Entered amounts (> 0) of all sections as positions. */
export function ausgangPositionen(
  abschnitte: AusgangAbschnittDaten[],
  eingaben: Eingaben,
): AusgangPosition[] {
  return abschnitte.flatMap((a) =>
    a.waren.flatMap((w) =>
      w.gebinde.flatMap((g) => {
        const anzahl = Number(eingaben[zeilenKey(a.lagerortId, w.ware.id)]?.[g.id] || 0);
        return anzahl > 0
          ? [{ lagerortId: a.lagerortId, wareId: w.ware.id, gebindeId: g.id, anzahl }]
          : [];
      }),
    ),
  );
}

/** `Krosti: 2 Kästen, 3 Flaschen` per Ware of one node. */
export function positionenText(
  positionen: AusgangPosition[],
  lagerortId: string,
  waren: Map<string, WareInfo>,
  gebinde: Gebinde[],
): string[] {
  const jeWare = new Map<string, { gebindeId: string; menge: number }[]>();
  for (const p of positionen.filter((x) => x.lagerortId === lagerortId))
    jeWare.set(p.wareId, [
      ...(jeWare.get(p.wareId) ?? []),
      { gebindeId: p.gebindeId, menge: p.anzahl },
    ]);
  return [...jeWare].map(
    ([wareId, mengen]) => `${waren.get(wareId)?.name ?? '?'}: ${bestandAnzeigen(mengen, gebinde)}`,
  );
}
