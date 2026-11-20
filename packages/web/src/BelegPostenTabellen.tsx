import {
  ActionIcon,
  Autocomplete,
  Button,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
  centAnzeigen,
  STEUERSAETZE,
  type ArtikelKategorieVorschlaege,
  type BelegPostenArt,
  type BelegWareDto,
  type KontoDto,
} from '@c4/shared';
import { POSTEN_REIHENFOLGE, satzText, type PostenZeile } from './belegFormular';
import {
  artikelNamen,
  artikelPatch,
  kategorieOptionenMitVorschlaegen,
  kategoriePatch,
  postenFeldFehler,
  wareFilter,
  wareOptionen,
  warePatch,
} from './belegAuswahl';
import { BetragFeld } from './BetragFeld';
import { BETRAG_STIL } from './finanzenDaten';

const SATZ_OPTIONEN = STEUERSAETZE.map((s) => ({ value: String(s), label: satzText(s) }));

const TITEL: Record<BelegPostenArt, string> = {
  ware: 'Waren',
  kategorie: 'Kategorien',
  leergut: 'Leergut',
};

/** Column header text and width (percent of the table) per kind. */
const SPALTEN: Record<BelegPostenArt, readonly { name: string; breite: string; rechts?: true }[]> =
  {
    ware: [
      { name: 'Ware', breite: '20%' },
      { name: 'Gebinde', breite: '12%' },
      { name: 'Anzahl', breite: '7%', rechts: true },
      { name: 'Preis je Gebinde', breite: '11%', rechts: true },
      { name: 'Pfand je Gebinde', breite: '11%', rechts: true },
      { name: 'Steuersatz', breite: '8%' },
      { name: 'Kategorie', breite: '18%' },
      { name: 'Betrag', breite: '9%', rechts: true },
    ],
    kategorie: [
      { name: 'Artikel', breite: '24%' },
      { name: 'Kategorie', breite: '24%' },
      { name: 'Anzahl', breite: '9%', rechts: true },
      { name: 'Einzelpreis', breite: '14%', rechts: true },
      { name: 'Steuersatz', breite: '10%' },
      { name: 'Betrag', breite: '12%', rechts: true },
    ],
    leergut: [
      { name: 'Beschreibung', breite: '40%' },
      { name: 'Anzahl', breite: '12%', rechts: true },
      { name: 'Preis', breite: '18%', rechts: true },
      { name: 'Steuersatz', breite: '12%' },
      { name: 'Betrag', breite: '14%', rechts: true },
    ],
  };

interface Gemeinsam {
  modus: 'brutto' | 'netto';
  aufwand: readonly KontoDto[];
  waren: readonly BelegWareDto[];
  artikelVorschlaege: ArtikelKategorieVorschlaege;
  versucht: boolean;
  kannEntfernen: boolean;
}

/** Tooltip-free hint of a row in the message list under the table. */
const FELD_NAMEN: Record<string, string> = {
  ware: 'Ware',
  gebinde: 'Gebinde',
  kategorie: 'Kategorie',
  text: '',
  anzahl: 'Anzahl',
  preis: 'Preis',
};

/**
 * The three item tables of the Finanzer:in form (Waren, Kategorien, Leergut), one below the other.
 * `posten` is the whole (grouped) list, so the row numbers match the "Posten N" messages. Every
 * input carries `data-nav`; the last input of the last row of a table carries
 * `data-posten-ende="<art>"` (the form then adds a row to that table on Enter), every row `data-zeile`.
 */
export function BelegPostenTabellen({
  posten,
  betraege,
  pfandBetraege,
  onAendern,
  onEntfernen,
  onHinzu,
  ...gemeinsam
}: Readonly<
  Gemeinsam & {
    posten: readonly PostenZeile[];
    betraege: readonly number[];
    pfandBetraege: readonly number[];
    onAendern: (key: string, patch: Partial<PostenZeile>) => void;
    onEntfernen: (key: string) => void;
    onHinzu: (art: BelegPostenArt) => void;
  }
>) {
  return (
    <Stack gap="lg">
      {POSTEN_REIHENFOLGE.map((art) => (
        <BelegPostenTabelle
          key={art}
          art={art}
          zeilen={posten
            .map((p, index) => ({ p, index }))
            .filter((z) => z.p.art === art)
            .map((z) => ({
              ...z,
              betragCent: (betraege[z.index] ?? 0) + (pfandBetraege[z.index] ?? 0),
              pfandBetragCent: pfandBetraege[z.index] ?? 0,
            }))}
          onAendern={onAendern}
          onEntfernen={onEntfernen}
          onHinzu={() => onHinzu(art)}
          {...gemeinsam}
        />
      ))}
    </Stack>
  );
}

interface Zeile {
  p: PostenZeile;
  /** Position in the whole item list (0-based). */
  index: number;
  betragCent: number;
  pfandBetragCent: number;
}

