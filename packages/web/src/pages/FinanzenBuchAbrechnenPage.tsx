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
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { centAnzeigen, type BuchAbrechnungErgebnisDto, type BuchSeiteDto } from '@c4/shared';
import { useApi } from '../api';
import { BetragFeld } from '../BetragFeld';
import {
  naechsteOffene,
  rechneZeile,
  ueberzugWarnung,
  type BuchEingabe,
  type BuchZeilenRechnung,
} from '../buchAbrechnung';
import { BUCH_KEY, BuchInhaber, Saldo, saldoText, seitenName, useBuchSeiten } from '../buchDaten';
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

/** What was saved for a page in this session; the row is locked and shows it. */
interface Abgeschlossen {
  striche: number;
  barCent: number;
  abzahlungCent: number;
  saldoDanachCent: number;
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
      data-striche={seite.id}
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

/** Confirmation for one page: what goes into the book, the balance before and after, warnings to tick. */
function SeiteAbschliessen({
  zeile,
  warnung,
  laeuft,
  fehler,
  onSpeichern,
  onClose,
}: Readonly<{
  zeile: Zeile;
  warnung: string | null;
  laeuft: boolean;
  fehler: string | null;
  onSpeichern: () => void;
  onClose: () => void;
}>) {
  const [bestaetigt, setBestaetigt] = useState(false);
  const { seite, rechnung: r } = zeile;
  const strichwert = seite.tarif?.strichwertCent ?? 0;
  const gesperrt = (warnung !== null && !bestaetigt) || laeuft;
  return (
    <Modal
      opened
      onClose={laeuft ? () => undefined : onClose}
      closeOnClickOutside={!laeuft}
      title={`Seite ${seite.nummer} abschließen`}
    >
      <Stack>
        <Text>
          <BuchInhaber seite={seite} verlinken={false} />
        </Text>
        <Stack gap={2}>
          <Text>
            Striche: {r.striche} × {centAnzeigen(strichwert)} ={' '}
            {centAnzeigen(r.striche * strichwert)}
          </Text>
          <Text>Bar: {centAnzeigen(r.barCent)}</Text>
          <Text>Abzahlung: {centAnzeigen(r.abzahlungCent)}</Text>
        </Stack>
        <Text fw={600}>
          Saldo: <Saldo cent={seite.saldoCent} fett={false} /> → <Saldo cent={r.saldoDanachCent} />
        </Text>
        {warnung && (
          <Alert color="orange" title="Bitte prüfen">
            <Checkbox
              label={`${warnung} Das ist richtig so.`}
              checked={bestaetigt}
              onChange={(e) => setBestaetigt(e.currentTarget.checked)}
              data-autofocus
            />
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Gespeichertes lässt sich hier nicht mehr ändern; Korrekturen gehen per Storno auf der
          Seite.
        </Text>
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose} disabled={laeuft}>
            Zurück
          </Button>
          <Button
            onClick={onSpeichern}
            loading={laeuft}
            disabled={gesperrt}
            data-autofocus={warnung ? undefined : ''}
          >
            Seite abschließen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** The locked state of a closed row: what was saved and, prominently, the number for the book. */
function EintragenHinweis({ a }: Readonly<{ a: Abgeschlossen }>) {
  return (
    <Stack gap={0} align="flex-end">
      <Badge color="green" variant="light">
        Abgeschlossen
      </Badge>
      <Text size="xs" c="dimmed">
        Ins Buch eintragen:
      </Text>
      <Text fz="xl" lh={1.1}>
        <Saldo cent={a.saldoDanachCent} />
      </Text>
    </Stack>
  );
}

/**
 * Abrechnung page by page, like the physical book: enter Striche, Bar and Abzahlung of one page,
 * close it (own confirmation, saved at once), write the new balance into the book, next page.
 * Desktop first: Enter moves through the fields, Enter in Abzahlung closes the page.
 */
export function FinanzenBuchAbrechnenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const seiten = useBuchSeiten(false);
  const breit = useMediaQuery('(min-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [eingaben, setEingaben] = useState<Eingaben>({});
  const [abgeschlossen, setAbgeschlossen] = useState<Record<string, Abgeschlossen>>({});
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [versucht, setVersucht] = useState<Record<string, boolean>>({});
  const [dialogId, setDialogId] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const schluessel = useRef<Record<string, { schluessel: string; inhalt: string }>>({});

  const liste = seiten.data ?? [];
  const zeilen: Zeile[] = liste.map((seite) => ({
    seite,
    rechnung: rechneZeile(seite, eingaben[seite.id]),
  }));
  const geschlossen = new Set(Object.keys(abgeschlossen));
  const offeneMitWerten = zeilen.filter((z) => !geschlossen.has(z.seite.id) && !z.rechnung.leer);
  const warnungDialog = useVerwerfenWarnung(offeneMitWerten.length > 0);
  const summe = (f: (a: Abgeschlossen) => number) =>
    Object.values(abgeschlossen).reduce((s, a) => s + f(a), 0);

  const aendern = (id: string, teil: Partial<BuchEingabe>) =>
    setEingaben((alt) => ({
      ...alt,
      [id]: { striche: '', barCent: null, abzahlungCent: null, ...alt[id], ...teil },
    }));

  const fokusStriche = (id: string | null) =>
    setTimeout(
      () => formRef.current?.querySelector<HTMLElement>(`[data-striche="${id}"]`)?.focus(),
      0,
    );
  const weiter = (id: string, zusaetzlichGeschlossen?: string) => {
    const zu = new Set(geschlossen);
    if (zusaetzlichGeschlossen) zu.add(zusaetzlichGeschlossen);
    const n = naechsteOffene(
      liste.map((s) => s.id),
      zu,
      id,
    );
    if (n) fokusStriche(n);
  };

  /** Opens the confirmation of one page; an empty row is just skipped. */
  const abschliessen = (id: string) => {
    const z = zeilen.find((x) => x.seite.id === id);
    if (!z || geschlossen.has(id)) return;
    if (z.rechnung.leer) {
      weiter(id);
      return;
    }
    setVersucht((v) => ({ ...v, [id]: true }));
    if (z.rechnung.ohneTarif) return;
    setFehler((f) => ({ ...f, [id]: '' }));
    void seiten.refetch().then(() => setDialogId(id));
  };

  const speichern = async (z: Zeile) => {
    const { seite, rechnung: r } = z;
    const zeileBody = {
      seiteId: seite.id,
      striche: r.striche,
      barCent: r.barCent,
      abzahlungCent: r.abzahlungCent,
    };
    const inhalt = JSON.stringify(zeileBody);
    const key = schluesselFuer(schluessel.current[seite.id] ?? null, inhalt, () =>
      crypto.randomUUID(),
    );
    schluessel.current[seite.id] = key;
    setLaeuft(true);
    try {
      const ergebnis = await jsonOderFehler<BuchAbrechnungErgebnisDto>(
        await api.buch.abrechnungen.$post({
          json: { idempotenzSchluessel: key.schluessel, zeilen: [zeileBody] },
        }),
      );
      const danach =
        ergebnis.saldi.find((s) => s.seiteId === seite.id)?.saldoCent ?? r.saldoDanachCent;
      setAbgeschlossen((a) => ({
        ...a,
        [seite.id]: {
          striche: r.striche,
          barCent: r.barCent,
          abzahlungCent: r.abzahlungCent,
          saldoDanachCent: danach,
        },
      }));
      setDialogId(null);
      void qc.invalidateQueries({ queryKey: BUCH_KEY });
      // A repeated save (same key) is not announced a second time.
      if (!ergebnis.wiederholt) {
        notifications.show({
          color: 'green',
          autoClose: 4000,
          message: `Seite ${seite.nummer} abgeschlossen. Ins Buch eintragen: ${saldoText(danach)}`,
        });
      }
      weiter(seite.id, seite.id);
    } catch (e) {
      setFehler((f) => ({
        ...f,
        [seite.id]: fehlerText(e, 'Das Speichern ist fehlgeschlagen.'),
      }));
    } finally {
      setLaeuft(false);
    }
  };

  const felder = ({ seite, rechnung: r }: Zeile) => {
    const e = eingaben[seite.id];
    const tarifFehler =
      versucht[seite.id] && r.ohneTarif ? 'Kein Tarif für diesen Status.' : undefined;
    return {
      striche: (
        <StricheFeld
          seite={seite}
          wert={e?.striche ?? ''}
          onWert={(w) => aendern(seite.id, { striche: w })}
          fehler={tarifFehler}
        />
      ),
      bar: (
        <BetragFeld
          size="md"
          aria-label={`Bar Seite ${seite.nummer}`}
          value={e?.barCent ?? null}
          onWert={(c) => aendern(seite.id, { barCent: c })}
          data-nav=""
        />
      ),
      abzahlung: (
        <BetragFeld
          size="md"
          aria-label={`Abzahlung Seite ${seite.nummer}`}
          value={e?.abzahlungCent ?? null}
          onWert={(c) => aendern(seite.id, { abzahlungCent: c })}
          data-nav=""
          data-abschluss={seite.id}
        />
      ),
    };
  };

  const abschlussKnopf = (z: Zeile) => (
    <Button
      type="button"
      variant={z.rechnung.leer ? 'default' : 'filled'}
      onClick={() => abschliessen(z.seite.id)}
      disabled={z.rechnung.leer}
    >
      Seite abschließen
    </Button>
  );
  const zeilenFehler = (id: string) =>
    fehler[id] && dialogId !== id ? (
      <Text size="sm" c="red" role="alert">
        {fehler[id]}
      </Text>
    ) : null;

  const dialogZeile = zeilen.find((z) => z.seite.id === dialogId);

  return (
    <Stack maw={1200}>
      <ZurueckLink to="/finanzen/buch">Buch</ZurueckLink>
      <Title order={2}>Abrechnen</Title>
      <Group gap={2}>
        <Text c="dimmed" size="sm">
          Seite für Seite: Striche, Bar und Abzahlung eintragen, die Seite abschließen, den neuen
          Saldo ins Buch schreiben. Mit Enter springst du zum nächsten Feld, Enter in „Abzahlung“
          schließt die Seite ab.
        </Text>
        <InfoHinweis feld="seitenweise Abrechnung" text={HILFE.buch.seitenweise} />
      </Group>
      {seiten.isPending && <Loader m="md" aria-label="Seiten werden geladen" />}
      {seiten.isError && <Alert color="red">Die Seiten konnten nicht geladen werden.</Alert>}
      {seiten.data && liste.length === 0 && (
        <Text c="dimmed">Es gibt noch keine aktiven Seiten. Lege zuerst Seiten an.</Text>
      )}
      {seiten.data && liste.length > 0 && (
        <Paper withBorder p="sm" radius="md">
          <Text fw={600}>
            {geschlossen.size} von {liste.length} Seiten abgeschlossen
          </Text>
          {geschlossen.size > 0 && (
            <Text size="sm" c="dimmed">
              Heute abgeschlossen: {summe((a) => a.striche)} Striche · Bar{' '}
              {centAnzeigen(summe((a) => a.barCent))} · Abzahlung{' '}
              {centAnzeigen(summe((a) => a.abzahlungCent))}
            </Text>
          )}
        </Paper>
      )}
      {seiten.data && liste.length > 0 && (
        <form
          ref={formRef}
          noValidate
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            const ziel = e.target as HTMLElement;
            const id = ziel.getAttribute('data-abschluss');
            if (e.key === 'Enter' && id && !e.nativeEvent.isComposing) {
              e.preventDefault();
              abschliessen(id);
              return;
            }
            enterWeiter(e, formRef.current, () => undefined);
          }}
        >
          {breit ? (
            <Table.ScrollContainer minWidth={900}>
              <Table verticalSpacing={4} tabularNums>
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
                    <Table.Th w={170} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {zeilen.map((z) => {
                    const a = abgeschlossen[z.seite.id];
                    if (a) {
                      return (
                        <Table.Tr key={z.seite.id} bg="var(--mantine-color-green-light)">
                          <Table.Td>{z.seite.nummer}</Table.Td>
                          <Table.Td>
                            <BuchInhaber seite={z.seite} />
                          </Table.Td>
                          <Table.Td />
                          <Table.Td style={BETRAG}>{a.striche || ''}</Table.Td>
                          <Table.Td style={BETRAG}>
                            {a.barCent ? centAnzeigen(a.barCent) : ''}
                          </Table.Td>
                          <Table.Td style={BETRAG}>
                            {a.abzahlungCent ? centAnzeigen(a.abzahlungCent) : ''}
                          </Table.Td>
                          <Table.Td colSpan={2}>
                            <EintragenHinweis a={a} />
                          </Table.Td>
                        </Table.Tr>
                      );
                    }
                    const f = felder(z);
                    return (
                      <Table.Tr
                        key={z.seite.id}
                        bg={z.rechnung.leer ? undefined : 'var(--mantine-color-blue-light)'}
                      >
                        <Table.Td>{z.seite.nummer}</Table.Td>
                        <Table.Td>
                          <BuchInhaber seite={z.seite} />
                          {zeilenFehler(z.seite.id)}
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
                        <Table.Td>{abschlussKnopf(z)}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            <Stack gap="sm">
              {zeilen.map((z) => {
                const a = abgeschlossen[z.seite.id];
                const f = felder(z);
                return (
                  <Paper
                    key={z.seite.id}
                    withBorder
                    p="sm"
                    radius="md"
                    bg={a ? 'var(--mantine-color-green-light)' : undefined}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Text style={{ minWidth: 0 }}>
                          <Text span c="dimmed">
                            {z.seite.nummer}{' '}
                          </Text>
                          <BuchInhaber seite={z.seite} verlinken={false} />
                        </Text>
                        {!a && <Saldo cent={z.seite.saldoCent} />}
                      </Group>
                      {a ? (
                        <>
                          <Text size="sm">
                            {a.striche} Striche · Bar {centAnzeigen(a.barCent)} · Abzahlung{' '}
                            {centAnzeigen(a.abzahlungCent)}
                          </Text>
                          <EintragenHinweis a={a} />
                        </>
                      ) : (
                        <>
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
                          {zeilenFehler(z.seite.id)}
                          {abschlussKnopf(z)}
                        </>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </form>
      )}
      {dialogZeile && (
        <SeiteAbschliessen
          zeile={dialogZeile}
          warnung={
            dialogZeile.rechnung.ueberzug && dialogZeile.seite.tarif
              ? ueberzugWarnung(
                  seitenName(dialogZeile.seite),
                  dialogZeile.rechnung,
                  dialogZeile.seite.tarif.maxUeberzugCent,
                )
              : null
          }
          laeuft={laeuft}
          fehler={fehler[dialogZeile.seite.id] || null}
          onSpeichern={() => void speichern(dialogZeile)}
          onClose={() => setDialogId(null)}
        />
      )}
      {warnungDialog.dialog}
    </Stack>
  );
}
