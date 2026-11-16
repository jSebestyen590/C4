import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { centAnzeigen, type BuchAbrechnungErgebnisDto, type BuchSeiteDto } from '@c4/shared';
import { useApi } from '../api';
import { BetragFeld } from '../BetragFeld';
import {
  rechneZeile,
  ueberzugWarnung,
  type BuchEingabe,
  type BuchZeilenRechnung,
} from '../buchAbrechnung';
import { BUCH_KEY, BuchInhaber, Saldo, seitenName, useBuchSeiten } from '../buchDaten';
import { schluesselFuer } from '../buchungFormular';
import { HILFE } from '../finanzenHilfe';
import { jsonOderFehler } from '../finanzenDaten';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { enterWeiter, useVerwerfenWarnung } from '../useVerwerfenWarnung';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const BETRAG = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;

type Eingaben = Record<string, BuchEingabe>;

interface Zeile {
  seite: BuchSeiteDto;
  rechnung: BuchZeilenRechnung;
}

function StricheFeld({
  seite,
  wert,
  onWert,
  fehler,
}: Readonly<{
  seite: BuchSeiteDto;
  wert: string;
  onWert: (w: string) => void;
  fehler?: string;
}>) {
  return (
    <TextInput
      size="md"
      aria-label={`Striche Seite ${seite.nummer}`}
      inputMode="numeric"
      autoComplete="off"
      placeholder="0"
      value={wert}
      onChange={(e) => onWert(e.currentTarget.value.replace(/\D/g, '').slice(0, 5))}
      onFocus={(e) => e.currentTarget.select()}
      error={fehler}
      data-nav=""
      styles={{
        input: {
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 'max(16px, 1rem)',
        },
      }}
    />
  );
}

