import { Stack, Text, Textarea, TextInput } from '@mantine/core';
import type { Posten } from '@c4/shared';

/** Editable fields of a Posten; empty strings stand for "not set". */
export interface PostenWerte {
  name: string;
  beschreibung: string;
  bezeichnungMaennlich: string;
  bezeichnungWeiblich: string;
  bezeichnungNeutral: string;
}

export const leerePostenWerte: PostenWerte = {
  name: '',
  beschreibung: '',
  bezeichnungMaennlich: '',
  bezeichnungWeiblich: '',
  bezeichnungNeutral: '',
};

export const postenWerte = (p: Posten): PostenWerte => ({
  name: p.name,
  beschreibung: p.beschreibung ?? '',
  bezeichnungMaennlich: p.bezeichnungMaennlich ?? '',
  bezeichnungWeiblich: p.bezeichnungWeiblich ?? '',
  bezeichnungNeutral: p.bezeichnungNeutral ?? '',
});

/** Form fields shared by the "create" and the "edit" dialog. */
export function PostenFelder({
  werte,
  onChange,
  fehler,
}: Readonly<{
  werte: PostenWerte;
  onChange: (werte: PostenWerte) => void;
  fehler: string | null;
}>) {
  const feld = (key: keyof PostenWerte) => ({
    value: werte[key],
    onChange: (e: { currentTarget: { value: string } }) =>
      onChange({ ...werte, [key]: e.currentTarget.value }),
  });
  return (
    <Stack>
      <TextInput label="Name" {...feld('name')} data-autofocus />
      <Textarea label="Beschreibung" autosize minRows={3} {...feld('beschreibung')} />
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          Bezeichnung der Person, die den Posten innehat (alle drei Formen oder keine)
        </Text>
        <TextInput label="Männlich" placeholder="z. B. Chef" {...feld('bezeichnungMaennlich')} />
        <TextInput label="Weiblich" placeholder="z. B. Chefin" {...feld('bezeichnungWeiblich')} />
        <TextInput
          label="Neutral"
          placeholder="z. B. Chef:in"
          {...feld('bezeichnungNeutral')}
          error={fehler}
        />
      </Stack>
    </Stack>
  );
}
