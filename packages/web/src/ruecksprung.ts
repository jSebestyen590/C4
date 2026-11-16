/** Current page (path + query + hash), carried through the login as OIDC `state`. */
export function aktuellesZiel(): { ziel: string } {
  const { pathname, search, hash } = window.location;
  return { ziel: pathname + search + hash };
}

/** Where to go after login: the requested same-app path, else the app start page. */
export function ruecksprungZiel(state: unknown, base: string): string {
  const ziel = (state as { ziel?: unknown } | null | undefined)?.ziel;
  if (
    typeof ziel !== 'string' ||
    !ziel.startsWith(base) ||
    ziel.startsWith('//') ||
    ziel.includes('\\') ||
    ziel.startsWith(`${base}auth/callback`)
  ) {
    return base;
  }
  return ziel;
}