/** One table of one kind with its "Zeile hinzufügen". */
export function BelegPostenTabelle({
  art,
  zeilen,
  modus,
  aufwand,
  waren,
  artikelVorschlaege,
  versucht,
  kannEntfernen,
  onAendern,
  onEntfernen,
  onHinzu,
}: Readonly<
  Gemeinsam & {
    art: BelegPostenArt;
    zeilen: readonly Zeile[];
    onAendern: (key: string, patch: Partial<PostenZeile>) => void;
    onEntfernen: (key: string) => void;
    onHinzu: () => void;
  }
>) {
  const spalten = SPALTEN[art];
  const preisLabel = `${modus === 'netto' ? 'netto' : 'brutto'}`;
  const meldungen = versucht
    ? zeilen.flatMap(({ p, index }) =>
        Object.entries(postenFeldFehler(p, true)).map(
          ([feld, text]) =>
            `Posten ${index + 1}: ${[FELD_NAMEN[feld], text].filter(Boolean).join(': ')}`,
        ),
      )
    : [];

  return (
    <Stack gap="xs" data-tabelle={art}>
      <Title order={4} size="h5">
        {TITEL[art]}
      </Title>
      {zeilen.length > 0 && (
        <Table.ScrollContainer minWidth={art === 'ware' ? 980 : 760}>
          <Table verticalSpacing={4} horizontalSpacing={4} style={{ tableLayout: 'fixed' }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36} aria-label="Nummer">
                  Nr.
                </Table.Th>
                {spalten.map((s) => (
                  <Table.Th
                    key={s.name}
                    w={s.breite}
                    style={s.rechts ? { textAlign: 'right' } : undefined}
                  >
                    {s.name}
                    {(s.name.startsWith('Preis') || s.name === 'Einzelpreis') && ` (${preisLabel})`}
                  </Table.Th>
                ))}
                <Table.Th w={44} aria-label="Entfernen" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {zeilen.map((z, i) => (
                <PostenTabellenZeile
                  key={z.p.key}
                  z={z}
                  letzte={i === zeilen.length - 1}
                  aufwand={aufwand}
                  waren={waren}
                  artikelVorschlaege={artikelVorschlaege}
                  versucht={versucht}
                  kannEntfernen={kannEntfernen}
                  onAendern={(patch) => onAendern(z.p.key, patch)}
                  onEntfernen={() => onEntfernen(z.p.key)}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {meldungen.length > 0 && (
        <Stack gap={0}>
          {meldungen.map((m) => (
            <Text key={m} size="sm" c="red">
              {m}
            </Text>
          ))}
        </Stack>
      )}
      <div>
        <Button
          variant="light"
          size="compact-md"
          leftSection={<IconPlus size={16} />}
          onClick={onHinzu}
        >
          Zeile hinzufügen
        </Button>
      </div>
    </Stack>
  );
}

function PostenTabellenZeile({
  z: { p, index, betragCent, pfandBetragCent },
  letzte,
  aufwand,
  waren,
  artikelVorschlaege,
  versucht,
  kannEntfernen,
  onAendern,
  onEntfernen,
}: Readonly<{
  z: Zeile;
  letzte: boolean;
  aufwand: readonly KontoDto[];
  waren: readonly BelegWareDto[];
  artikelVorschlaege: ArtikelKategorieVorschlaege;
  versucht: boolean;
  kannEntfernen: boolean;
  onAendern: (patch: Partial<PostenZeile>) => void;
  onEntfernen: () => void;
}>) {
  const ware = waren.find((w) => w.id === p.wareId);
  const gebinde = ware?.gebinde.find((g) => g.id === p.gebindeId);
  const fehler = postenFeldFehler(p, versucht);
  const nr = index + 1;
  // Red border only; the messages stand below the table.
  const rot = (meldung: string | undefined) => (meldung ? true : undefined);
  const dropdown = { width: 280, position: 'bottom-start' as const };
  // The last input of the row (Kategorie for Waren, else Steuersatz) ends the table on Enter.
  const ende = (letztes: boolean) => (letzte && letztes ? { 'data-posten-ende': p.art } : {});

  const anzahl = (
    <Table.Td>
      <TextInput
        size="sm"
        aria-label={`Anzahl${p.art === 'ware' ? ' Gebinde' : ''}, Posten ${nr}`}
        inputMode="decimal"
        autoComplete="off"
        value={p.anzahl}
        onChange={(e) => onAendern({ anzahl: e.currentTarget.value })}
        error={rot(fehler.anzahl)}
        styles={{ input: { textAlign: 'right' } }}
        data-nav=""
      />
    </Table.Td>
  );
  const preis = (
    <Table.Td>
      <BetragFeld
        size="sm"
        aria-label={`${p.art === 'ware' ? 'Preis je Gebinde' : 'Preis'}, Posten ${nr}`}
        negativ={p.art !== 'ware'}
        value={p.einzelpreisCent}
        onWert={(c) => onAendern({ einzelpreisCent: c })}
        error={rot(fehler.preis)}
        data-nav=""
      />
    </Table.Td>
  );
  const steuersatz = (
    <Table.Td>
      <Select
        size="sm"
        aria-label={`Steuersatz, Posten ${nr}`}
        allowDeselect={false}
        data={SATZ_OPTIONEN}
        value={String(p.steuersatz)}
        onChange={(v) => v && onAendern({ steuersatz: Number(v) })}
        comboboxProps={{ width: 100 }}
        data-nav=""
        {...ende(p.art !== 'ware')}
      />
    </Table.Td>
  );
  const betrag = (
    <Table.Td style={BETRAG_STIL}>
      <Text fw={600} size="sm">
        {centAnzeigen(betragCent)}
      </Text>
      {pfandBetragCent !== 0 && (
        <Text size="xs" c="dimmed" lh={1.2}>
          davon Pfand {centAnzeigen(pfandBetragCent)}
        </Text>
      )}
    </Table.Td>
  );
  const kategorieZelle = (artikel: boolean) => (
    <Table.Td>
      <Select
        size="sm"
        aria-label={`Kategorie, Posten ${nr}`}
        placeholder="Kategorie suchen"
        searchable
        onFocus={(e) => e.currentTarget.select()}
        selectFirstOptionOnChange
        allowDeselect={false}
        data={
          artikel
            ? kategorieOptionenMitVorschlaegen(aufwand, artikelVorschlaege, p.text)
            : aufwand.map((k) => ({ value: k.id, label: k.name }))
        }
        value={p.kategorieId}
        onChange={(v) => onAendern(kategoriePatch(aufwand, v))}
        nothingFoundMessage="Keine Kategorie gefunden"
        comboboxProps={dropdown}
        error={rot(fehler.kategorie)}
        data-nav=""
        {...ende(!artikel)}
      />
    </Table.Td>
  );

  return (
    <Table.Tr data-zeile={p.key}>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {nr}
        </Text>
      </Table.Td>
      {p.art === 'ware' && (
        <>
          <Table.Td>
            <Select
              size="sm"
              aria-label={`Ware, Posten ${nr}`}
              placeholder="Ware suchen"
              searchable
              onFocus={(e) => e.currentTarget.select()}
              selectFirstOptionOnChange
              data={wareOptionen(waren)}
              filter={wareFilter(waren)}
              value={p.wareId}
              onChange={(v) => onAendern(warePatch(waren, aufwand, v))}
              nothingFoundMessage="Keine Ware gefunden"
              comboboxProps={dropdown}
              error={rot(fehler.ware)}
              data-nav=""
            />
          </Table.Td>
          <Table.Td>
            <Select
              size="sm"
              aria-label={`Gebinde, Posten ${nr}`}
              placeholder={ware ? 'Gebinde' : 'Erst Ware'}
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
              comboboxProps={{ width: 200 }}
              error={rot(fehler.gebinde)}
              data-nav=""
            />
          </Table.Td>
          {anzahl}
          {preis}
          <Table.Td>
            <BetragFeld
              size="sm"
              aria-label={`Pfand je Gebinde, Posten ${nr}`}
              placeholder={gebinde ? 'kein Pfand' : undefined}
              value={p.pfandCent}
              onWert={(c) => onAendern({ pfandCent: c })}
              data-nav=""
            />
          </Table.Td>
          {steuersatz}
          {kategorieZelle(false)}
          {betrag}
        </>
      )}
      {p.art === 'kategorie' && (
        <>
          <Table.Td>
            <Autocomplete
              size="sm"
              aria-label={`Artikel, Posten ${nr}`}
              placeholder="z. B. Deko"
              maxLength={100}
              data={artikelNamen(artikelVorschlaege)}
              value={p.text}
              onChange={(v) => onAendern(artikelPatch(p, aufwand, artikelVorschlaege, v))}
              error={rot(fehler.text)}
              data-nav=""
            />
          </Table.Td>
          {kategorieZelle(true)}
          {anzahl}
          {preis}
          {steuersatz}
          {betrag}
        </>
      )}
      {p.art === 'leergut' && (
        <>
          <Table.Td>
            <TextInput
              size="sm"
              aria-label={`Beschreibung, Posten ${nr}`}
              placeholder="z. B. Pfandrückgabe Kästen"
              maxLength={200}
              value={p.text}
              onChange={(e) => onAendern({ text: e.currentTarget.value })}
              error={rot(fehler.text)}
              data-nav=""
            />
          </Table.Td>
          {anzahl}
          {preis}
          {steuersatz}
          {betrag}
        </>
      )}
      <Table.Td>
        <ActionIcon
          variant="subtle"
          color="red"
          size={36}
          aria-label={`Posten ${nr} entfernen`}
          disabled={!kannEntfernen}
          onClick={onEntfernen}
        >
          <IconTrash size={18} />
        </ActionIcon>
      </Table.Td>
    </Table.Tr>
  );
}
