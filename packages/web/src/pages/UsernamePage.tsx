import { Button, Stack, Text, TextInput, Title } from '@mantine/core';
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
      if (res.status === 409) return setError('Dieser Benutzername ist bereits vergeben.');
      if (!res.ok) return setError('Der Benutzername konnte nicht gespeichert werden.');
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const parsed = setUsernameSchema.safeParse({ username });
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? 'Ungültiger Benutzername');
    save.mutate(parsed.data.username);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack maw={420}>
        <Title order={2}>Benutzernamen wählen</Title>
        <Text>
          Du kannst dich mit diesem Namen oder mit deiner E-Mail-Adresse anmelden.
          {me.data?.preferredUsername && ` Aktuell: ${me.data.preferredUsername}`}
        </Text>
        <TextInput
          required
          label="Benutzername"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          error={error}
        />
        <Button type="submit" loading={save.isPending} fullWidth>
          Speichern
        </Button>
      </Stack>
    </form>
  );
}
