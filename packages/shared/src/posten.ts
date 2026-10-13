import type { Anrede } from './anrede';

export interface Bezeichnungen {
  bezeichnungMaennlich: string | null;
  bezeichnungWeiblich: string | null;
  bezeichnungNeutral: string | null;
}

/** Title of the holder matching how they want to be addressed; the Posten name if none is set. */
export function bezeichnungFuer(posten: Bezeichnungen & { name: string }, anrede: Anrede): string {
  const form = {
    maennlich: posten.bezeichnungMaennlich,
    weiblich: posten.bezeichnungWeiblich,
    neutral: posten.bezeichnungNeutral,
  }[anrede];
  return form ?? posten.name;
}
