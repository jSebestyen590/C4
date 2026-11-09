import { Group, SegmentedControl, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { heuteBerlin, tagNachher, type ZeitfensterDto } from '@c4/shared';
import { DatumFeld } from './DatumFeld';

/** Form state of a time window: a day, optionally from/to times, and a note. */
export interface ZeitfensterWerte {
  datum: string;
  ganzerTag: boolean;
  ab: string;
  bis: string;
  notiz: string;
}

export const leeresZeitfenster = (): ZeitfensterWerte => ({
  datum: heuteBerlin(),
  ganzerTag: true,
  ab: '',
  bis: '',
  notiz: '',
});

export const zeitfensterWerte = (z: ZeitfensterDto): ZeitfensterWerte => ({
  datum: z.datum,
  ganzerTag: !z.ab && !z.bis,
  ab: z.ab ?? '',
  bis: z.bis ?? '',
  notiz: z.notiz ?? '',
});

/** The fields the API expects (`datum`, `ab`, `bis`, `notiz`). */
export const zeitfensterBody = (w: ZeitfensterWerte) => ({
  datum: w.datum,
  ab: w.ganzerTag || !w.ab ? null : w.ab,
  bis: w.ganzerTag || !w.bis ? null : w.bis,
  notiz: w.notiz.trim() || null,
});

type Tag = 'heute' | 'morgen' | 'anders';

/** Day chips (Heute / Morgen / Anderer Tag), "Ganzer Tag" or ab/bis times, and a note. */
export function ZeitfensterFelder({
  werte,
  onChange,
  notizLabel = 'Notiz (optional)',
  fehler,
}: Readonly<{
  werte: ZeitfensterWerte;
  onChange: (werte: ZeitfensterWerte) => void;
  notizLabel?: string;
  fehler?: { datum?: string; bis?: string };
}>) {
  const heute = heuteBerlin();
  const morgen = tagNachher(heute, 1);
  const [tag, setTag] = useState<Tag>(
    werte.datum === heute ? 'heute' : werte.datum === morgen ? 'morgen' : 'anders',
  );
  const setze = (teil: Partial<ZeitfensterWerte>) => onChange({ ...werte, ...teil });

  return (
    <Stack gap="sm">
      <SegmentedControl
        fullWidth
        size="md"
        value={tag}
        onChange={(v) => {
          setTag(v as Tag);
          if (v === 'heute') setze({ datum: heute });
          else if (v === 'morgen') setze({ datum: morgen });
        }}
        data={[
          { value: 'heute', label: 'Heute' },
          { value: 'morgen', label: 'Morgen' },
          { value: 'anders', label: 'Anderer Tag' },
        ]}
      />
      {tag === 'anders' && (
        <DatumFeld
          size="md"
          label="Tag"
          min={heute}
          loeschbar={false}
          value={werte.datum}
          onWert={(datum) => setze({ datum })}
          error={fehler?.datum}
        />
      )}
      <Switch
        size="md"
        label="Ganzer Tag"
        checked={werte.ganzerTag}
        onChange={(e) => setze({ ganzerTag: e.currentTarget.checked })}
      />
      {!werte.ganzerTag && (
        <Group gap="xs" align="flex-start" wrap="nowrap" grow>
          <TextInput
            size="md"
            label="Ab"
            type="time"
            value={werte.ab}
            onChange={(e) => setze({ ab: e.currentTarget.value })}
            style={{ minWidth: 0 }}
          />
          <TextInput
            size="md"
            label="Bis"
            type="time"
            value={werte.bis}
            error={fehler?.bis}
            onChange={(e) => setze({ bis: e.currentTarget.value })}
            style={{ minWidth: 0 }}
          />
        </Group>
      )}
      <Textarea
        size="md"
        label={notizLabel}
        autosize
        minRows={2}
        maxRows={6}
        maxLength={500}
        value={werte.notiz}
        onChange={(e) => setze({ notiz: e.currentTarget.value })}
      />
    </Stack>
  );
}
