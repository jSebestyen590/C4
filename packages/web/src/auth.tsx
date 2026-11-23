import { ErrorResponse, UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DeaktiviertSeite } from './DeaktiviertSeite';
import { fetchMitWiederholung } from './fetchWiederholen';
import { aktuellesZiel } from './ruecksprung';
import { meSchema, type AppConfig, type Permission } from '@c4/shared';

export interface AuthState {
  user: User | null;
  /** Cognito groups, read from the access token. */
  groups: string[];
  can: (permission: Permission) => boolean;
  login: () => Promise<void>;
  logout: () => void;
  getAccessToken: () => string | null;
  /** Exchanges the refresh token for a new access token; null if that is not possible. */
  refreshAccessToken: () => Promise<string | null>;
  /** Replaces the app with the lock page; called when any API request reports a deactivated account. */
  kontoDeaktiviert: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** The token refresh in flight, shared by all requests that hit a 401 at the same time. */
let laufendeErneuerung: Promise<string | null> | null = null;

const FEHLSCHLAG_KEY = 'c4-erneuerung-fehlgeschlagen';

/**
 * The session cannot be renewed: drop the stored user, so `Protected` sends the person to the login
 * page instead of leaving a broken app behind. At most once per 30 s, so a login that immediately
 * fails again cannot cause a redirect loop.
 */
function abmeldenNachFehlschlag(manager: UserManager): void {
  try {
    const zuletzt = Number(window.sessionStorage.getItem(FEHLSCHLAG_KEY) ?? 0);
    if (Date.now() - zuletzt < 30_000) return;
    window.sessionStorage.setItem(FEHLSCHLAG_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: proceed without the guard.
  }
  void manager.removeUser();
}

export function createUserManager(config: AppConfig): UserManager {
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return new UserManager({
    authority: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
    client_id: config.clientId,
    redirect_uri: `${origin}${base}/auth/callback`,
    response_type: 'code',
    scope: 'openid email aws.cognito.signin.user.admin',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    // Renews shortly before expiry using the refresh token (30 days), so users stay signed in.
    automaticSilentRenew: true,
  });
}

function decodeGroups(accessToken: string): string[] {
  try {
    const payload = JSON.parse(
      atob(accessToken.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/')),
    );
    return Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : [];
  } catch {
    return [];
  }
}

export function AuthProvider({
  config,
  children,
}: Readonly<{ config: AppConfig; children: ReactNode }>) {
  const manager = useMemo(() => createUserManager(config), [config]);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  // Effective permissions as computed by the API (status + groups); null until loaded.
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  // Set when the API answers 403 `deaktiviert`; the app is then replaced by a lock page.
  const [deaktiviert, setDeaktiviert] = useState(false);

  useEffect(() => {
    void (async () => {
      let u = await manager.getUser();
      // The access token (1 h) may have expired while the app was closed: renew it.
      if (u?.expired && u.refresh_token) u = await manager.signinSilent().catch(() => null);
      setUser(u && !u.expired ? u : null);
      setReady(true);
    })();
    const onLoaded = (u: User) => setUser(u);
    const onUnloaded = () => setUser(null);
    manager.events.addUserLoaded(onLoaded);
    manager.events.addUserUnloaded(onUnloaded);
    return () => {
      manager.events.removeUserLoaded(onLoaded);
      manager.events.removeUserUnloaded(onUnloaded);
    };
  }, [manager]);

  // Reload on every new token (sign-in and hourly renewal), so a changed status takes effect.
  const accessToken = user?.access_token;
  useEffect(() => {
    if (!accessToken) return;
    void fetchMitWiederholung('/api/me', { headers: { authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        if (res.status === 403) {
          const body = (await res.json().catch(() => null)) as { deaktiviert?: boolean } | null;
          if (body?.deaktiviert) {
            setDeaktiviert(true);
            return [];
          }
        }
        if (!res.ok) throw new Error('Rechte konnten nicht geladen werden');
        return meSchema.parse(await res.json()).permissions as Permission[];
      })
      // A transient failure must not wipe permissions that were already loaded.
      .catch(() => null)
      .then((neu) => setPermissions((prev) => neu ?? prev ?? []));
  }, [accessToken]);

  const value = useMemo<AuthState>(() => {
    const groups = user ? decodeGroups(user.access_token) : [];
    return {
      user,
      groups,
      can: (permission) => permissions?.includes(permission) ?? false,
      login: () =>
        manager.signinRedirect({ extraQueryParams: { lang: 'de' }, state: aktuellesZiel() }),
      logout: () => {
        void manager.removeUser();
        // Cognito's discovery document has no end_session_endpoint, so build the URL by hand.
        const logoutUri = `${window.location.origin}${import.meta.env.BASE_URL}`;
        window.location.assign(
          `https://${config.cognitoDomain}/logout?client_id=${config.clientId}&logout_uri=${encodeURIComponent(logoutUri)}`,
        );
      },
      getAccessToken: () => user?.access_token ?? null,
      refreshAccessToken: async () => {
        if (!user?.refresh_token) {
          abmeldenNachFehlschlag(manager);
          return null;
        }
        // Parallel 401s share one refresh instead of each calling signinSilent().
        laufendeErneuerung ??= manager
          .signinSilent()
          .then((u) => u?.access_token ?? null)
          .catch((e: unknown) => {
            // Only a refusal by Cognito (refresh token expired or revoked) ends the session;
            // a network error may be temporary.
            if (e instanceof ErrorResponse) abmeldenNachFehlschlag(manager);
            return null;
          })
          .finally(() => {
            laufendeErneuerung = null;
          });
        return laufendeErneuerung;
      },
      kontoDeaktiviert: () => setDeaktiviert(true),
    };
  }, [user, manager, config, permissions]);

  // Wait for the permissions so protected pages do not flash "no access".
  if (!ready || (user && permissions === null)) return null;
  if (user && deaktiviert) return <DeaktiviertSeite onAbmelden={value.logout} />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export { createUserManager as _createUserManagerForCallback };
