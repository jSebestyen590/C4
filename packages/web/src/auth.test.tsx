// @vitest-environment jsdom
import { ErrorResponse } from 'oidc-client-ts';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, type AuthState } from './auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const manager = vi.hoisted(() => ({
  getUser: vi.fn(),
  signinSilent: vi.fn(),
  removeUser: vi.fn(),
  signinRedirect: vi.fn(),
  events: {
    addUserLoaded: vi.fn(),
    removeUserLoaded: vi.fn(),
    addUserUnloaded: vi.fn(),
    removeUserUnloaded: vi.fn(),
  },
}));
vi.mock('oidc-client-ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('oidc-client-ts')>()),
  UserManager: function UserManager() {
    return manager;
  },
}));

const config = {
  region: 'eu-central-1',
  userPoolId: 'p',
  clientId: 'c',
  cognitoDomain: 'd',
} as never;

const nutzer = (refresh: string | null = 'r') => ({
  access_token: 'a.b.c',
  refresh_token: refresh,
  expired: false,
});

let auth: AuthState;
let aufraeumen: () => void;

async function rendern(user: unknown) {
  manager.getUser.mockResolvedValue(user);
  function Harness() {
    auth = useAuth();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(
      <AuthProvider config={config}>
        <Harness />
      </AuthProvider>,
    );
  });
  aufraeumen = () => act(() => root.unmount());
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 500 })),
  );
  window.sessionStorage.clear();
  manager.signinSilent.mockReset();
  manager.removeUser.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  aufraeumen();
  vi.unstubAllGlobals();
});

const abgelehnt = () => new ErrorResponse({ error: 'invalid_grant' });

describe('refreshAccessToken', () => {
  it('shares one signinSilent between parallel calls', async () => {
    await rendern(nutzer());
    let fertig!: (u: unknown) => void;
    manager.signinSilent.mockReturnValue(new Promise((r) => (fertig = r)));
    const a = auth.refreshAccessToken();
    const b = auth.refreshAccessToken();
    fertig({ access_token: 'neu' });
    await expect(Promise.all([a, b])).resolves.toEqual(['neu', 'neu']);
    expect(manager.signinSilent).toHaveBeenCalledTimes(1);
    // Afterwards a new refresh starts a new call.
    manager.signinSilent.mockResolvedValue({ access_token: 'neuer' });
    await expect(auth.refreshAccessToken()).resolves.toBe('neuer');
    expect(manager.signinSilent).toHaveBeenCalledTimes(2);
  });

  it('removes the user when Cognito refuses the refresh token', async () => {
    await rendern(nutzer());
    manager.signinSilent.mockRejectedValue(abgelehnt());
    await expect(auth.refreshAccessToken()).resolves.toBeNull();
    expect(manager.removeUser).toHaveBeenCalledTimes(1);
  });

  it('keeps the session on a network error', async () => {
    await rendern(nutzer());
    manager.signinSilent.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(auth.refreshAccessToken()).resolves.toBeNull();
    expect(manager.removeUser).not.toHaveBeenCalled();
  });

  it('removes the user without calling Cognito when there is no refresh token', async () => {
    await rendern(nutzer(null));
    await expect(auth.refreshAccessToken()).resolves.toBeNull();
    expect(manager.signinSilent).not.toHaveBeenCalled();
    expect(manager.removeUser).toHaveBeenCalledTimes(1);
  });

  it('removes the user at most once per 30 s (no redirect loop)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await rendern(nutzer());
      manager.signinSilent.mockRejectedValue(abgelehnt());
      await auth.refreshAccessToken();
      vi.advanceTimersByTime(10_000);
      await auth.refreshAccessToken();
      expect(manager.removeUser).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(21_000);
      await auth.refreshAccessToken();
      expect(manager.removeUser).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
