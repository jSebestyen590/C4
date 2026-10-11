import { Alert, Button, Chip, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import {
  createUserSchema,
  MITGLIED_STATI,
  ROLES,
  type MitgliedStatus,
  type Role,
} from '@c4/shared';
import { unwrap, useApi } from './api';
import { label, MITGLIED_STATUS_LABELS, ROLE_LABELS } from './i18n';

/** Button plus dialog to invite a new member by email. */
export function MitgliedEinladen() {
  const api = useApi();
  const qc = useQueryClient();
  const [offen, { open, close }] = useDisclosure(false);
  const [email, setEmail] = useState('');
  const [rollen, setRollen] = useState<Role[]>(['reader']);
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [status, setStatus] = useState<MitgliedStatus>('anwaerter');
  const [emailFehler, setEmailFehler] = useState<string | null>(null);

  const anlegen = useMutation({
    mutationFn: async (input: {
      email: string;
      groups: Role[];
      vorname?: string;
      nachname?: string;
      status: MitgliedStatus;
    }) => unwrap(await api.admin.users.$post({ json: input })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mitglieder'] });
      setEmail('');
      setVorname('');
      setNachname('');
      setStatus('anwaerter');
      setRollen(['reader']);
      close();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return setEmailFehler('Bitte gib eine E-Mail-Adresse ein.');
    if (!createUserSchema.shape.email.safeParse(trimmed).success)
      return setEmailFehler('Das ist keine gültige E-Mail-Adresse.');
    setEmailFehler(null);
    anlegen.mutate({
      email: trimmed,
      groups: rollen,
      vorname: vorname.trim() || undefined,
      nachname: nachname.trim() || undefined,
      status,
    });
  };

  return (
    <>
      <Button onClick={open} fullWidth={false}>
        Mitglied einladen
      </Button>
      <Modal opened={offen} onClose={close} title="Mitglied einladen" fullScreen={false}>
        <form onSubmit={onSubmit} noValidate>
          <Stack>
            <TextInput
              type="email"
              required
              label="E-Mail-Adresse"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              error={emailFehler}
            />
            <TextInput
              label="Vorname (optional)"
              value={vorname}
              onChange={(e) => setVorname(e.currentTarget.value)}
            />
            <TextInput
              label="Nachname (optional)"
              value={nachname}
              onChange={(e) => setNachname(e.currentTarget.value)}
            />
            <Select
              label="Status"
              data={MITGLIED_STATI.map((s) => ({
                value: s,
                label: label(MITGLIED_STATUS_LABELS, s),
              }))}
              value={status}
              allowDeselect={false}
              onChange={(v) => v && setStatus(v as MitgliedStatus)}
            />
            <Chip.Group multiple value={rollen} onChange={(v) => setRollen(v as Role[])}>
              <Group gap="xs">
                {ROLES.map((role) => (
                  <Chip key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            {anlegen.isError && (
              <Alert color="red">Das Mitglied konnte nicht angelegt werden.</Alert>
            )}
            <Button type="submit" loading={anlegen.isPending} fullWidth>
              Einladen
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
