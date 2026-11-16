import { describe, expect, it } from 'vitest';
import { CACHE_MS, createCognitoUserAdmin } from './admin';

type Befehl = { constructor: { name: string }; input: Record<string, unknown> };

/** Fake Cognito client: one user, one group; records every command. */
function fake() {
  const befehle: Befehl[] = [];
  const client = {
    async send(command: unknown) {
      const c = command as Befehl;
      befehle.push(c);
      switch (c.constructor.name) {
        case 'ListUsersCommand':
          return {
            Users: [
              {
                Username: 'k1',
                Enabled: true,
                UserStatus: 'CONFIRMED',
                Attributes: [
                  { Name: 'sub', Value: 's1' },
                  { Name: 'preferred_username', Value: 'anna' },
                ],
              },
            ],
          };
        case 'ListUsersInGroupCommand':
          return c.input.GroupName === 'admin'
            ? { Users: [{ Attributes: [{ Name: 'sub', Value: 's1' }] }] }
            : { Users: [] };
        case 'AdminListGroupsForUserCommand':
          return { Groups: [{ GroupName: 'admin' }] };
        default:
          return { User: { Username: 'neu', Attributes: [] } };
      }
    },
  };
  const zaehle = (name: string) => befehle.filter((b) => b.constructor.name === name).length;
  return { client, befehle, zaehle };
}

function setup() {
  const f = fake();
  let t = 1_000;
  const admin = createCognitoUserAdmin('pool', 'eu-central-1', {
    client: f.client as never,
    jetzt: () => t,
  });
  return { ...f, admin, vor: (ms: number) => (t += ms) };
}
type Admin = ReturnType<typeof setup>['admin'];

describe('Cognito cache', () => {
  it('serves konten() and rollen() from the cache within 60 s', async () => {
    const s = setup();
    const a = await s.admin.konten();
    expect(a.get('s1')).toMatchObject({ kontoName: 'k1', username: 'anna' });
    await s.admin.konten();
    expect(s.zaehle('ListUsersCommand')).toBe(1);
    expect((await s.admin.rollen()).get('s1')).toEqual(['admin']);
    const nachErstem = s.zaehle('ListUsersInGroupCommand');
    await s.admin.rollen();
    expect(s.zaehle('ListUsersInGroupCommand')).toBe(nachErstem);
  });

  it('shares one load between parallel calls', async () => {
    const s = setup();
    await Promise.all([s.admin.konten(), s.admin.konten()]);
    expect(s.zaehle('ListUsersCommand')).toBe(1);
  });

  it('reloads after the cache expired', async () => {
    const s = setup();
    await s.admin.konten();
    s.vor(CACHE_MS - 1);
    await s.admin.konten();
    expect(s.zaehle('ListUsersCommand')).toBe(1);
    s.vor(1);
    await s.admin.konten();
    expect(s.zaehle('ListUsersCommand')).toBe(2);
  });

  it.each([
    ['createUser', (a: Admin) => a.createUser('a@b.de', [])],
    ['setGroups', (a: Admin) => a.setGroups('k1', ['admin'])],
    ['setEnabled', (a: Admin) => a.setEnabled('k1', true)],
    ['setPreferredUsername', (a: Admin) => a.setPreferredUsername('k1', 'bea')],
  ])('%s clears the cache', async (_name, schreibe) => {
    const s = setup();
    await s.admin.konten();
    await s.admin.rollen();
    await schreibe(s.admin);
    const k = s.zaehle('ListUsersCommand');
    const r = s.zaehle('ListUsersInGroupCommand');
    await s.admin.konten();
    await s.admin.rollen();
    expect(s.zaehle('ListUsersCommand')).toBe(k + 1);
    expect(s.zaehle('ListUsersInGroupCommand')).toBeGreaterThan(r);
  });

  it('does not keep a failed load', async () => {
    const s = setup();
    const send = s.client.send;
    s.client.send = async () => {
      s.client.send = send;
      throw new Error('down');
    };
    await expect(s.admin.konten()).rejects.toThrow('down');
    expect((await s.admin.konten()).size).toBe(1);
  });
});

describe('targeted lookups', () => {
  it('konto(sub) filters by sub and escapes quotes', async () => {
    const s = setup();
    expect(await s.admin.konto('s1')).toMatchObject({ sub: 's1', kontoName: 'k1' });
    await s.admin.konto('a"b\\c');
    const liste = s.befehle.filter((b) => b.constructor.name === 'ListUsersCommand');
    expect(liste[0]!.input.Filter).toBe('sub = "s1"');
    expect(liste[1]!.input.Filter).toBe('sub = "a\\"b\\\\c"');
  });

  it('rollenVon(kontoName) lists the groups of one account only', async () => {
    const s = setup();
    expect(await s.admin.rollenVon('k1')).toEqual(['admin']);
    expect(s.zaehle('ListUsersInGroupCommand')).toBe(0);
  });
});
