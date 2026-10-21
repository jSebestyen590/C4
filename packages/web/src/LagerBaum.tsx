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
  IconClipboardCheck,
  IconPackageExport,
  IconPackageImport,
} from '@tabler/icons-react';
import type { BaumEintrag } from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';
import { kinderTeilen, type Belegung } from './lagerAnsicht';
import { buchenMoeglich, inventurText, lagerAktionen } from './lagerAktionen';
import type { BestandsAnzeige } from './lagerBestand';
import type { LagerInventar } from './lagerInventar';
import { BestandListe, InventarListe } from './LagerInhalt';
import { LagerKachel } from './LagerKachel';

export interface LagerKnoten {
  id: string;
  parentId: string | null;
  name: string;
  beschreibung: string | null;
  position: number;
  archiviert: boolean;
}

/** Everything the tree needs from the page: permissions, state and the action callbacks. */
export interface LagerKontext {
  darfVerwalten: boolean;
  darfBuchen: boolean;
  /** Stock lines per node; null while hidden or not loaded. */
  bestand: Map<string, BestandsAnzeige[]> | null;
  /** Inventar (Ifcos, Gegenstände) per node; null while hidden or not loaded. */
  inventar: Map<string, LagerInventar> | null;
  /** Lagerort id -> id of its open Inventur. */
  offeneInventuren: Map<string, string>;
  /** Whether a node with children is expanded (default by depth, explicit choices win). */
  aufgeklappt: (id: string, tiefe: number) => boolean;
  umschalten: (id: string, tiefe: number) => void;
  /** Opens the bottom drawer of a tile. */
  kachelOeffnen: (k: LagerKnoten) => void;
  unterebene: (k: LagerKnoten) => void;
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
  return (
    <Stack gap="xs">
      <Paper withBorder p={4} opacity={node.archiviert ? 0.6 : 1}>
        <Group gap={4} wrap="nowrap" align="flex-start">
          {kinder.length > 0 ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size={44}
              aria-label={auf ? `${node.name} zuklappen` : `${node.name} aufklappen`}
              aria-expanded={auf}
              onClick={() => ctx.umschalten(node.id, tiefe)}
            >
              {auf ? <IconChevronDown size={20} /> : <IconChevronRight size={20} />}
            </ActionIcon>
          ) : (
            <Box w={44} h={44} style={{ flexShrink: 0 }} />
          )}
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }} py={10}>
            <Group gap="xs">
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                {node.name}
              </Text>
              {node.archiviert && (
                <Badge color="gray" variant="light">
                  Archiviert
                </Badge>
              )}
            </Group>
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
            <SimpleGrid cols={2} spacing="xs" maw={{ sm: 420 }}>
              <Button
                mih={44}
                leftSection={<IconPackageExport size={18} />}
                onClick={() => ctx.entnehmen(node)}
              >
                Entnehmen
              </Button>
              <Button
                mih={44}
                variant="light"
                leftSection={<IconPackageImport size={18} />}
                onClick={() => ctx.einlagern(node)}
              >
                Einlagern
              </Button>
            </SimpleGrid>
            <Button
              mih={44}
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
 * Indented, collapsible list of Lagerorte (no tree library). Children with their own children are
 * cards; leaves below the top level are compact tiles after the cards.
 */
export function LagerBaum({
  eintraege,
  tiefe = 0,
  ctx,
}: Readonly<{ eintraege: BaumEintrag<LagerKnoten>[]; tiefe?: number; ctx: LagerKontext }>) {
  // Top-level nodes always stay cards, even without children.
  const { karten, kacheln } =
    tiefe === 0 ? { karten: eintraege, kacheln: [] } : kinderTeilen(eintraege);
  const belegung = belegungVon(ctx);
  return (
    <Stack gap="xs">
      {karten.map((e) => (
        <LagerZeile key={e.node.id} eintrag={e} tiefe={tiefe} ctx={ctx} />
      ))}
      {kacheln.length > 0 && (
        <SimpleGrid cols={{ base: 4, sm: 6, md: 8 }} spacing="xs">
          {kacheln.map((e) => (
            <LagerKachel
              key={e.node.id}
              node={e.node}
              belegung={belegung}
              offeneInventur={ctx.offeneInventuren.has(e.node.id)}
              onClick={() => ctx.kachelOeffnen(e.node)}
            />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
