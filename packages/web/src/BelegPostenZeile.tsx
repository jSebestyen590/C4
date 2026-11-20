import {
  ActionIcon,
  Autocomplete,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useRef, useState } from 'react';
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
  enterWaehltErsteOption,
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
import { HILFE } from './finanzenHilfe';
import { FeldLabel } from './InfoHinweis';
import { FeldZeile } from './FeldZeile';

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
  onNeueWare,
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
  /** Opens "Neue Ware anlegen" with the typed search text; unset = not allowed. */
  onNeueWare?: (key: string, suche: string) => void;
  onAendern: (patch: Partial<PostenZeile>) => void;
  onEntfernen: () => void;
}>) {
  const ware = waren.find((w) => w.id === p.wareId);
  const gebinde = ware?.gebinde.find((g) => g.id === p.gebindeId);
  const fehler = postenFeldFehler(p, versucht);
  const [wareSuche, setWareSuche] = useState('');
  const wareEingabe = useRef<HTMLInputElement>(null);
  // Set when "Neue Ware anlegen" was picked: the dialog takes the focus and the field's blur must not
  // pick another option (autoSelectOnBlur) or move on; reset when the field gets the focus back.
  const neueWareGewaehlt = useRef(false);

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
          <FeldZeile cols={{ base: 1, sm: 2 }} spacing="xs" verticalSpacing={0}>
            <Select
              ref={wareEingabe}
              label="Ware"
              onKeyDownCapture={enterWaehltErsteOption}
              placeholder="Ware suchen"
              allowDeselect={false}
              searchable
              autoSelectOnBlur
              onFocus={() => {
                neueWareGewaehlt.current = false;
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
                );
                if (wahl === 'ignorieren') return;
                if (wahl !== 'waehlen') {
                  neueWareGewaehlt.current = true;
                  if (wahl === 'neue-oeffnen') onNeueWare?.(p.key, wareSuche);
                  setTimeout(() => setWareSuche(ware?.name ?? ''), 0);
                  return;
                }
                onAendern(warePatch(waren, aufwand, v));
                if (v) fokusAnzahl(p.key);
              }}
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
          </FeldZeile>
        )}

        <FeldZeile cols={{ base: 1, sm: 2 }} spacing="xs" verticalSpacing={0}>
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
              onKeyDownCapture={enterWaehltErsteOption}
              placeholder="Kategorie suchen"
              searchable
              autoSelectOnBlur
              selectFirstOptionOnChange
              allowDeselect={false}
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
        </FeldZeile>

        <FeldZeile
          cols={{ base: 2, sm: p.art === 'ware' ? 5 : 4 }}
          spacing="xs"
          verticalSpacing={0}
        >
          <TextInput
            label={
              <FeldLabel
                text={
                  p.art === 'ware'
                    ? 'Anzahl Gebinde'
                    : p.art === 'leergut'
                      ? 'Anzahl zurück'
                      : 'Anzahl'
                }
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
            data-anzahl=""
          />
          <BetragFeld
            label={`${p.art === 'ware' ? 'Preis je Gebinde' : p.art === 'leergut' ? 'Pfand je Stück' : 'Preis'} (${modus === 'netto' ? 'netto' : 'brutto'})`}
            negativ={p.art === 'kategorie'}
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
        </FeldZeile>
      </Stack>
    </Paper>
  );
}
