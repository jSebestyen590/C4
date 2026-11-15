import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersCommandOutput,
  ListUsersInGroupCommand,
  ListUsersInGroupCommandOutput,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'node:crypto';
import { ROLES, type AdminUser } from '@c4/shared';

/** The Cognito side of a member: login name, email and whether the account is usable. */
export interface Konto {
  sub: string;
  /** Internal Cognito username (UUID); the key for group operations. */
  kontoName: string;
  username?: string;
  email?: string;
  /** False while the user still has to set their first password. */
  aktiviert: boolean;
  /** False for accounts an admin disabled. */
  enabled: boolean;
}

export class UsernameTakenError extends Error {}

export interface UserAdmin {
  createUser(email: string, groups: string[]): Promise<AdminUser>;
  /** All Cognito accounts, keyed by `sub`. */
  konten(): Promise<Map<string, Konto>>;
  /** Roles per account, keyed by `sub`; accounts without a role are missing. */
  rollen(): Promise<Map<string, string[]>>;
  getPreferredUsername(username: string): Promise<string | undefined>;
  /** Throws UsernameTakenError when another user already uses the name. */
  setPreferredUsername(username: string, preferred: string): Promise<void>;
  setGroups(username: string, groups: string[]): Promise<string[]>;
  /** Disabling also signs the user out everywhere (refresh tokens); enabling only re-allows the login. */
  setEnabled(kontoName: string, enabled: boolean): Promise<void>;
}

/** Targeted lookups for a single person; saves listing the whole user pool. */
export interface UserAdminEinzeln {
  /** The account with this `sub`, or undefined. */
  konto(sub: string): Promise<Konto | undefined>;
  /** Roles of one account, by its internal `kontoName`. */
  rollenVon(kontoName: string): Promise<string[]>;
}

/** How long `konten()` and `rollen()` are reused per warm container. */
export const CACHE_MS = 60_000;

/** The part of the Cognito client used here (a fake can stand in for it in tests). */
export type CognitoSender = Pick<CognitoIdentityProviderClient, 'send'>;

export interface CognitoUserAdminOptionen {
  client?: CognitoSender;
  /** Clock in ms; injectable for tests. */
  jetzt?: () => number;
}

