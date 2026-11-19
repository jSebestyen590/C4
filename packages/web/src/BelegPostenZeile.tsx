import {
  ActionIcon,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import {
  BELEG_POSTEN_ARTEN,
  BELEG_POSTEN_ART_LABELS,
  centAnzeigen,
  STEUERSAETZE,
  type BelegPostenArt,
  type BelegWareDto,
  type KontoDto,
} from '@c4/shared';
import { anzahlLesen, satzText, steuersatzVorschlag, type PostenZeile } from './belegFormular';
import { BetragFeld } from './BetragFeld';
import { BETRAG_STIL, kontoOptionen } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { FeldLabel } from './InfoHinweis';
import { mhdAusEingabe, mhdEingabe } from './inventurDaten';
import { PfadSelect } from './PfadSelect';

const SATZ_OPTIONEN = STEUERSAETZE.map((s) => ({ value: String(s), label: satzText(s) }));

/** Remembers the last Lagerort used for Einlagern, to pre-fill the next item. */
const LAGERORT_SCHLUESSEL = 'c4.beleg.lagerort';
export const letzterLagerort = (): string | null => {
  try {
    return localStorage.getItem(LAGERORT_SCHLUESSEL);
  } catch {
    return null;
  }
};
const lagerortMerken = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LAGERORT_SCHLUESSEL, id);
  } catch {
    // Without storage the Lagerort is simply not remembered.
  }
};

/**
 * One item row of the Beleg form: kind (Kategorie, Ware, Leergut), the kind's fields and the
 * amounts. Desktop first; each input carries `data-nav` for the Enter flow of the form.
 */
