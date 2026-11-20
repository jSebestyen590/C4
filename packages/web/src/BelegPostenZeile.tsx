import {
  ActionIcon,
  Autocomplete,
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
  type ArtikelKategorieVorschlaege,
  type BelegWareDto,
  type KontoDto,
} from '@c4/shared';
import { satzText, type PostenZeile } from './belegFormular';
import {
  artikelNamen,
  artikelPatch,
  artWechselPatch,
  kategorieOptionenMitVorschlaegen,
  kategoriePatch,
  postenFeldFehler,
  wareFilter,
  wareOptionen,
  warePatch,
} from './belegAuswahl';
import { BetragFeld } from './BetragFeld';
import { BETRAG_STIL } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { FeldLabel } from './InfoHinweis';

const SATZ_OPTIONEN = STEUERSAETZE.map((s) => ({ value: String(s), label: satzText(s) }));

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
  artikelVorschlaege = [],
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
  /** Artikel names with the Kategorien booked for them (suggestions for Kategorie items). */
  artikelVorschlaege?: ArtikelKategorieVorschlaege;
  betragCent: number;
  pfandBetragCent: number;
  versucht: boolean;
  kannEntfernen: boolean;
  onAendern: (patch: Partial<PostenZeile>) => void;
  onEntfernen: () => void;
}>) {
  const ware = waren.find((w) => w.id === p.wareId);
  const gebinde = ware?.gebinde.find((g) => g.id === p.gebindeId);
  const fehler = postenFeldFehler(p, versucht);

  return (
    <Paper withBorder p="sm" data-zeile={p.key}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="sm" fw={600}>
            Posten {index + 1}
          </Text>
          <SegmentedControl
            size="xs"
            aria-label={`Art von Posten ${index + 1}`}
            value={p.art}
            onChange={(v) => onAendern(artWechselPatch(v as BelegPostenArt))}
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
          <SimpleGrid style={{ alignItems: 'end' }} cols={{ base: 1, sm: 2 }} spacing="xs">
            <Select
              label="Ware"
              placeholder="Ware suchen"
              searchable
              selectFirstOptionOnChange
              data={wareOptionen(waren)}
              filter={wareFilter(waren)}
              value={p.wareId}
              onChange={(v) => onAendern(warePatch(waren, aufwand, v))}
              nothingFoundMessage="Keine Ware gefunden"
              error={fehler.ware}
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
              error={fehler.gebinde}
              data-nav=""
            />
          </SimpleGrid>
        )}

        <SimpleGrid style={{ alignItems: 'end' }} cols={{ base: 1, sm: 2 }} spacing="xs">
          {p.art === 'kategorie' && (
            <Autocomplete
              label={<FeldLabel text="Artikel" hilfe={HILFE.belege.artikelKategorie} />}
              placeholder="z. B. Deko"
              maxLength={100}
              data={artikelNamen(artikelVorschlaege)}
              value={p.text}
              onChange={(v) => onAendern(artikelPatch(p, aufwand, artikelVorschlaege, v))}
              error={fehler.text}
              data-nav=""
              data-kategorie=""
            />
          )}
          {p.art !== 'leergut' && (
            <Select
              label="Kategorie"
              placeholder="Kategorie suchen"
              searchable
              selectFirstOptionOnChange
              data={
                p.art === 'kategorie'
                  ? kategorieOptionenMitVorschlaegen(aufwand, artikelVorschlaege, p.text)
                  : aufwand.map((k) => ({ value: k.id, label: k.name }))
              }
              value={p.kategorieId}
              onChange={(v) => onAendern(kategoriePatch(aufwand, v))}
              nothingFoundMessage="Keine Kategorie gefunden"
              description={
                p.art === 'ware' && p.wareId && !p.kategorieId
                  ? 'Der Warengruppe ist keine Kategorie zugeordnet.'
                  : undefined
              }
              error={fehler.kategorie}
              data-nav=""
            />
          )}
          {p.art === 'leergut' && (
            <TextInput
              label="Beschreibung"
              placeholder="z. B. Pfandrückgabe Kästen"
              maxLength={200}
              value={p.text}
              onChange={(e) => onAendern({ text: e.currentTarget.value })}
              error={fehler.text}
              data-nav=""
              data-kategorie=""
            />
          )}
        </SimpleGrid>

        <SimpleGrid
          style={{ alignItems: 'end' }}
          cols={{ base: 2, sm: p.art === 'ware' ? 5 : 4 }}
          spacing="xs"
        >
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
            error={fehler.anzahl}
            styles={{ input: { textAlign: 'right' } }}
            data-nav=""
          />
          <BetragFeld
            label={`${p.art === 'ware' ? 'Preis je Gebinde' : 'Preis'} (${modus === 'netto' ? 'netto' : 'brutto'})`}
            negativ={p.art !== 'ware'}
            value={p.einzelpreisCent}
            onWert={(c) => onAendern({ einzelpreisCent: c })}
            error={fehler.preis}
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
            {...(letzte && { 'data-posten-ende': 'ware' })}
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
