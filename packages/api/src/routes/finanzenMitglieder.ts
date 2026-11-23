import type { FinanzMitgliedDto } from '@c4/shared';
import type { AppDeps } from '../app';

/** Display data of members in Finanzen DTOs; null if the member has no profile any more. */
export const finanzenMitgliederLaden = async (
  deps: Pick<AppDeps, 'mitglieder' | 'userAdmin'>,
): Promise<(sub: string) => FinanzMitgliedDto | null> => {
  const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
  const zeilen = new Map(rows.map((r) => [r.sub, r]));
  return (sub) => {
    const zeile = zeilen.get(sub);
    if (!zeile) return null;
    return {
      sub,
      username: konten.get(sub)?.username ?? null,
      vorname: zeile.vorname,
      nachname: zeile.nachname,
      status: zeile.status,
      anrede: zeile.anrede ?? 'neutral',
    };
  };
};