export function BelegPostenZeile({
  p,
  index,
  letzte,
  modus,
  aufwand,
  waren,
  lagerOptionen,
  einlagern,
  betragCent,
  pfandBetragCent,
  versucht,
  kannEntfernen,
  onAendern,
  onEntfernen,
}: Readonly<{
  p: PostenZeile;
  index: number;
  letzte: boolean;
  modus: 'brutto' | 'netto';
  aufwand: readonly KontoDto[];
  waren: readonly BelegWareDto[];
  lagerOptionen: readonly { value: string; label: string }[];
  /** The Beleg books its Ware items into the stock: Lagerort and MHD are asked. */
  einlagern: boolean;
  betragCent: number;
  pfandBetragCent: number;
  versucht: boolean;
  kannEntfernen: boolean;
  onAendern: (patch: Partial<PostenZeile>) => void;
  onEntfernen: () => void;
}>) {
  const ware = waren.find((w) => w.id === p.wareId);
  const gebinde = ware?.gebinde.find((g) => g.id === p.gebindeId);
  const kategorieSetzen = (id: string | null) => {
    const satz = steuersatzVorschlag(aufwand.find((k) => k.id === id));
    return { kategorieId: id, ...(satz !== null && { steuersatz: satz }) };
  };
  const artWechseln = (art: BelegPostenArt) =>
    onAendern(
      art === 'leergut'
        ? { art, kategorieId: null, wareId: null, gebindeId: null, pfandCent: null }
        : art === 'kategorie'
          ? { art, wareId: null, gebindeId: null, pfandCent: null, lagerortId: null, mhd: '' }
          : { art },
    );
  const wareWaehlen = (id: string | null) => {
    const neu = waren.find((w) => w.id === id);
    const g = neu?.gebinde.length === 1 ? neu.gebinde[0] : undefined;
    onAendern({
      wareId: id,
      gebindeId: g?.id ?? null,
      pfandCent: g?.pfandGesamtCent ?? null,
      mhd: '',
      ...(neu?.kategorieId && kategorieSetzen(neu.kategorieId)),
    });
  };
  const lagerFehlt = versucht && einlagern && p.art === 'ware' && !p.lagerortId;
  const mhdNoetig = !!ware && ware.mhdArt !== 'keins';

  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="sm" fw={600}>
            Posten {index + 1}
          </Text>
          <SegmentedControl
            size="xs"
            aria-label={`Art von Posten ${index + 1}`}
            value={p.art}
            onChange={(v) => artWechseln(v as BelegPostenArt)}
            data={BELEG_POSTEN_ARTEN.map((a) => ({ value: a, label: BELEG_POSTEN_ART_LABELS[a] }))}
          />
          <ActionIcon
            variant="subtle"
            color="red"
            size={42}
            aria-label={`Posten ${index + 1} entfernen`}
            disabled={!kannEntfernen}
            onClick={onEntfernen}
          >
            <IconTrash size={20} />
          </ActionIcon>
        </Group>

        {p.art === 'ware' && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <Select
              label="Ware"
              placeholder="Ware suchen"
              searchable
              selectFirstOptionOnChange
              data={waren.map((w) => ({ value: w.id, label: w.name }))}
              value={p.wareId}
              onChange={wareWaehlen}
              nothingFoundMessage="Keine Ware gefunden"
              error={versucht && !p.wareId ? 'Bitte wähle eine Ware.' : undefined}
              data-nav=""
              data-kategorie=""
            />
            <Select
              label="Gebinde"
              placeholder={ware ? 'Gebinde wählen' : 'Erst die Ware wählen'}
              disabled={!ware}
              allowDeselect={false}
              data={(ware?.gebinde ?? []).map((g) => ({ value: g.id, label: g.bezeichnung }))}
              value={p.gebindeId}
              onChange={(v) =>
                onAendern({
                  gebindeId: v,
                  pfandCent: ware?.gebinde.find((g) => g.id === v)?.pfandGesamtCent ?? null,
                })
              }
              error={versucht && ware && !p.gebindeId ? 'Bitte wähle ein Gebinde.' : undefined}
              data-nav=""
            />
          </SimpleGrid>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {p.art !== 'leergut' && (
            <Select
              label="Kategorie"
              placeholder="Kategorie suchen"
              searchable
              selectFirstOptionOnChange
              data={kontoOptionen(aufwand)}
              value={p.kategorieId}
              onChange={(v) => onAendern(kategorieSetzen(v))}
              nothingFoundMessage="Keine Kategorie gefunden"
              description={
                p.art === 'ware' && p.wareId && !p.kategorieId
                  ? 'Der Warengruppe ist keine Kategorie zugeordnet.'
                  : undefined
              }
              error={versucht && !p.kategorieId ? 'Bitte wähle eine Kategorie.' : undefined}
              data-nav=""
              {...(p.art === 'kategorie' && { 'data-kategorie': '' })}
            />
          )}
          <TextInput
            label={p.art === 'leergut' ? 'Beschreibung' : 'Text'}
            placeholder={
              p.art === 'leergut' ? 'z. B. Pfandrückgabe Kästen' : ware ? ware.name : 'optional'
            }
            maxLength={200}
            value={p.text}
            onChange={(e) => onAendern({ text: e.currentTarget.value })}
            error={
              versucht && p.art === 'leergut' && p.text.trim() === ''
                ? 'Bitte beschreibe das Leergut.'
                : undefined
            }
            data-nav=""
            {...(p.art === 'leergut' && { 'data-kategorie': '' })}
          />
        </SimpleGrid>

        {einlagern && p.art === 'ware' && (
          <SimpleGrid cols={{ base: 1, sm: mhdNoetig ? 2 : 1 }} spacing="xs">
            <PfadSelect
              label="Lagerort (Einlagern)"
              placeholder="Lagerort wählen"
              searchable
              selectFirstOptionOnChange
              inputMode="text"
              data={[...lagerOptionen]}
              value={p.lagerortId}
              onChange={(v) => {
                lagerortMerken(v);
                onAendern({ lagerortId: v });
              }}
              nothingFoundMessage="Kein Lagerort gefunden"
              error={lagerFehlt ? 'Bitte wähle einen Lagerort.' : undefined}
              data-nav=""
            />
            {mhdNoetig && (
              <TextInput
                label="MHD"
                type={ware.mhdArt === 'monat' ? 'month' : 'date'}
                value={mhdEingabe(p.mhd || null, ware.mhdArt)}
                onChange={(e) =>
                  onAendern({ mhd: mhdAusEingabe(e.currentTarget.value, ware.mhdArt) ?? '' })
                }
                error={versucht && p.anzahl && !p.mhd ? 'Bitte gib das MHD an.' : undefined}
                styles={{ input: { minWidth: 0 } }}
                data-nav=""
              />
            )}
          </SimpleGrid>
        )}

        <SimpleGrid cols={{ base: 2, sm: p.art === 'ware' ? 5 : 4 }} spacing="xs">
          <TextInput
            label={
              <FeldLabel
                text={p.art === 'ware' ? 'Anzahl Gebinde' : 'Anzahl'}
                hilfe={HILFE.belege.anzahl}
              />
            }
            inputMode="decimal"
            autoComplete="off"
            value={p.anzahl}
            onChange={(e) => onAendern({ anzahl: e.currentTarget.value })}
            error={
              p.anzahl.trim() !== '' && anzahlLesen(p.anzahl) === null
                ? 'Ungültig, z. B. 1,5'
                : undefined
            }
            styles={{ input: { textAlign: 'right' } }}
            data-nav=""
          />
          <BetragFeld
            label={`${p.art === 'ware' ? 'Preis je Gebinde' : 'Preis'} (${modus === 'netto' ? 'netto' : 'brutto'})`}
            negativ={p.art !== 'ware'}
            value={p.einzelpreisCent}
            onWert={(c) => onAendern({ einzelpreisCent: c })}
            error={versucht && p.einzelpreisCent === null ? 'Bitte angeben.' : undefined}
            data-nav=""
          />
          {p.art === 'ware' && (
            <BetragFeld
              label={<FeldLabel text="Pfand je Gebinde" hilfe={HILFE.belege.pfand} />}
              placeholder={gebinde ? 'kein Pfand' : undefined}
              value={p.pfandCent}
              onWert={(c) => onAendern({ pfandCent: c })}
              data-nav=""
            />
          )}
          <Select
            label={<FeldLabel text="Steuersatz" hilfe={HILFE.belege.steuersatz} />}
            allowDeselect={false}
            data={SATZ_OPTIONEN}
            value={String(p.steuersatz)}
            onChange={(v) => v && onAendern({ steuersatz: Number(v) })}
            data-nav=""
            {...(letzte && { 'data-posten-ende': '' })}
          />
          <Stack gap={2} justify="flex-end">
            <Text size="sm" fw={500}>
              Betrag
            </Text>
            <Text style={{ ...BETRAG_STIL, minHeight: 42, lineHeight: '42px' }} fw={600}>
              {centAnzeigen(betragCent + pfandBetragCent)}
              {pfandBetragCent !== 0 && (
                <Text span size="xs" c="dimmed" display="block" lh={1.2}>
                  davon Pfand {centAnzeigen(pfandBetragCent)}
                </Text>
              )}
            </Text>
          </Stack>
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
