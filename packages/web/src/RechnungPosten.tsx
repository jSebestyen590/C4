import {
  ActionIcon,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';
import {
  RECHNUNG_POSTEN_ARTEN,
  RECHNUNG_POSTEN_TABELLEN_LABELS,
  centAnzeigen,
  rechnungPostenLabel,
  type BelegModus,
  type BelegWareDto,
  type KontoDto,
  type RechnungPostenArt,
} from '@c4/shared';
import {
  blurWaehltMarkierte,
  enterWaehltErsteOption,
  fokusAnzahl,
  wareFilter,
  wareOptionen,
  wareWahl,
} from './belegAuswahl';
import { BetragFeld } from './BetragFeld';
import { BETRAG_STIL } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { FeldLabel, InfoHinweis } from './InfoHinweis';
import { FeldZeile, NUR_RAND_KLASSE } from './FeldZeile';
import {
  erloesPatch,
  gebindePatch,
  preisPatch,
  tabellenZeilen,
  warePatch,
  type RechnungsTabellenZeile,
  type RechnungsZeile,
} from './rechnungFormular';
import { satzOptionen, useSteuersaetze } from './steuersaetze';
import { anzahlLesen } from './belegFormular';

/** Amount (without deposit) and deposit part of a filled item, by item key. */
export type RechnungsBetraege = ReadonlyMap<string, { betragCent: number; pfandCent: number }>;

interface Gemeinsam {
  modus: BelegModus;
  /** Erlös-Kategorien an item may use. */
  erloes: readonly Pick<KontoDto, 'id' | 'name' | 'steuersatzArt'>[];
  /** Preselected Erlös-Kategorie of Ware items (Einstellungen). */
  standardKonto: string | null;
  waren: readonly BelegWareDto[];
  versucht: boolean;
  /** Tables from `md`, cards below. */
  breit: boolean;
}

interface Spalte {
  name: string;
  breite: string;
  rechts?: true;
  preis?: true;
  hilfe?: string;
}

const SPALTEN: Record<RechnungPostenArt, readonly Spalte[]> = {
  ware: [
    { name: 'Ware', breite: '17%' },
    { name: 'Gebinde', breite: '11%' },
    { name: 'Anzahl', breite: '7%', rechts: true },
    { name: 'Preis je Gebinde', breite: '11%', rechts: true, preis: true },
    { name: 'Pfand je Gebinde', breite: '10%', rechts: true },
    { name: 'Steuer %', breite: '7%' },
    { name: 'Erlös-Kategorie', breite: '16%', hilfe: HILFE.rechnungen.erloesKategorie },
    { name: 'Betrag', breite: '14%', rechts: true },
  ],
  frei: [
    { name: 'Text', breite: '27%' },
    { name: 'Anzahl', breite: '9%', rechts: true },
    { name: 'Einzelpreis', breite: '14%', rechts: true, preis: true },
    { name: 'Steuer %', breite: '8%' },
    { name: 'Erlös-Kategorie', breite: '22%', hilfe: HILFE.rechnungen.erloesKategorie },
    { name: 'Betrag', breite: '20%', rechts: true },
  ],
};

/**
 * The two item tables of a Rechnung (Waren, Freitext), one below the other: tables from `md`, cards
 * below. Each ends with one empty row/card that joins the form once something is typed into it.
 * Inputs carry `data-nav`, the Anzahl input `data-anzahl`, rows `data-zeile`, the empty one
 * `data-leer`, the table `data-tabelle`; the last input of the last filled row `data-posten-ende`.
 */
export function RechnungPostenTabellen({
  posten,
  leere,
  betraege,
  onAendern,
  onEntfernen,
  ...gemeinsam
}: Readonly<
  Gemeinsam & {
    posten: readonly RechnungsZeile[];
    leere: Readonly<Record<RechnungPostenArt, RechnungsZeile>>;
    betraege: RechnungsBetraege;
    onAendern: (key: string, patch: Partial<RechnungsZeile>) => void;
    onEntfernen: (key: string) => void;
  }
>) {
  return (
    <Stack gap="lg">
      {RECHNUNG_POSTEN_ARTEN.map((art) => (
        <RechnungPostenTabelle
          key={art}
          art={art}
          zeilen={tabellenZeilen(posten, leere, art)}
          betraege={betraege}
          onAendern={onAendern}
          onEntfernen={onEntfernen}
          {...gemeinsam}
        />
      ))}
    </Stack>
  );
}

function RechnungPostenTabelle({
  art,
  zeilen,
  betraege,
  onAendern,
  onEntfernen,
  ...gemeinsam
}: Readonly<
  Gemeinsam & {
    art: RechnungPostenArt;
    zeilen: readonly RechnungsTabellenZeile[];
    betraege: RechnungsBetraege;
    onAendern: (key: string, patch: Partial<RechnungsZeile>) => void;
    onEntfernen: (key: string) => void;
  }
>) {
  const { versucht, breit } = gemeinsam;
  const letzterGefuellt = zeilen.filter((z) => !z.leer).at(-1)?.p.key;
  const preisLabel = gemeinsam.modus === 'netto' ? 'netto' : 'brutto';
  const meldungen = versucht
    ? zeilen.flatMap(({ p, nr }) =>
        nr === null ? [] : zeilenFehler(p).map((m) => `${rechnungPostenLabel(art, nr)}: ${m}`),
      )
    : [];
  const zeile = (z: RechnungsTabellenZeile) => (
    <RechnungsZeileAnsicht
      key={z.p.key}
      z={z}
      betrag={betraege.get(z.p.key)}
      ende={z.p.key === letzterGefuellt}
      onAendern={(patch) => onAendern(z.p.key, patch)}
      onEntfernen={() => onEntfernen(z.p.key)}
      {...gemeinsam}
    />
  );

  return (
    <Stack gap="xs" data-tabelle={art}>
      <Group gap={2}>
        <Title order={4} size="h5">
          {RECHNUNG_POSTEN_TABELLEN_LABELS[art]}
        </Title>
        {art === 'ware' && <InfoHinweis feld="Waren" text={HILFE.rechnungen.waren} />}
      </Group>
      {breit ? (
        <Table.ScrollContainer minWidth={art === 'ware' ? 920 : 760} className={NUR_RAND_KLASSE}>
          <Table verticalSpacing={4} horizontalSpacing={4} style={{ tableLayout: 'fixed' }}>
            <Table.Thead>
              <Table.Tr>
                {SPALTEN[art].map((s, i) => (
                  <Table.Th
                    key={s.name}
                    w={i === 0 ? undefined : s.breite}
                    style={s.rechts ? { textAlign: 'right' } : undefined}
                  >
                    {s.hilfe ? (
                      <Group gap={2} wrap="nowrap" component="span" display="inline-flex">
                        <span>{s.name}</span>
                        <InfoHinweis feld={s.name} text={s.hilfe} />
                      </Group>
                    ) : (
                      s.name
                    )}
                    {s.preis && ` (${preisLabel})`}
                  </Table.Th>
                ))}
                <Table.Th w={44} aria-label="Entfernen" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{zeilen.map(zeile)}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <Stack gap="xs">{zeilen.map(zeile)}</Stack>
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
    </Stack>
  );
}

/** Errors of one filled row, shown under the table (the inputs only get a red border). */
function zeilenFehler(p: RechnungsZeile): string[] {
  const f: string[] = [];
  if (p.art === 'ware') {
    if (!p.wareId) f.push('Bitte wähle eine Ware.');
    else if (!p.gebindeId) f.push('Bitte wähle ein Gebinde.');
  } else if (!p.text.trim()) f.push('Bitte gib den Text an.');
  if (!p.erloesKontoId) f.push('Bitte wähle eine Erlös-Kategorie.');
  if (p.anzahl.trim() === '' || anzahlLesen(p.anzahl) === null || anzahlLesen(p.anzahl) === 0)
    f.push('Bitte gib die Anzahl an.');
  if (p.einzelpreisCent === null) f.push('Bitte gib den Preis an.');
  return f;
}

function RechnungsZeileAnsicht({
  z: { p, leer, nr },
  betrag: betragWerte,
  ende: istEnde,
  modus,
  erloes,
  standardKonto,
  waren,
  versucht,
  breit,
  onAendern,
  onEntfernen,
}: Readonly<
  Gemeinsam & {
    z: RechnungsTabellenZeile;
    betrag: { betragCent: number; pfandCent: number } | undefined;
    ende: boolean;
    onAendern: (patch: Partial<RechnungsZeile>) => void;
    onEntfernen: () => void;
  }
>) {
  const saetze = useSteuersaetze();
  const ware = waren.find((w) => w.id === p.wareId);
  const gebinde = ware?.gebinde.find((g) => g.id === p.gebindeId);
  const art = p.art;
  const zeile = leer
    ? `${RECHNUNG_POSTEN_TABELLEN_LABELS[art]}, neue Zeile`
    : rechnungPostenLabel(art, nr!);
  const [wareSuche, setWareSuche] = useState('');
  const wareEingabe = useRef<HTMLInputElement>(null);
  // Set when a Ware was picked; the blur on leaving must not pick another one (see `wareWahl`).
  const wareGewaehlt = useRef(false);

  // Red border only (the messages stand below the table); empty rows show nothing.
  const fehlt = versucht && !leer ? new Set(zeilenFehler(p)) : new Set<string>();
  const rot = (meldung: string) => (fehlt.has(meldung) ? true : undefined);
  const dropdown = { width: 280, position: 'bottom-start' as const };
  const ende = (letztes: boolean) => (istEnde && letztes ? { 'data-posten-ende': art } : {});
  // Table cell: only an aria-label; card: a visible label.
  const feld = (label: string, hilfe?: string) =>
    breit
      ? { size: 'sm' as const, 'aria-label': `${label}, ${zeile}` }
      : { label: hilfe ? <FeldLabel text={label} hilfe={hilfe} /> : label };
  // Cards: `voll` cells span the whole row of the grid.
  const zelle = (kind: ReactNode, voll = false) =>
    breit ? (
      <Table.Td>{kind}</Table.Td>
    ) : voll ? (
      <div style={{ gridColumn: '1 / -1' }}>{kind}</div>
    ) : (
      kind
    );

  const anzahl = zelle(
    <TextInput
      {...feld(art === 'ware' ? 'Anzahl Gebinde' : 'Anzahl')}
      inputMode="decimal"
      autoComplete="off"
      value={p.anzahl}
      onChange={(e) => onAendern({ anzahl: e.currentTarget.value })}
      error={rot('Bitte gib die Anzahl an.')}
      styles={{ input: { textAlign: 'right' } }}
      data-nav=""
      data-anzahl=""
    />,
  );
  const preis = zelle(
    <BetragFeld
      {...feld(
        `${art === 'ware' ? 'Preis je Gebinde' : 'Einzelpreis'}${breit ? '' : ` (${modus === 'netto' ? 'netto' : 'brutto'})`}`,
        breit ? undefined : HILFE.belege.preisRechnen,
      )}
      negativ
      rechnen
      value={p.einzelpreisCent}
      formel={p.preisFormel}
      onWert={(c, _exakt, formel) => onAendern(preisPatch(c, formel))}
      error={rot('Bitte gib den Preis an.')}
      data-nav=""
    />,
  );
  const steuersatz = zelle(
    <Select
      {...feld('Steuersatz', breit ? undefined : HILFE.belege.steuersatz)}
      allowDeselect={false}
      data={satzOptionen(saetze.saetze, breit)}
      value={String(p.steuersatz)}
      onChange={(v) => v && onAendern({ steuersatz: Number(v) })}
      comboboxProps={breit ? { width: 100 } : undefined}
      data-nav=""
    />,
  );
  const kategorie = zelle(
    <Select
      {...feld('Erlös-Kategorie', breit ? undefined : HILFE.rechnungen.erloesKategorie)}
      onKeyDownCapture={enterWaehltErsteOption}
      placeholder="Kategorie suchen"
      searchable
      onBlurCapture={blurWaehltMarkierte}
      onFocus={(e) => e.currentTarget.select()}
      selectFirstOptionOnChange
      allowDeselect={false}
      data={erloes.map((k) => ({ value: k.id, label: k.name }))}
      value={p.erloesKontoId}
      onChange={(v) => onAendern(erloesPatch(erloes, v, saetze))}
      nothingFoundMessage="Keine Kategorie gefunden"
      comboboxProps={dropdown}
      error={rot('Bitte wähle eine Erlös-Kategorie.')}
      data-nav=""
      {...ende(true)}
    />,
    true,
  );
  const betrag = zelle(
    <Stack gap={2} justify="flex-end" style={breit ? undefined : { minHeight: 42 }}>
      {!breit && (
        <Text size="sm" fw={500}>
          Betrag
        </Text>
      )}
      <Text style={BETRAG_STIL} fw={600} size="sm">
        {leer ? '' : centAnzeigen((betragWerte?.betragCent ?? 0) + (betragWerte?.pfandCent ?? 0))}
      </Text>
      {!leer && (betragWerte?.pfandCent ?? 0) !== 0 && (
        <Text size="xs" c="dimmed" lh={1.2} style={{ ...BETRAG_STIL, whiteSpace: 'normal' }}>
          davon Pfand {centAnzeigen(betragWerte!.pfandCent)}
        </Text>
      )}
    </Stack>,
  );
  const entfernen = leer ? null : (
    <ActionIcon
      variant="subtle"
      color="red"
      size={breit ? 36 : 42}
      aria-label={`${zeile} entfernen`}
      onClick={onEntfernen}
    >
      <IconTrash size={18} />
    </ActionIcon>
  );

  const wareFelder = (
    <>
      {zelle(
        <Select
          ref={wareEingabe}
          {...feld('Ware')}
          onKeyDownCapture={enterWaehltErsteOption}
          placeholder="Ware suchen"
          allowDeselect={false}
          searchable
          onBlurCapture={blurWaehltMarkierte}
          onFocus={(e) => {
            wareGewaehlt.current = false;
            e.currentTarget.select();
          }}
          selectFirstOptionOnChange
          data={wareOptionen(waren)}
          filter={wareFilter(waren)}
          value={p.wareId}
          searchValue={wareSuche}
          onSearchChange={setWareSuche}
          onChange={(v) => {
            const wahl = wareWahl(
              v,
              false,
              document.activeElement === wareEingabe.current,
              wareGewaehlt.current,
            );
            if (wahl !== 'waehlen') return;
            wareGewaehlt.current = true;
            onAendern(warePatch(waren, erloes, standardKonto, p, v, modus, saetze));
            if (v) fokusAnzahl(p.key);
          }}
          nothingFoundMessage="Keine Ware gefunden"
          comboboxProps={dropdown}
          error={rot('Bitte wähle eine Ware.')}
          data-nav=""
        />,
        true,
      )}
      {zelle(
        <Select
          {...feld('Gebinde')}
          placeholder={ware ? 'Gebinde' : 'Erst Ware'}
          disabled={!ware}
          allowDeselect={false}
          data={(ware?.gebinde ?? []).map((g) => ({ value: g.id, label: g.bezeichnung }))}
          value={p.gebindeId}
          onChange={(v) => onAendern(gebindePatch(ware, v, modus, p.steuersatz))}
          comboboxProps={{ width: 200 }}
          error={rot('Bitte wähle ein Gebinde.')}
          data-nav=""
        />,
        true,
      )}
      {anzahl}
      {preis}
      {zelle(
        <BetragFeld
          {...feld('Pfand je Gebinde', breit ? undefined : HILFE.belege.pfand)}
          placeholder={gebinde ? 'kein Pfand' : undefined}
          value={p.pfandCent}
          onWert={(c) => onAendern({ pfandCent: c })}
          data-nav=""
        />,
      )}
      {steuersatz}
      {kategorie}
      {betrag}
    </>
  );
  const freiFelder = (
    <>
      {zelle(
        <TextInput
          {...feld('Text')}
          placeholder="z. B. Mitgliedsbeitrag"
          maxLength={200}
          value={p.text}
          onChange={(e) => onAendern({ text: e.currentTarget.value })}
          error={rot('Bitte gib den Text an.')}
          data-nav=""
        />,
        true,
      )}
      {anzahl}
      {preis}
      {steuersatz}
      {kategorie}
      {betrag}
    </>
  );
  const felder = art === 'ware' ? wareFelder : freiFelder;

  if (breit)
    return (
      <Table.Tr data-zeile={p.key} {...(leer && { 'data-leer': '' })}>
        {felder}
        <Table.Td>{entfernen}</Table.Td>
      </Table.Tr>
    );
  return (
    <Paper withBorder p="sm" data-zeile={p.key} {...(leer && { 'data-leer': '' })}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="sm" fw={600}>
            {leer ? 'Neue Zeile' : zeile}
          </Text>
          {entfernen}
        </Group>
        <FeldZeile cols={{ base: 2, sm: 3 }} spacing="xs" verticalSpacing={0}>
          {felder}
        </FeldZeile>
      </Stack>
    </Paper>
  );
}
