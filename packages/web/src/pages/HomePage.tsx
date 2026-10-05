import { useQuery } from '@tanstack/react-query';
import { unwrap, useApi } from '../api';

export function HomePage() {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.health.$get()).json(),
  });
  return (
    <>
      <h1>C4</h1>
      <p>API / DB status: {health.data ? `${health.data.status} / db ${health.data.db}` : '…'}</p>
      {me.isError && <p>Could not load profile.</p>}
      {me.data && (
        <ul>
          <li>User: {me.data.preferredUsername ?? me.data.sub}</li>
          <li>Groups: {me.data.groups.join(', ') || '—'}</li>
          <li>Permissions: {me.data.permissions.join(', ') || '—'}</li>
        </ul>
      )}
    </>
  );
}
