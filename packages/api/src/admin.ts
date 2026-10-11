import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
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
}

export function createCognitoUserAdmin(userPoolId: string, region: string): UserAdmin {
  const client = new CognitoIdentityProviderClient({ region });
  const groupsOf = async (username: string): Promise<string[]> => {
    const res = await client.send(
      new AdminListGroupsForUserCommand({ UserPoolId: userPoolId, Username: username }),
    );
    return (res.Groups ?? []).flatMap((g) => (g.GroupName ? [g.GroupName] : []));
  };
  return {
    async konten() {
      const result = new Map<string, Konto>();
      let token: string | undefined;
      do {
        const res = await client.send(
          new ListUsersCommand({ UserPoolId: userPoolId, Limit: 60, PaginationToken: token }),
        );
        for (const u of res.Users ?? []) {
          const attr = (name: string) => u.Attributes?.find((a) => a.Name === name)?.Value;
          const sub = attr('sub');
          if (!sub) continue;
          result.set(sub, {
            sub,
            kontoName: u.Username ?? '',
            username: attr('preferred_username'),
            email: attr('email'),
            aktiviert: u.UserStatus !== 'FORCE_CHANGE_PASSWORD',
            enabled: u.Enabled ?? false,
          });
        }
        token = res.PaginationToken;
      } while (token);
      return result;
    },
    async rollen() {
      const result = new Map<string, string[]>();
      for (const role of ROLES) {
        let token: string | undefined;
        do {
          const res = await client.send(
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
    },
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
}
