import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { ROLES, type Role } from '@c4/shared';
import { unwrap, useApi } from '../api';

export function AdminPage() {
  const api = useApi();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => unwrap(await api.admin.users.$get()),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const create = useMutation({
    mutationFn: async (input: { email: string; groups: Role[] }) =>
      unwrap(await api.admin.users.$post({ json: input })),
    onSuccess: refresh,
  });
  const setGroups = useMutation({
    mutationFn: async (input: { username: string; groups: Role[] }) =>
      unwrap(
        await api.admin.users[':username'].groups.$put({
          param: { username: input.username },
          json: { groups: input.groups },
        }),
      ),
    onSuccess: refresh,
  });

  const [email, setEmail] = useState('');
  const [newGroups, setNewGroups] = useState<Role[]>(['reader']);
  const toggle = (list: Role[], role: Role) =>
    list.includes(role) ? list.filter((r) => r !== role) : [...list, role];

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    create.mutate({ email, groups: newGroups }, { onSuccess: () => setEmail('') });
  };

  return (
    <>
      <h1>Users</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="email"
          required
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {ROLES.map((role) => (
          <label key={role}>
            <input
              type="checkbox"
              checked={newGroups.includes(role)}
              onChange={() => setNewGroups(toggle(newGroups, role))}
            />
            {role}
          </label>
        ))}
        <button type="submit" disabled={create.isPending}>
          Invite
        </button>
      </form>
      {create.isError && <p>Could not create user.</p>}
      {users.isError && <p>Could not load users.</p>}
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Username</th>
            <th>Status</th>
            {ROLES.map((r) => (
              <th key={r}>{r}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.data?.map((u) => (
            <tr key={u.username}>
              <td>{u.email}</td>
              <td>{u.preferredUsername ?? '(not chosen yet)'}</td>
              <td>{u.status}</td>
              {ROLES.map((role) => (
                <td key={role}>
                  <input
                    type="checkbox"
                    checked={u.groups.includes(role)}
                    onChange={() =>
                      setGroups.mutate({
                        username: u.username,
                        groups: toggle(
                          u.groups.filter((g): g is Role =>
                            (ROLES as readonly string[]).includes(g),
                          ),
                          role,
                        ),
                      })
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
