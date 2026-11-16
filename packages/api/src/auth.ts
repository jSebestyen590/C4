import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { permissionsFor, type MitgliedStatus, type Permission } from '@c4/shared';
import type { Config } from './config';

export interface AuthUser {
  sub: string;
  username?: string;
  groups: string[];
}
export type TokenVerifier = (token: string) => Promise<AuthUser>;

/** What the profile row says about the member's access. */
export interface Profil {
  status: MitgliedStatus;
  deaktiviert: boolean;
}

/** Thrown (as cause of the 403) for deactivated accounts; the error body then carries `deaktiviert: true`. */
export const DEAKTIVIERT = 'deaktiviert';
export const DEAKTIVIERT_MELDUNG = 'Dein Account ist deaktiviert.';

export type AuthEnv = {
  Variables: { user: AuthUser; accessToken: string; permissions: Permission[] };
};

/** Verifies a Cognito *access* token (signature, issuer, token_use, client_id). */
export function createCognitoVerifier(
  config: Pick<Config, 'region' | 'userPoolId' | 'clientId'>,
): TokenVerifier {
  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (payload['token_use'] !== 'access' || payload['client_id'] !== config.clientId) {
      throw new Error('Unexpected token');
    }
    const groups = payload['cognito:groups'];
    return {
      sub: String(payload.sub),
      username: typeof payload['username'] === 'string' ? payload['username'] : undefined,
      groups: Array.isArray(groups) ? groups.map(String) : [],
    };
  };
}

/**
 * Verifies the token and derives the effective permissions from the member's status (database), the
 * token's groups and the permissions of the Posten the member currently holds (database). A member
 * without a profile row counts as a candidate. Deactivated members are rejected with 403 (the access
 * token stays valid for up to an hour after Cognito disabled the account, so the database decides).
 */
export function authenticate(
  verify: TokenVerifier,
  profilOf: (sub: string) => Promise<Profil | undefined>,
  postenRechteOf: (sub: string) => Promise<Permission[]>,
) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    // The default-deny guard in `createApp` already ran this; the per-route `auth` must not load the profile again.
    if (c.get('user')) return next();
    const header = c.req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new HTTPException(401, { message: 'Missing bearer token' });
    try {
      c.set('user', await verify(token));
      c.set('accessToken', token);
    } catch {
      throw new HTTPException(401, { message: 'Invalid token' });
    }
    const user = c.get('user');
    const [profil, extra] = await Promise.all([profilOf(user.sub), postenRechteOf(user.sub)]);
    if (profil?.deaktiviert) {
      throw new HTTPException(403, { message: DEAKTIVIERT_MELDUNG, cause: DEAKTIVIERT });
    }
    c.set('permissions', permissionsFor(user.groups, profil?.status ?? 'anwaerter', extra));
    await next();
  });
}

export function requirePermission(permission: Permission) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    if (!c.get('permissions').includes(permission)) {
      throw new HTTPException(403, { message: 'Forbidden' });
    }
    await next();
  });
}
