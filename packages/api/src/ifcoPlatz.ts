import { and, eq, inArray } from 'drizzle-orm';
import { ifcoPlatzFehler, type IfcoEintrag, type IfcoMass, type IfcoPlatzMasse } from '@c4/shared';
import type { Db } from './db/client';
import { ifcos, ifcoTypen, type IfcoTypRow, type LagerortRow } from './db/schema';

type Q = Pick<Db, 'select'>;

/** Dimensions of an Ifco-Lagerplatz, null for a normal Lagerort. */
export function ifcoPlatzMasse(
  ort: Pick<LagerortRow, 'ifcoHoeheCm' | 'ifcoStellflaechen'>,
): IfcoPlatzMasse | null {
  if (ort.ifcoHoeheCm === null || ort.ifcoStellflaechen === null) return null;
  return { hoeheCm: ort.ifcoHoeheCm, stellflaechen: ort.ifcoStellflaechen };
}

export interface PlatzPruefung {
  /** Ifco ids that do not count as standing there (the one that is being moved or edited). */
  ohne?: string[];
  /** Ifcos to add; `typId` null = no type. */
  neu?: { name: string; typId: string | null }[];
  /** Replacement dimensions of types whose master data is being edited. */
  typen?: Map<string, IfcoMass>;
}

/**
 * German error unless the non-archived Ifcos standing on the Ifco-Lagerplatz `ort` (minus
 * `optionen.ohne`) plus `optionen.neu` fit within `masse`, otherwise null.
 */
export async function ifcoPlatzPruefen(
  q: Q,
  ort: Pick<LagerortRow, 'id' | 'name'>,
  masse: IfcoPlatzMasse,
  optionen: PlatzPruefung = {},
): Promise<string | null> {
  const ohne = new Set(optionen.ohne ?? []);
  const stehend = (
    await q
      .select()
      .from(ifcos)
      .where(and(eq(ifcos.lagerortId, ort.id), eq(ifcos.archiviert, false)))
  ).filter((i) => !ohne.has(i.id));
  const typIds = [
    ...new Set(
      [...stehend.map((i) => i.typId), ...(optionen.neu ?? []).map((n) => n.typId)].filter(
        (t): t is string => t !== null,
      ),
    ),
  ];
  const typen = new Map<string, IfcoTypRow>(
    (typIds.length
      ? await q.select().from(ifcoTypen).where(inArray(ifcoTypen.id, typIds))
      : []
    ).map((t) => [t.id, t]),
  );
  const eintrag = (name: string, typId: string | null): IfcoEintrag => {
    const typ = typId === null ? undefined : typen.get(typId);
    if (!typ) return { name, typ: null };
    const mass = optionen.typen?.get(typ.id) ?? typ;
    return {
      name,
      typ: { name: typ.name, grundflaeche: mass.grundflaeche, hoeheCm: mass.hoeheCm },
    };
  };
  return ifcoPlatzFehler(
    ort.name,
    masse,
    stehend.map((i) => eintrag(i.name, i.typId)),
    (optionen.neu ?? []).map((n) => eintrag(n.name, n.typId)),
  );
}
