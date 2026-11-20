import {
  Input,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
  TextInput,
} from '@mantine/core';
import { useMemo } from 'react';
import {
  gebindeBezeichnung,
  gebindeErgaenzen,
  gebindeSortieren,
  MHD_ARTEN,
  pfad,
  type BaumKnoten,
  type Gebinde,
  type MhdArt,
} from '@c4/shared';
import { HILFE } from './finanzenHilfe';
import { MHD_ART_LABELS } from './i18n';
import { FeldLabel } from './InfoHinweis';

/** Editable fields of a Ware; `warengruppeId` is null until one is chosen. */
export interface WareWerte {
  name: string;
  warengruppeId: string | null;
  mhdArt: MhdArt;
  gebindeIds: string[];
  aliase: string[];
  /** Gebinde preselected in Belege; required, one of `gebindeIds`. Null only while nothing is chosen. */
  standardGebindeId: string | null;
}

export const leereWareWerte: WareWerte = {
  name: '',
  warengruppeId: null,
  mhdArt: 'keins',
  gebindeIds: [],
  aliase: [],
  standardGebindeId: null,
};

export const wareWerte = (w: {
  name: string;
  warengruppeId: string;
  mhdArt: MhdArt;
  gebindeIds: string[];
  aliase: string[];
  standardGebindeId?: string | null;
}): WareWerte => ({
  name: w.name,
  warengruppeId: w.warengruppeId,
  mhdArt: w.mhdArt,
  gebindeIds: [...w.gebindeIds],
  aliase: [...w.aliase],
  standardGebindeId: w.standardGebindeId ?? null,
});

type WarengruppeOption = BaumKnoten & { archiviert?: boolean };
type GebindeOption = Gebinde & { archiviert?: boolean };

/** Form fields shared by the "create" and the "edit" dialog of a Ware. */
export function WareFelder({
  werte,
  onChange,
  fehler,
  aliasFehler = null,
  standardFehler = null,
  warengruppen,
  gebinde,
}: Readonly<{
  werte: WareWerte;
  onChange: (werte: WareWerte) => void;
  /** Validation message shown below the name. */
  fehler: string | null;
  /** Message shown below the Aliase. */
  aliasFehler?: string | null;
  /** Message shown below the Standard-Gebinde. */
  standardFehler?: string | null;
  warengruppen: WarengruppeOption[];
  gebinde: GebindeOption[];
}>) {
  // Archived entries stay selectable only while the Ware already uses them.
  const gruppenDaten = useMemo(
    () =>
      warengruppen
        .filter((g) => !g.archiviert || g.id === werte.warengruppeId)
        .map((g) => ({ value: g.id, label: pfad(warengruppen, g.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [warengruppen, werte.warengruppeId],
  );
  const gebindeDaten = useMemo(() => {
    return gebindeSortieren(
      gebinde.filter((g) => !g.archiviert || werte.gebindeIds.includes(g.id)),
      gebinde,
    ).map((g) => ({ value: g.id, label: gebindeBezeichnung(g, gebinde) }));
  }, [gebinde, werte.gebindeIds]);

  return (
    <Stack>
      <TextInput
        label="Name"
        value={werte.name}
        onChange={(e) => onChange({ ...werte, name: e.currentTarget.value })}
        error={fehler}
        data-autofocus
      />
      <Select
        label="Warengruppe"
        placeholder="Warengruppe wählen"
        searchable
        inputMode="text"
        nothingFoundMessage="Keine Warengruppe gefunden"
        data={gruppenDaten}
        value={werte.warengruppeId}
        onChange={(warengruppeId) => onChange({ ...werte, warengruppeId })}
      />
      <Input.Wrapper label="Mindesthaltbarkeit (MHD)">
        <SegmentedControl
          fullWidth
          size="lg"
          data={MHD_ARTEN.map((a) => ({ value: a, label: MHD_ART_LABELS[a] }))}
          value={werte.mhdArt}
          onChange={(v) => onChange({ ...werte, mhdArt: v as MhdArt })}
        />
      </Input.Wrapper>
      <MultiSelect
        label="Gebinde"
        description="Mit einem Obergebinde wird sein Untergebinde automatisch mit ausgewählt."
        placeholder={werte.gebindeIds.length === 0 ? 'Gebinde wählen' : undefined}
        data={gebindeDaten}
        value={werte.gebindeIds}
        onChange={(ids) => {
          const gebindeIds = gebindeErgaenzen(ids, gebinde);
          onChange({
            ...werte,
            gebindeIds,
            // The Standard-Gebinde is required: keep it, else preselect the first selected one.
            standardGebindeId:
              werte.standardGebindeId !== null && gebindeIds.includes(werte.standardGebindeId)
                ? werte.standardGebindeId
                : (gebindeIds[0] ?? null),
          });
        }}
        nothingFoundMessage="Kein Gebinde gefunden"
      />
      <Select
        label={<FeldLabel text="Standard-Gebinde" hilfe={HILFE.waren.standardGebinde} />}
        description="Wird beim Erfassen eines Belegs vorausgewählt."
        placeholder="Standard-Gebinde wählen"
        required
        allowDeselect={false}
        error={standardFehler}
        disabled={werte.gebindeIds.length === 0}
        data={gebindeDaten.filter((g) => werte.gebindeIds.includes(g.value))}
        value={werte.standardGebindeId}
        onChange={(standardGebindeId) => onChange({ ...werte, standardGebindeId })}
      />
      <TagsInput
        label="Aliase"
        description="Weitere Namen, unter denen die Ware gefunden wird."
        placeholder="Alias eingeben und bestätigen"
        splitChars={[',']}
        value={werte.aliase}
        error={aliasFehler}
        onChange={(aliase) => onChange({ ...werte, aliase })}
      />
    </Stack>
  );
}
