import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'node:crypto';
import type { AdminUser } from '@c4/shared';

export class UsernameTakenError extends Error {}

export interface UserAdmin {
  listUsers(): Promise<AdminUser[]>;
  createUser(email: string, groups: string[]): Promise<AdminUser>;
  /** Login names (preferred_username) of all users, keyed by Cognito `sub`. */
  usernamesBySub(): Promise<Map<string, string>>;
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
    async listUsers() {
      const res = await client.send(new ListUsersCommand({ UserPoolId: userPoolId, Limit: 60 }));
      return Promise.all(
        (res.Users ?? []).map(async (u) => ({
          username: u.Username ?? '',
          preferredUsername: u.Attributes?.find((a) => a.Name === 'preferred_username')?.Value,
          email: u.Attributes?.find((a) => a.Name === 'email')?.Value,
          sub: u.Attributes?.find((a) => a.Name === 'sub')?.Value,
          status: u.UserStatus ?? 'UNKNOWN',
          enabled: u.Enabled ?? false,
          groups: await groupsOf(u.Username ?? ''),
        })),
      );
    },
    async usernamesBySub() {
      const result = new Map<string, string>();
      let token: string | undefined;
      do {
        const res = await client.send(
          new ListUsersCommand({ UserPoolId: userPoolId, Limit: 60, PaginationToken: token }),
        );
        for (const u of res.Users ?? []) {
          const sub = u.Attributes?.find((a) => a.Name === 'sub')?.Value;
          const name = u.Attributes?.find((a) => a.Name === 'preferred_username')?.Value;
          if (sub && name) result.set(sub, name);
        }
        token = res.PaginationToken;
      } while (token);
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