/** Summary before saving: only the pages with values, the totals and the warnings to tick. */
function Bestaetigung({
  zeilen,
  warnungen,
  laeuft,
  fehler,
  onSpeichern,
  onClose,
}: Readonly<{
  zeilen: readonly Zeile[];
  warnungen: readonly string[];
  laeuft: boolean;
  fehler: string | null;
  onSpeichern: () => void;
  onClose: () => void;
}>) {
  const [bestaetigt, setBestaetigt] = useState<ReadonlySet<string>>(new Set());
  const offen = warnungen.some((w) => !bestaetigt.has(w));
  const summe = (f: (r: BuchZeilenRechnung) => number) =>
    zeilen.reduce((s, z) => s + f(z.rechnung), 0);
  return (
    <Modal
      opened
      size="xl"
      title="Abrechnung prüfen"
      onClose={laeuft ? () => undefined : onClose}
      closeOnClickOutside={!laeuft}
    >
      <Stack>
        <Text>
          {zeilen.length} {zeilen.length === 1 ? 'Seite wird' : 'Seiten werden'} abgerechnet, leere
          Zeilen sind nicht dabei.
        </Text>
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing={4} tabularNums>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Seite</Table.Th>
                <Table.Th style={BETRAG}>Striche</Table.Th>
                <Table.Th style={BETRAG}>Bar</Table.Th>
                <Table.Th style={BETRAG}>Abzahlung</Table.Th>
                <Table.Th style={BETRAG}>Saldo danach</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {zeilen.map(({ seite, rechnung: r }) => (
                <Table.Tr key={seite.id}>
                  <Table.Td>
                    {seite.nummer} <BuchInhaber seite={seite} verlinken={false} />
                  </Table.Td>
                  <Table.Td style={BETRAG}>{r.striche || ''}</Table.Td>
                  <Table.Td style={BETRAG}>{r.barCent ? centAnzeigen(r.barCent) : ''}</Table.Td>
                  <Table.Td style={BETRAG}>
                    {r.abzahlungCent ? centAnzeigen(r.abzahlungCent) : ''}
                  </Table.Td>
                  <Table.Td style={BETRAG}>
                    <Saldo cent={r.saldoDanachCent} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th>Summe</Table.Th>
                <Table.Th style={BETRAG}>{summe((r) => r.striche)}</Table.Th>
                <Table.Th style={BETRAG}>{centAnzeigen(summe((r) => r.barCent))}</Table.Th>
                <Table.Th style={BETRAG}>{centAnzeigen(summe((r) => r.abzahlungCent))}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
        {warnungen.length > 0 && (
          <Alert color="orange" title="Bitte prüfen">
            <Stack gap="xs">
              {warnungen.map((w) => (
                <Checkbox
                  key={w}
                  label={`${w} Das ist richtig so.`}
                  checked={bestaetigt.has(w)}
                  onChange={(e) =>
                    setBestaetigt((alt) => {
                      const neu = new Set(alt);
                      if (e.currentTarget.checked) neu.add(w);
                      else neu.delete(w);
                      return neu;
                    })
                  }
                />
              ))}
            </Stack>
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Eine gespeicherte Abrechnung lässt sich nicht mehr ändern, nur eintragsweise stornieren.
        </Text>
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose} disabled={laeuft}>
            Zurück zur Eingabe
          </Button>
          <Button onClick={onSpeichern} loading={laeuft} disabled={offen || laeuft}>
            Jetzt abrechnen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Abrechnung of all active pages in one go. Desktop first: a table you work through with Enter,
 * row by row; on phones the same fields as cards. Empty rows create nothing.
 */
export function FinanzenBuchAbrechnenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const seiten = useBuchSeiten(false);
  const breit = useMediaQuery('(min-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [eingaben, setEingaben] = useState<Eingaben>({});
  const [durchlauf, setDurchlauf] = useState(0);
  const [versucht, setVersucht] = useState(false);
  const [pruefenOffen, setPruefenOffen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);

  const liste = seiten.data ?? [];
  const zeilen: Zeile[] = liste.map((seite) => ({
    seite,
    rechnung: rechneZeile(seite, eingaben[seite.id]),
  }));
  const gefuellt = zeilen.filter((z) => !z.rechnung.leer);
  const ohneTarif = gefuellt.filter((z) => z.rechnung.ohneTarif);
  const warnungen = gefuellt.flatMap((z) =>
    z.rechnung.ueberzug && z.seite.tarif
      ? [ueberzugWarnung(seitenName(z.seite), z.rechnung, z.seite.tarif.maxUeberzugCent)]
      : [],
  );
  const buchbar = gefuellt.length > 0 && ohneTarif.length === 0;
  const summe = (f: (r: BuchZeilenRechnung) => number) =>
    gefuellt.reduce((s, z) => s + f(z.rechnung), 0);
  const warnungDialog = useVerwerfenWarnung(gefuellt.length > 0);

  const aendern = (id: string, teil: Partial<BuchEingabe>) =>
    setEingaben((alt) => ({
      ...alt,
      [id]: { striche: '', barCent: null, abzahlungCent: null, ...alt[id], ...teil },
    }));

  const body = (key: string) => ({
    idempotenzSchluessel: key,
    zeilen: gefuellt.map(({ seite, rechnung: r }) => ({
      seiteId: seite.id,
      striche: r.striche,
      barCent: r.barCent,
      abzahlungCent: r.abzahlungCent,
    })),
  });

  const abrechnen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      schluessel.current = schluesselFuer(schluessel.current, JSON.stringify(body('')), () =>
        crypto.randomUUID(),
      );
      return jsonOderFehler<BuchAbrechnungErgebnisDto>(
        await api.buch.abrechnungen.$post({ json: body(schluessel.current.schluessel) }),
      );
    },
    onSuccess: (ergebnis) => {
      warnungDialog.abgeschlossen();
      schluessel.current = null;
      void qc.invalidateQueries({ queryKey: BUCH_KEY });
      notifications.show({
        color: 'green',
        autoClose: 5000,
        message: `${ergebnis.wiederholt ? 'Die Abrechnung war schon gespeichert' : 'Abrechnung gespeichert'}: ${ergebnis.eintraege} ${ergebnis.eintraege === 1 ? 'Eintrag' : 'Einträge'}${ergebnis.ueberzug.length > 0 ? `, ${ergebnis.ueberzug.length} ${ergebnis.ueberzug.length === 1 ? 'Seite überzogen' : 'Seiten überzogen'}` : ''}.`,
      });
      setEingaben({});
      setDurchlauf((d) => d + 1);
      setVersucht(false);
      setPruefenOffen(false);
      setTimeout(() => formRef.current?.querySelector<HTMLElement>('[data-nav]')?.focus(), 0);
    },
  });

  const pruefenOeffnen = () => {
    setVersucht(true);
    if (!buchbar) return;
    abrechnen.reset();
    void seiten.refetch().then(() => setPruefenOffen(true));
  };

  const felder = ({ seite, rechnung: r }: Zeile) => {
    const e = eingaben[seite.id];
    const tarifFehler = versucht && r.ohneTarif ? 'Kein Tarif für diesen Status.' : undefined;
    return {
      striche: (
        <StricheFeld
          key={`s-${seite.id}-${durchlauf}`}
          seite={seite}
          wert={e?.striche ?? ''}
          onWert={(w) => aendern(seite.id, { striche: w })}
          fehler={tarifFehler}
        />
      ),
      bar: (
        <BetragFeld
          key={`b-${seite.id}-${durchlauf}`}
          size="md"
          aria-label={`Bar Seite ${seite.nummer}`}
          value={e?.barCent ?? null}
          onWert={(c) => aendern(seite.id, { barCent: c })}
          data-nav=""
        />
      ),
      abzahlung: (
        <BetragFeld
          key={`a-${seite.id}-${durchlauf}`}
          size="md"
          aria-label={`Abzahlung Seite ${seite.nummer}`}
          value={e?.abzahlungCent ?? null}
          onWert={(c) => aendern(seite.id, { abzahlungCent: c })}
          data-nav=""
        />
      ),
    };
  };

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/buch">Buch</ZurueckLink>
      <Title order={2}>Abrechnen</Title>
      <Group gap={2}>
        <Text c="dimmed" size="sm">
          Trag je Seite Striche, Bar und Abzahlung ein. Mit Enter springst du zum nächsten Feld.
        </Text>
        <InfoHinweis feld="leere Zeilen" text={HILFE.buch.leereZeilen} />
      </Group>
      {seiten.isPending && <Loader m="md" aria-label="Seiten werden geladen" />}
      {seiten.isError && <Alert color="red">Die Seiten konnten nicht geladen werden.</Alert>}
      {seiten.data && liste.length === 0 && (
        <Text c="dimmed">Es gibt noch keine aktiven Seiten. Lege zuerst Seiten an.</Text>
      )}
      {seiten.data && liste.length > 0 && (
        <form
          ref={formRef}
          noValidate
          onKeyDown={(e) => enterWeiter(e, formRef.current, pruefenOeffnen)}
          onSubmit={(e) => {
            e.preventDefault();
            pruefenOeffnen();
          }}
        >
          <Stack>
            {breit ? (
              <Table.ScrollContainer minWidth={760}>
                <Table verticalSpacing={4} tabularNums highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={70}>Nr.</Table.Th>
                      <Table.Th>Mitglied / Extern</Table.Th>
                      <Table.Th style={BETRAG}>Saldo jetzt</Table.Th>
                      <Table.Th w={110}>
                        <FeldLabel text="Striche" hilfe={HILFE.buch.striche} />
                      </Table.Th>
                      <Table.Th w={150}>
                        <FeldLabel text="Bar" hilfe={HILFE.buch.bar} />
                      </Table.Th>
                      <Table.Th w={150}>
                        <FeldLabel text="Abzahlung" hilfe={HILFE.buch.abzahlung} />
                      </Table.Th>
                      <Table.Th style={BETRAG}>
                        <FeldLabel text="Saldo danach" hilfe={HILFE.buch.saldoDanach} />
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {zeilen.map((z) => {
                      const f = felder(z);
                      return (
                        <Table.Tr
                          key={z.seite.id}
                          bg={z.rechnung.leer ? undefined : 'var(--mantine-color-blue-light)'}
                        >
                          <Table.Td>{z.seite.nummer}</Table.Td>
                          <Table.Td>
                            <BuchInhaber seite={z.seite} />
                          </Table.Td>
                          <Table.Td style={BETRAG}>
                            <Saldo cent={z.seite.saldoCent} fett={false} />
                          </Table.Td>
                          <Table.Td>{f.striche}</Table.Td>
                          <Table.Td>{f.bar}</Table.Td>
                          <Table.Td>{f.abzahlung}</Table.Td>
                          <Table.Td style={BETRAG}>
                            {z.rechnung.leer ? (
                              ''
                            ) : (
                              <Group gap={6} justify="flex-end" wrap="nowrap">
                                {z.rechnung.ueberzug && (
                                  <Badge color="red" variant="light">
                                    Überzug
                                  </Badge>
                                )}
                                <Saldo cent={z.rechnung.saldoDanachCent} />
                              </Group>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                  <Table.Tfoot>
                    <Table.Tr>
                      <Table.Th colSpan={3}>
                        Summe ({gefuellt.length} {gefuellt.length === 1 ? 'Zeile' : 'Zeilen'})
                      </Table.Th>
                      <Table.Th style={BETRAG}>{summe((r) => r.striche)}</Table.Th>
                      <Table.Th style={BETRAG}>{centAnzeigen(summe((r) => r.barCent))}</Table.Th>
                      <Table.Th style={BETRAG}>
                        {centAnzeigen(summe((r) => r.abzahlungCent))}
                      </Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Tfoot>
                </Table>
              </Table.ScrollContainer>
            ) : (
              <Stack gap="sm">
                {zeilen.map((z) => {
                  const f = felder(z);
                  return (
                    <Paper key={z.seite.id} withBorder p="sm" radius="md">
                      <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap" align="flex-start">
                          <Text style={{ minWidth: 0 }}>
                            <Text span c="dimmed">
                              {z.seite.nummer}{' '}
                            </Text>
                            <BuchInhaber seite={z.seite} verlinken={false} />
                          </Text>
                          <Saldo cent={z.seite.saldoCent} />
                        </Group>
                        <SimpleGrid cols={3} spacing="xs">
                          <div>
                            <Text size="xs" c="dimmed">
                              Striche
                            </Text>
                            {f.striche}
                          </div>
                          <div>
                            <Text size="xs" c="dimmed">
                              Bar
                            </Text>
                            {f.bar}
                          </div>
                          <div>
                            <Text size="xs" c="dimmed">
                              Abzahlung
                            </Text>
                            {f.abzahlung}
                          </div>
                        </SimpleGrid>
                        {!z.rechnung.leer && (
                          <Group gap="xs" justify="space-between">
                            <Text size="sm" c="dimmed">
                              Saldo danach
                            </Text>
                            <Group gap="xs">
                              {z.rechnung.ueberzug && (
                                <Badge color="red" variant="light">
                                  Überzug
                                </Badge>
                              )}
                              <Saldo cent={z.rechnung.saldoDanachCent} />
                            </Group>
                          </Group>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
                <Text size="sm" fw={600}>
                  Summe: {summe((r) => r.striche)} Striche · Bar{' '}
                  {centAnzeigen(summe((r) => r.barCent))} · Abzahlung{' '}
                  {centAnzeigen(summe((r) => r.abzahlungCent))}
                </Text>
              </Stack>
            )}
            {versucht && ohneTarif.length > 0 && (
              <Alert color="red">
                Für {ohneTarif.map((z) => seitenName(z.seite)).join(', ')} ist kein Tarif
                hinterlegt, sie können keine Striche bekommen. Lege den Tarif unter „Tarife“ an.
              </Alert>
            )}
            <Group align="center" gap="md">
              <Button type="button" onClick={pruefenOeffnen} disabled={!buchbar}>
                Prüfen und abrechnen
              </Button>
              <Text size="sm" c="dimmed">
                {gefuellt.length === 0 ? 'Noch nichts eingetragen.' : 'Tastenkürzel: Strg+Enter'}
              </Text>
            </Group>
          </Stack>
        </form>
      )}
      {pruefenOffen && (
        <Bestaetigung
          zeilen={gefuellt}
          warnungen={warnungen}
          laeuft={abrechnen.isPending}
          fehler={
            abrechnen.isError
              ? fehlerText(abrechnen.error, 'Das Abrechnen ist fehlgeschlagen.')
              : null
          }
          onSpeichern={() => abrechnen.mutate()}
          onClose={() => setPruefenOffen(false)}
        />
      )}
      {warnungDialog.dialog}
    </Stack>
  );
}
