import {
  ActionIcon,
  Autocomplete,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import {
  centAnzeigen,
  postenZeilenLabel,
  type ArtikelKategorieVorschlaege,
  type BelegPostenArt,
  type BelegWareDto,
  type KontoDto,
} from '@c4/shared';
import {
  einzelpreisHinweis,
  POSTEN_REIHENFOLGE,
  preisPatch,
  tabellenZeilen,
  type PostenZeile,
  type TabellenZeile,
} from './belegFormular';
import {
  artikelNamen,
  artikelPatch,
  enterWaehltErsteOption,
  blurWaehltMarkierte,
  fokusAnzahl,
  kategorieOptionenMitVorschlaegen,
  kategoriePatch,
  wareWahl,
  postenFeldFehler,
  wareFilter,
  wareOptionen,
  warePatch,
} from './belegAuswahl';
import { BetragFeld } from './BetragFeld';
import { BETRAG_STIL } from './finanzenDaten';
import { NUR_RAND_KLASSE } from './FeldZeile';
import { satzOptionen, useSteuersaetze } from './steuersaetze';
import { HILFE } from './finanzenHilfe';
import { InfoHinweis } from './InfoHinweis';

const TITEL: Record<BelegPostenArt, string> = {
  ware: 'Waren',
  kategorie: 'Kategorien',
  leergut: 'Leergut',
};

interface Spalte {
  name: string;
  breite: string;
  rechts?: true;
  /** Price column: the header gets "(brutto)" / "(netto)". */
  preis?: true;
  /** Explanation behind the header text (info icon). */
  hilfe?: string;
}

/** Column header text and width (percent of the table) per kind. */
const SPALTEN: Record<BelegPostenArt, readonly Spalte[]> = {
  ware: [
    { name: 'Ware', breite: '17%' },
    { name: 'Gebinde', breite: '11%' },
    { name: 'Anzahl', breite: '7%', rechts: true },
    {
      name: 'Preis je Gebinde',
      breite: '11%',
      rechts: true,
      preis: true,
      hilfe: HILFE.belege.preisRechnen,
    },
    { name: 'Pfand je Gebinde', breite: '10%', rechts: true },
    { name: 'Steuer %', breite: '7%' },
    { name: 'Kategorie', breite: '16%', hilfe: HILFE.belege.kategorie },
    { name: 'Betrag', breite: '14%', rechts: true },
  ],
  kategorie: [
    { name: 'Artikel', breite: '23%' },
    { name: 'Kategorie', breite: '22%', hilfe: HILFE.belege.kategorie },
    { name: 'Anzahl', breite: '9%', rechts: true },
    {
      name: 'Einzelpreis',
      breite: '13%',
      rechts: true,
      preis: true,
      hilfe: HILFE.belege.preisRechnen,
    },
    { name: 'Steuer %', breite: '8%' },
    { name: 'Betrag', breite: '18%', rechts: true },
  ],
  leergut: [
    { name: 'Beschreibung', breite: '38%' },
    { name: 'Anzahl zurück', breite: '13%', rechts: true },
    {
      name: 'Pfand je Stück',
      breite: '18%',
      rechts: true,
      preis: true,
      hilfe: HILFE.belege.preisRechnen,
    },
    { name: 'Steuer %', breite: '11%' },
    { name: 'Betrag', breite: '20%', rechts: true },
  ],
};

interface Gemeinsam {
  modus: 'brutto' | 'netto';
  aufwand: readonly KontoDto[];
  waren: readonly BelegWareDto[];
  artikelVorschlaege: ArtikelKategorieVorschlaege;
  versucht: boolean;
  /** Eigenbeleg: no Steuersatz column (the values of the rows stay). */
  eigenbeleg?: boolean;
  /** Opens "Neue Ware anlegen" for the row with the item key and the typed search text; unset = not allowed. */
  onNeueWare?: (key: string, suche: string) => void;
}

/** Amount (incl. deposit) and deposit part of a filled item, by item key. */
export type PostenBetraege = ReadonlyMap<string, { betragCent: number; pfandCent: number }>;

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
 * Each ends with one empty row (the form's last empty item of the kind or `leere[art]`, see
 * `tabellenZeilen`); typing into it makes it a real item and a new empty row appears below.
 * Every input carries `data-nav`, the Anzahl input `data-anzahl`, every row `data-zeile`, the empty
 * row `data-leer`. The last input of the last filled row of a table carries
 * `data-posten-ende="<art>"` (the form then moves to the empty row on Enter).
 */
export function BelegPostenTabellen({
  posten,
  leere,
  betraege,
  onAendern,
  onEntfernen,
  ...gemeinsam
}: Readonly<
  Gemeinsam & {
    posten: readonly PostenZeile[];
    leere: Readonly<Record<BelegPostenArt, PostenZeile>>;
    betraege: PostenBetraege;
    onAendern: (key: string, patch: Partial<PostenZeile>) => void;
    onEntfernen: (key: string) => void;
  }
>) {
  return (
    <Stack gap="lg">
      {POSTEN_REIHENFOLGE.map((art) => (
        <BelegPostenTabelle
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

/** One table of one kind. */
export function BelegPostenTabelle({
  art,
  zeilen,
  betraege,
  modus,
  aufwand,
  waren,
  artikelVorschlaege,
  versucht,
  eigenbeleg = false,
  onNeueWare,
  onAendern,
  onEntfernen,
}: Readonly<
  Gemeinsam & {
    art: BelegPostenArt;
    zeilen: readonly TabellenZeile[];
    betraege: PostenBetraege;
    onAendern: (key: string, patch: Partial<PostenZeile>) => void;
    onEntfernen: (key: string) => void;
  }
>) {
  const spalten = SPALTEN[art].filter((s) => !(eigenbeleg && s.name === 'Steuer %'));
  const preisLabel = modus === 'netto' ? 'netto' : 'brutto';
  const letzterGefuellt = zeilen.filter((z) => !z.leer).at(-1)?.p.key;
  const meldungen = versucht
    ? zeilen.flatMap(({ p, nr }) =>
        nr === null
          ? []
          : Object.entries(postenFeldFehler(p, true)).map(
              ([feld, text]) =>
                `${postenZeilenLabel(art, nr)}: ${[FELD_NAMEN[feld], text].filter(Boolean).join(': ')}`,
            ),
      )
    : [];

  return (
    <Stack gap="xs" data-tabelle={art}>
      <Title order={4} size="h5">
        {TITEL[art]}
      </Title>
      <Table.ScrollContainer minWidth={art === 'ware' ? 920 : 760} className={NUR_RAND_KLASSE}>
        <Table verticalSpacing={4} horizontalSpacing={4} style={{ tableLayout: 'fixed' }}>
          <Table.Thead>
            <Table.Tr>
              {spalten.map((s, i) => (
                <Table.Th
                  key={s.name}
                  // The first column has no width: it takes what is left, so the trailing delete column stays 44px.
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
          <Table.Tbody>
            {zeilen.map((z) => (
              <PostenTabellenZeile
                key={z.p.key}
                z={z}
                art={art}
                betrag={betraege.get(z.p.key)}
                ende={z.p.key === letzterGefuellt}
                aufwand={aufwand}
                waren={waren}
                artikelVorschlaege={artikelVorschlaege}
                versucht={versucht}
                eigenbeleg={eigenbeleg}
                onNeueWare={onNeueWare}
                onAendern={(patch) => onAendern(z.p.key, patch)}
                onEntfernen={() => onEntfernen(z.p.key)}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
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

function PostenTabellenZeile({
  z: { p, leer, nr },
  art,
  betrag: betragWerte,
  ende: istEnde,
  aufwand,
  waren,
  artikelVorschlaege,
  versucht,
  eigenbeleg,
  onNeueWare,
  onAendern,
  onEntfernen,
}: Readonly<{
  z: TabellenZeile;
  art: BelegPostenArt;
  betrag: { betragCent: number; pfandCent: number } | undefined;
  /** Last filled row of its table: its last input moves to the empty row on Enter. */
  ende: boolean;
  aufwand: readonly KontoDto[];
  waren: readonly BelegWareDto[];
  artikelVorschlaege: ArtikelKategorieVorschlaege;
  versucht: boolean;
  eigenbeleg: boolean;
  onNeueWare?: (key: string, suche: string) => void;
  onAendern: (patch: Partial<PostenZeile>) => void;
  onEntfernen: () => void;
}>) {
  const saetze = useSteuersaetze();
  const ware = waren.find((w) => w.id === p.wareId);
  const gebinde = ware?.gebinde.find((g) => g.id === p.gebindeId);
  // Empty rows show no errors: nothing is checked there.
  const fehler = postenFeldFehler(p, versucht && !leer);
  const zeile = leer ? `${TITEL[art]}, neue Zeile` : postenZeilenLabel(art, nr!);
  const betragCent = betragWerte?.betragCent ?? 0;
  const pfandBetragCent = betragWerte?.pfandCent ?? 0;
  // Red border only; the messages stand below the table.
  const rot = (meldung: string | undefined) => (meldung ? true : undefined);
  const dropdown = { width: 280, position: 'bottom-start' as const };
  // The last input of the row (Kategorie for Waren, else Steuersatz) ends the table on Enter.
  const ende = (letztes: boolean) => (istEnde && letztes ? { 'data-posten-ende': art } : {});
  const [wareSuche, setWareSuche] = useState('');
  const wareEingabe = useRef<HTMLInputElement>(null);
  // Set when "Neue Ware anlegen" was picked: the dialog takes the focus and the field's blur must not
  // pick another option (blur pick) or move on; reset when the field gets the focus back.
  const neueWareGewaehlt = useRef(false);
  // Set when a Ware was picked; the blur on leaving must not pick another one (see `wareWahl`).
  const wareGewaehlt = useRef(false);

  const anzahl = (
    <Table.Td>
      <TextInput
        size="sm"
        aria-label={`${art === 'ware' ? 'Anzahl Gebinde' : art === 'leergut' ? 'Anzahl zurück' : 'Anzahl'}, ${zeile}`}
        inputMode="decimal"
        autoComplete="off"
        value={p.anzahl}
        onChange={(e) => onAendern({ anzahl: e.currentTarget.value })}
        error={rot(fehler.anzahl)}
        styles={{ input: { textAlign: 'right' } }}
        data-nav=""
        data-anzahl=""
      />
    </Table.Td>
  );
  const preis = (
    <Table.Td>
      <BetragFeld
        size="sm"
        aria-label={`${art === 'ware' ? 'Preis je Gebinde' : art === 'leergut' ? 'Pfand je Stück' : 'Preis'}, ${zeile}`}
        negativ={art === 'kategorie'}
        rechnen
        value={p.einzelpreisCent}
        onWert={(c, exakt) => onAendern(preisPatch(c, exakt))}
        error={rot(fehler.preis)}
        data-nav=""
        {...ende(eigenbeleg && art !== 'ware')}
      />
    </Table.Td>
  );
  const proEinheit = einzelpreisHinweis(p);
  const steuersatz = (
    <Table.Td>
      <Select
        size="sm"
        aria-label={`Steuersatz, ${zeile}`}
        allowDeselect={false}
        data={satzOptionen(saetze.saetze, true)}
        value={String(p.steuersatz)}
        onChange={(v) => v && onAendern({ steuersatz: Number(v) })}
        comboboxProps={{ width: 100 }}
        data-nav=""
        {...ende(art !== 'ware')}
      />
    </Table.Td>
  );
  const betrag = (
    <Table.Td style={BETRAG_STIL}>
      {!leer && (
        <>
          <Text fw={600} size="sm">
            {centAnzeigen(betragCent + pfandBetragCent)}
          </Text>
          {pfandBetragCent !== 0 && (
            <Text size="xs" c="dimmed" lh={1.2} style={{ whiteSpace: 'normal' }}>
              davon Pfand {centAnzeigen(pfandBetragCent)}
            </Text>
          )}
          {proEinheit !== null && (
            <Text size="xs" c="dimmed" lh={1.2} style={{ whiteSpace: 'normal' }}>
              ≈ {centAnzeigen(proEinheit)} je {art === 'ware' ? 'Gebinde' : 'Stück'}
            </Text>
          )}
        </>
      )}
    </Table.Td>
  );
  const kategorieZelle = (artikel: boolean) => (
    <Table.Td>
      <Select
        size="sm"
        aria-label={`Kategorie, ${zeile}`}
        onKeyDownCapture={enterWaehltErsteOption}
        placeholder="Kategorie suchen"
        searchable
        onBlurCapture={blurWaehltMarkierte}
        onFocus={(e) => e.currentTarget.select()}
        selectFirstOptionOnChange
        allowDeselect={false}
        data={
          artikel
            ? kategorieOptionenMitVorschlaegen(aufwand, artikelVorschlaege, p.text)
            : aufwand.map((k) => ({ value: k.id, label: k.name }))
        }
        value={p.kategorieId}
        onChange={(v) => onAendern(kategoriePatch(aufwand, v, saetze))}
        nothingFoundMessage="Keine Kategorie gefunden"
        comboboxProps={dropdown}
        error={rot(fehler.kategorie)}
        data-nav=""
        {...ende(!artikel)}
      />
    </Table.Td>
  );

  return (
    <Table.Tr data-zeile={p.key} {...(leer && { 'data-leer': '' })}>
      {p.art === 'ware' && (
        <>
          <Table.Td>
            <Select
              ref={wareEingabe}
              size="sm"
              aria-label={`Ware, ${zeile}`}
              onKeyDownCapture={enterWaehltErsteOption}
              placeholder="Ware suchen"
              allowDeselect={false}
              searchable
              onBlurCapture={blurWaehltMarkierte}
              onFocus={(e) => {
                neueWareGewaehlt.current = false;
                wareGewaehlt.current = false;
                e.currentTarget.select();
              }}
              selectFirstOptionOnChange
              data={wareOptionen(waren, !!onNeueWare)}
              filter={wareFilter(waren)}
              value={p.wareId}
              searchValue={wareSuche}
              onSearchChange={setWareSuche}
              onChange={(v) => {
                const wahl = wareWahl(
                  v,
                  neueWareGewaehlt.current,
                  document.activeElement === wareEingabe.current,
                  wareGewaehlt.current,
                );
                if (wahl === 'ignorieren') return;
                if (wahl !== 'waehlen') {
                  neueWareGewaehlt.current = true;
                  if (wahl === 'neue-oeffnen') onNeueWare?.(p.key, wareSuche);
                  setTimeout(() => setWareSuche(ware?.name ?? ''), 0);
                  return;
                }
                wareGewaehlt.current = true;
                onAendern(warePatch(waren, aufwand, v, saetze));
                if (v) fokusAnzahl(p.key);
              }}
              nothingFoundMessage="Keine Ware gefunden"
              comboboxProps={dropdown}
              error={rot(fehler.ware)}
              data-nav=""
            />
          </Table.Td>
          <Table.Td>
            <Select
              size="sm"
              aria-label={`Gebinde, ${zeile}`}
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
              aria-label={`Pfand je Gebinde, ${zeile}`}
              placeholder={gebinde ? 'kein Pfand' : undefined}
              value={p.pfandCent}
              onWert={(c) => onAendern({ pfandCent: c })}
              data-nav=""
            />
          </Table.Td>
          {!eigenbeleg && steuersatz}
          {kategorieZelle(false)}
          {betrag}
        </>
      )}
      {p.art === 'kategorie' && (
        <>
          <Table.Td>
            <Autocomplete
              size="sm"
              aria-label={`Artikel, ${zeile}`}
              placeholder="z. B. Deko"
              maxLength={100}
              data={artikelNamen(artikelVorschlaege)}
              value={p.text}
              onChange={(v) => onAendern(artikelPatch(p, aufwand, artikelVorschlaege, v, saetze))}
              error={rot(fehler.text)}
              data-nav=""
            />
          </Table.Td>
          {kategorieZelle(true)}
          {anzahl}
          {preis}
          {!eigenbeleg && steuersatz}
          {betrag}
        </>
      )}
      {p.art === 'leergut' && (
        <>
          <Table.Td>
            <TextInput
              size="sm"
              aria-label={`Beschreibung, ${zeile}`}
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
          {!eigenbeleg && steuersatz}
          {betrag}
        </>
      )}
      <Table.Td>
        {!leer && (
          <ActionIcon
            variant="subtle"
            color="red"
            size={36}
            aria-label={`${zeile} entfernen`}
            onClick={onEntfernen}
          >
            <IconTrash size={18} />
          </ActionIcon>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
