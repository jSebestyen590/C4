import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUsernameSchema } from '@c4/shared';
import { unwrap, useApi } from '../api';

export function UsernamePage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) });
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (value: string) => api.me.username.$put({ json: { username: value } }),
    onSuccess: async (res) => {
      if (res.status === 409) return setError('That username is already taken.');
      if (!res.ok) return setError('Could not save the username.');
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const parsed = setUsernameSchema.safeParse({ username });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid username');
    save.mutate(parsed.data.username);
  };

  return (
    <>
      <h1>Choose your username</h1>
      <p>
        You can sign in with this name or with your email address.
        {me.data?.preferredUsername && ` Current: ${me.data.preferredUsername}`}
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          required
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button type="submit" disabled={save.isPending}>
          Save
        </button>
      </form>
      {error && <p>{error}</p>}
    </>
  );
}
