import { Alert, Select, Stack, Text, type ComboboxItem, type OptionsFilter } from '@mantine/core';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Mitglied,
  RechnungEmpfaenger,
  RechnungEmpfaengerAnzeigeDto,
  RechnungsempfaengerDto,
} from '@c4/shared';
import { blurWaehltMarkierte, enterWaehltErsteOption } from './belegAuswahl';
import { HILFE } from './finanzenHilfe';
import { FeldLabel } from './InfoHinweis';
import { mitgliedLink, mitgliedName } from './mitglied';
import { mitgliedOptionen } from './organisator';
import { RechnungsempfaengerDialog } from './RechnungsempfaengerDialog';
import { StatusName } from './StatusAnzeige';

const NEU = '__neu__';
const neuLabel = (suche: string) => `„${suche.trim()}“ als neuen Empfänger anlegen`;

/** `m:<sub>` / `e:<id>` <-> the draft's recipient. */
export const empfaengerWert = (e: RechnungEmpfaenger | null): string | null =>
  e === null ? null : e.typ === 'mitglied' ? `m:${e.sub}` : `e:${e.id}`;
const wertEmpfaenger = (v: string): RechnungEmpfaenger | null =>
  v.startsWith('m:')
    ? { typ: 'mitglied', sub: v.slice(2) }
    : v.startsWith('e:')
      ? { typ: 'extern', id: v.slice(2) }
      : null;

type Gruppe = { group: string; items: ComboboxItem[] };

/** Name contains the search text; empty groups vanish, "X als neuen Empfänger anlegen" is last. */
const empfaengerFilter: OptionsFilter = ({ options, search }) => {
  const q = search.trim().toLowerCase();
  const gruppen = options as unknown as (Gruppe | ComboboxItem)[];
  const alleLabels = gruppen.flatMap((g) => ('items' in g ? g.items : [g]));
  const vorhanden = alleLabels.some((o) => o.value !== NEU && o.label.toLowerCase() === q);
  return gruppen.flatMap((g): (Gruppe | ComboboxItem)[] => {
    if ('items' in g) {
      const items = g.items.filter((o) => o.label.toLowerCase().includes(q));
      return items.length > 0 ? [{ ...g, items }] : [];
    }
    if (g.value === NEU) return q && !vorhanden ? [{ ...g, label: neuLabel(search) }] : [];
    return [];
  }) as unknown as ComboboxItem[];
};

/**
 * Searchable recipient select: members (shown by username) and external recipients in two groups,
 * plus "„X“ als neuen Empfänger anlegen" that opens the form with the typed name. Below it the
 * address as it will be printed; a member without an address is flagged.
 */
export function RechnungEmpfaengerFeld({
  wert,
  mitglieder,
  extern,
  anzeige,
  fehler,
  autoFocus,
  onWert,
}: Readonly<{
  wert: RechnungEmpfaenger | null;
  mitglieder: readonly Pick<
    Mitglied,
    'sub' | 'username' | 'vorname' | 'nachname' | 'email' | 'status' | 'deaktiviert'
  >[];
  extern: readonly RechnungsempfaengerDto[];
  /** The server's view of the saved recipient (address, missing address); null while not saved yet. */
  anzeige: RechnungEmpfaengerAnzeigeDto | null;
  fehler?: string;
  autoFocus?: boolean;
  onWert: (e: RechnungEmpfaenger | null) => void;
}>) {
  const [suche, setSuche] = useState('');
  const [neuerName, setNeuerName] = useState<string | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);
  const aktuell = empfaengerWert(wert);
  const mitgliedOpt = mitgliedOptionen(
    mitglieder.filter((m) => !m.deaktiviert || `m:${m.sub}` === aktuell),
  ).map((o) => ({ value: `m:${o.value}`, label: o.label }));
  const externOpt = extern
    .filter((e) => !e.archiviert || `e:${e.id}` === aktuell)
    .map((e) => ({ value: `e:${e.id}`, label: e.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  const daten = [
    { group: 'Mitglieder', items: mitgliedOpt },
    { group: 'Extern', items: externOpt },
    { value: NEU, label: neuLabel('') },
  ] as unknown as ComboboxItem[];

  const m = wert?.typ === 'mitglied' ? mitglieder.find((x) => x.sub === wert.sub) : undefined;
  const e = wert?.typ === 'extern' ? extern.find((x) => x.id === wert.id) : undefined;
  const anschrift = e ? e.anschrift : (anzeige?.anschrift ?? null);

  return (
    <Stack gap="xs">
      <Select
        ref={eingabe}
        label={<FeldLabel text="Empfänger" hilfe={HILFE.rechnungen.empfaenger} />}
        placeholder="Mitglied oder externen Empfänger suchen"
        searchable
        allowDeselect={false}
        autoFocus={autoFocus}
        onKeyDownCapture={enterWaehltErsteOption}
        onBlurCapture={blurWaehltMarkierte}
        onFocus={(ev) => ev.currentTarget.select()}
        selectFirstOptionOnChange
        data={daten}
        filter={empfaengerFilter}
        searchValue={suche}
        onSearchChange={setSuche}
        value={aktuell}
        onChange={(v) => {
          if (v === NEU) {
            // Only when picked on purpose (the input has the focus), never when the field is just left.
            if (document.activeElement === eingabe.current && suche.trim())
              setNeuerName(suche.replace(/^„|“ als neuen Empfänger anlegen$/g, '').trim());
            return;
          }
          if (v) onWert(wertEmpfaenger(v));
        }}
        nothingFoundMessage="Niemanden gefunden, tippe einen Namen zum Anlegen"
        error={fehler}
        data-nav=""
      />
      {wert && (
        <Stack gap={0}>
          {m && (
            <Text size="sm">
              <StatusName status={m.status}>{mitgliedName(m)}</StatusName>
              {`${m.vorname} ${m.nachname}`.trim() && (
                <Text span size="sm" c="dimmed">
                  {' · '}
                  {`${m.vorname} ${m.nachname}`.trim()}
                </Text>
              )}
            </Text>
          )}
          {e && (
            <Text size="sm" fw={600}>
              {e.name}
            </Text>
          )}
          {anschrift && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>
              {anschrift}
            </Text>
          )}
        </Stack>
      )}
      {anzeige?.adresseFehlt && m && (
        <Alert color="red" py="xs">
          Für{' '}
          <Text span fw={600} component={Link} to={mitgliedLink(m)} inherit>
            {mitgliedName(m)}
          </Text>{' '}
          ist im Profil keine Adresse hinterlegt. Ohne Adresse lässt sich die Rechnung nicht
          stellen.
        </Alert>
      )}
      {neuerName !== null && (
        <RechnungsempfaengerDialog
          name={neuerName}
          onGespeichert={(id) => onWert({ typ: 'extern', id })}
          onClose={() => {
            setNeuerName(null);
            setSuche('');
          }}
        />
      )}
    </Stack>
  );
}
