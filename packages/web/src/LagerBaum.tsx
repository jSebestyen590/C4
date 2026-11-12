import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconBox,
  IconClipboardCheck,
  IconLayoutRows,
  IconPackageExport,
  IconPackageImport,
} from '@tabler/icons-react';
import { LAGERORT_ART_LABELS, type BaumEintrag, type LagerortArt } from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';
import { kachelBeschriftung, kinderTeilen, type Belegung } from './lagerAnsicht';
import { buchenMoeglich, inventurText, lagerAktionen } from './lagerAktionen';
import type { BestandsAnzeige } from './lagerBestand';
import type { LagerInventar } from './lagerInventar';
import { BestandListe, IfcoPlatzInfo, InventarListe } from './LagerInhalt';
import type { IfcoEintrag, IfcoTypEintrag } from './inventarDaten';
import { ifcoPlatzMasse } from './ifcoPlatz';
import { LagerKachel } from './LagerKachel';

export interface LagerKnoten {
  id: string;
  parentId: string | null;
  name: string;
  beschreibung: string | null;
  position: number;
  archiviert: boolean;
  /** null = normal Lagerort. */
  art: LagerortArt | null;
  /** IFCO-Lagerplatz: height of every half-column in cm; null = normal Lagerort. */
  ifcoHoeheCm: number | null;
  /** IFCO-Lagerplatz: number of 60×40 footprints; set together with `ifcoHoeheCm`. */
  ifcoStellflaechen: number | null;
}

/** Everything the tree needs from the page: permissions, state and the action callbacks. */
export interface LagerKontext {
  darfVerwalten: boolean;
  darfBuchen: boolean;
  /** Stock lines per node; null while hidden or not loaded. */
  bestand: Map<string, BestandsAnzeige[]> | null;
  /** Inventar (IFCOs, Gegenstände) per node; null while hidden or not loaded. */
  inventar: Map<string, LagerInventar> | null;
  /** IFCOs and IFCO types for the capacity of IFCO-Lagerplätze; null while not loaded. */
  ifcoDaten: { ifcos: IfcoEintrag[]; typen: IfcoTypEintrag[] } | null;
  /** Lagerort id -> id of its open Inventur. */
  offeneInventuren: Map<string, string>;
  /** Whether the node or anything below it holds Waren stock (true while stock is loading). */
  hatBestand: (id: string) => boolean;
  /** Whether a node with children is expanded (default by depth, explicit choices win). */
  aufgeklappt: (id: string, tiefe: number) => boolean;
  umschalten: (id: string, tiefe: number) => void;
  /** Opens the bottom drawer of a tile. */
  kachelOeffnen: (k: LagerKnoten) => void;
  unterebene: (k: LagerKnoten) => void;
  /** Opens the dialog that appends Regalböden to a Regal. */
  boeden: (k: LagerKnoten) => void;
  bearbeiten: (k: LagerKnoten) => void;
  kannVerschieben: (k: LagerKnoten, richtung: -1 | 1) => boolean;
  verschieben: (k: LagerKnoten, richtung: -1 | 1) => void;
  waren: (k: LagerKnoten) => void;
  entnehmen: (k: LagerKnoten) => void;
  einlagern: (k: LagerKnoten) => void;
  umlagern: (k: LagerKnoten) => void;
  inventur: (k: LagerKnoten) => void;
  archivieren: (k: LagerKnoten) => void;
  loeschen: (k: LagerKnoten) => void;
}

export const belegungVon = (ctx: LagerKontext): Belegung => ({
  bestand: ctx.bestand,
  inventar: ctx.inventar,
});

