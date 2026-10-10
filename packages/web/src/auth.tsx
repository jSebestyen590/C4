import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasPermission, type AppConfig, type Permission } from '@c4/shared';

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
}

const AuthContext = createContext<AuthState | null>(null);

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

  const value = useMemo<AuthState>(() => {
    const groups = user ? decodeGroups(user.access_token) : [];
    return {
      user,
      groups,
      can: (permission) => hasPermission(groups, permission),
      login: () => manager.signinRedirect({ extraQueryParams: { lang: 'de' } }),
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
        if (!user?.refresh_token) return null;
        return (await manager.signinSilent().catch(() => null))?.access_token ?? null;
      },
    };
  }, [user, manager, config]);

  if (!ready) return null;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export { createUserManager as _createUserManagerForCallback };