export function createCognitoUserAdmin(
  userPoolId: string,
  region: string,
  {
    client = new CognitoIdentityProviderClient({ region }),
    jetzt = Date.now,
  }: CognitoUserAdminOptionen = {},
): UserAdmin & UserAdminEinzeln {
  // Cached per warm container; any write through this admin clears it. Writes by other containers
  // show up after at most CACHE_MS.
  const cache: {
    konten?: { bis: number; wert: Promise<Map<string, Konto>> };
    rollen?: { bis: number; wert: Promise<Map<string, string[]>> };
  } = {};
  const leeren = () => {
    cache.konten = undefined;
    cache.rollen = undefined;
  };
  const gecacht = <K extends 'konten' | 'rollen'>(
    schluessel: K,
    laden: () => NonNullable<(typeof cache)[K]>['wert'],
  ): NonNullable<(typeof cache)[K]>['wert'] => {
    const treffer = cache[schluessel];
    if (treffer && treffer.bis > jetzt()) return treffer.wert as never;
    const eintrag = { bis: jetzt() + CACHE_MS, wert: laden() };
    (cache as Record<string, unknown>)[schluessel] = eintrag;
    // Do not keep a failed load around.
    eintrag.wert.catch(() => {
      if (cache[schluessel] === eintrag) cache[schluessel] = undefined;
    });
    return eintrag.wert as never;
  };
  const kontoVon = (u: UserType): Konto | undefined => {
    const attr = (name: string) => u.Attributes?.find((a) => a.Name === name)?.Value;
    const sub = attr('sub');
    if (!sub) return undefined;
    return {
      sub,
      kontoName: u.Username ?? '',
      username: attr('preferred_username'),
      email: attr('email'),
      aktiviert: u.UserStatus !== 'FORCE_CHANGE_PASSWORD',
      enabled: u.Enabled ?? false,
    };
  };
  const groupsOf = async (username: string): Promise<string[]> => {
    const res = await client.send(
      new AdminListGroupsForUserCommand({ UserPoolId: userPoolId, Username: username }),
    );
    return (res.Groups ?? []).flatMap((g) => (g.GroupName ? [g.GroupName] : []));
  };
  const roh: UserAdmin & UserAdminEinzeln = {
    konten: () =>
      gecacht('konten', async () => {
        const result = new Map<string, Konto>();
        let token: string | undefined;
        do {
          const res: ListUsersCommandOutput = await client.send(
            new ListUsersCommand({ UserPoolId: userPoolId, Limit: 60, PaginationToken: token }),
          );
          for (const u of res.Users ?? []) {
            const konto = kontoVon(u);
            if (konto) result.set(konto.sub, konto);
          }
          token = res.PaginationToken;
        } while (token);
        return result;
      }),
    rollen: () =>
      gecacht('rollen', async () => {
        const result = new Map<string, string[]>();
        for (const role of ROLES) {
          let token: string | undefined;
          do {
            const res: ListUsersInGroupCommandOutput = await client.send(
              new ListUsersInGroupCommand({
                UserPoolId: userPoolId,
                GroupName: role,
                Limit: 60,
                NextToken: token,
              }),
            );
            for (const u of res.Users ?? []) {
              const sub = u.Attributes?.find((a) => a.Name === 'sub')?.Value;
              if (sub) result.set(sub, [...(result.get(sub) ?? []), role]);
            }
            token = res.NextToken;
          } while (token);
        }
        return result;
      }),
    async konto(sub) {
      const res: ListUsersCommandOutput = await client.send(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          Limit: 1,
          Filter: `sub = "${sub.replace(/["\\]/g, '\\$&')}"`,
        }),
      );
      const u = res.Users?.[0];
      return u ? kontoVon(u) : undefined;
    },
    rollenVon: (kontoName) => groupsOf(kontoName),
    async createUser(email, groups) {
      // The internal username is an opaque UUID; people sign in with email or their chosen alias.
      const username = randomUUID();
      const res = await client.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: username,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        }),
      );
      const created = res.User?.Username ?? username;
      for (const group of groups) {
        await client.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: userPoolId,
            Username: created,
            GroupName: group,
          }),
        );
      }
      return {
        username: created,
        email,
        sub: res.User?.Attributes?.find((a) => a.Name === 'sub')?.Value,
        status: res.User?.UserStatus ?? 'FORCE_CHANGE_PASSWORD',
        enabled: res.User?.Enabled ?? true,
        groups,
      };
    },
    async getPreferredUsername(username) {
      const res = await client.send(
        new AdminGetUserCommand({ UserPoolId: userPoolId, Username: username }),
      );
      return res.UserAttributes?.find((a) => a.Name === 'preferred_username')?.Value;
    },
    async setPreferredUsername(username, preferred) {
      try {
        await client.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: username,
            UserAttributes: [{ Name: 'preferred_username', Value: preferred }],
          }),
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'AliasExistsException') {
          throw new UsernameTakenError(preferred);
        }
        throw err;
      }
    },
    async setEnabled(kontoName, enabled) {
      if (enabled) {
        await client.send(
          new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: kontoName }),
        );
        return;
      }
      await client.send(
        new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: kontoName }),
      );
      await client.send(
        new AdminUserGlobalSignOutCommand({ UserPoolId: userPoolId, Username: kontoName }),
      );
    },
    async setGroups(username, groups) {
      const current = await groupsOf(username);
      for (const group of groups.filter((g) => !current.includes(g))) {
        await client.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: userPoolId,
            Username: username,
            GroupName: group,
          }),
        );
      }
      for (const group of current.filter((g) => !groups.includes(g))) {
        await client.send(
          new AdminRemoveUserFromGroupCommand({
            UserPoolId: userPoolId,
            Username: username,
            GroupName: group,
          }),
        );
      }
      return groups;
    },
  };
  /** Runs a write and clears the cache afterwards, also when it failed halfway. */
  const schreibend =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      try {
        return await f(...a);
      } finally {
        leeren();
      }
    };
  return {
    ...roh,
    createUser: schreibend(roh.createUser),
    setGroups: schreibend(roh.setGroups),
    setEnabled: schreibend(roh.setEnabled),
    setPreferredUsername: schreibend(roh.setPreferredUsername),
  };
}