function LagerZeile({
  eintrag,
  tiefe,
  ctx,
}: Readonly<{ eintrag: BaumEintrag<LagerKnoten>; tiefe: number; ctx: LagerKontext }>) {
  const { node, kinder } = eintrag;
  const auf = ctx.aufgeklappt(node.id, tiefe);
  const inventurId = ctx.offeneInventuren.get(node.id);
  const inventurMoeglich = buchenMoeglich(ctx, node);
  const bestand = ctx.bestand?.get(node.id);
  const inventar = ctx.inventar?.get(node.id);
  const ifcoPlatz = ifcoPlatzMasse(node);
  return (
    <Stack gap="xs">
      <Paper withBorder p={4} opacity={node.archiviert ? 0.6 : 1}>
        <Group gap={4} wrap="nowrap" align="flex-start">
          {kinder.length > 0 ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size={42}
              aria-label={auf ? `${node.name} zuklappen` : `${node.name} aufklappen`}
              aria-expanded={auf}
              onClick={() => ctx.umschalten(node.id, tiefe)}
            >
              {auf ? <IconChevronDown size={20} /> : <IconChevronRight size={20} />}
            </ActionIcon>
          ) : (
            <Box w={42} h={42} style={{ flexShrink: 0 }} />
          )}
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }} py={10}>
            <Group gap="xs">
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                {node.name}
              </Text>
              {node.art === 'regal' && (
                <Badge variant="light" leftSection={<IconLayoutRows size={12} aria-hidden />}>
                  {LAGERORT_ART_LABELS.regal}
                </Badge>
              )}
              {ifcoPlatz && (
                <Badge variant="light" leftSection={<IconBox size={12} aria-hidden />}>
                  IFCO-Lagerplatz
                </Badge>
              )}
              {node.archiviert && (
                <Badge color="gray" variant="light">
                  Archiviert
                </Badge>
              )}
            </Group>
            {ifcoPlatz && (
              <IfcoPlatzInfo lagerortId={node.id} masse={ifcoPlatz} daten={ctx.ifcoDaten} />
            )}
            {node.beschreibung && (
              <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                {node.beschreibung}
              </Text>
            )}
            {bestand && <BestandListe zeilen={bestand} />}
            {inventar && <InventarListe inventar={inventar} />}
          </Stack>
          <AktionsMenue label={`Aktionen für ${node.name}`} aktionen={lagerAktionen(node, ctx)} />
        </Group>
        {tiefe === 0 && inventurMoeglich && (
          <Stack gap="xs" px={8} pb={8}>
            <SimpleGrid cols={ctx.hatBestand(node.id) ? 2 : 1} spacing="xs" maw={{ sm: 420 }}>
              {ctx.hatBestand(node.id) && (
                <Button
                  mih={42}
                  leftSection={<IconPackageExport size={18} />}
                  onClick={() => ctx.entnehmen(node)}
                >
                  Entnehmen
                </Button>
              )}
              <Button
                mih={42}
                variant="light"
                leftSection={<IconPackageImport size={18} />}
                onClick={() => ctx.einlagern(node)}
              >
                Einlagern
              </Button>
            </SimpleGrid>
            <Button
              mih={42}
              w={{ base: '100%', sm: 'fit-content' }}
              variant={inventurId ? 'filled' : 'default'}
              leftSection={<IconClipboardCheck size={18} />}
              onClick={() => ctx.inventur(node)}
            >
              {inventurText(ctx, node)}
            </Button>
          </Stack>
        )}
      </Paper>
      {kinder.length > 0 && (
        <Collapse expanded={auf}>
          <Box
            ml={10}
            pl={8}
            style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
          >
            <LagerBaum eintraege={kinder} tiefe={tiefe + 1} ctx={ctx} />
          </Box>
        </Collapse>
      )}
    </Stack>
  );
}

/**
 * Indented, collapsible list of Lagerorte (no tree library). Every node is a card, except the
 * Regalböden of a Regal: they are compact tiles after the cards.
 */
export function LagerBaum({
  eintraege,
  tiefe = 0,
  ctx,
}: Readonly<{ eintraege: BaumEintrag<LagerKnoten>[]; tiefe?: number; ctx: LagerKontext }>) {
  const { karten, kacheln } = kinderTeilen(eintraege);
  const belegung = belegungVon(ctx);
  const beschriftung = kachelBeschriftung(kacheln.map((e) => e.node.name));
  return (
    <Stack gap="xs">
      {karten.map((e) => (
        <LagerZeile key={e.node.id} eintrag={e} tiefe={tiefe} ctx={ctx} />
      ))}
      {kacheln.length > 0 && (
        <Stack gap={4}>
          {beschriftung.praefix && (
            <Text size="xs" c="dimmed" fw={600}>
              {beschriftung.praefix}
            </Text>
          )}
          <SimpleGrid cols={{ base: 4, sm: 6, md: 8 }} spacing="xs">
            {kacheln.map((e, i) => (
              <LagerKachel
                key={e.node.id}
                node={e.node}
                anzeigeName={beschriftung.kurz[i]}
                belegung={belegung}
                offeneInventur={ctx.offeneInventuren.has(e.node.id)}
                onClick={() => ctx.kachelOeffnen(e.node)}
              />
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}
