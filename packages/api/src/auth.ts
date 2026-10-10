import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { hasPermission, type Permission } from '@c4/shared';
import type { Config } from './config';

export interface AuthUser {
  sub: string;
  username?: string;
  groups: string[];
}
export type TokenVerifier = (token: string) => Promise<AuthUser>;

export type AuthEnv = { Variables: { user: AuthUser; accessToken: string } };

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

export function authenticate(verify: TokenVerifier) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const header = c.req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new HTTPException(401, { message: 'Missing bearer token' });
    try {
      c.set('user', await verify(token));
      c.set('accessToken', token);
    } catch {
      throw new HTTPException(401, { message: 'Invalid token' });
    }
    await next();
  });
}

export function requirePermission(permission: Permission) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    if (!hasPermission(c.get('user').groups, permission)) {
      throw new HTTPException(403, { message: 'Forbidden' });
    }
    await next();
  });
}
