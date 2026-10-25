import {
  IconArchive,
  IconArchiveOff,
  IconArrowDown,
  IconArrowUp,
  IconArrowsExchange,
  IconClipboardCheck,
  IconEdit,
  IconListDetails,
  IconPackageExport,
  IconPackageImport,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import type { Aktion } from './AktionsMenue';
import { ifcosAufPlatz } from './ifcoPlatz';
import type { LagerKnoten, LagerKontext } from './LagerBaum';

/** Inventur action text of a node: continue an open one or start a new one. */
export const inventurText = (ctx: LagerKontext, node: LagerKnoten) =>
  ctx.offeneInventuren.has(node.id) ? 'Inventur fortsetzen' : 'Inventur starten';

/** Whether buchen actions (Entnehmen, Einlagern, Umlagern, Inventur) apply to a node. */
export const buchenMoeglich = (ctx: LagerKontext, node: LagerKnoten) =>
  ctx.darfBuchen &&
  !node.archiviert &&
  !(ctx.ifcoDaten && ifcosAufPlatz(ctx.ifcoDaten.ifcos, node.id).length > 0);

/** The single definition of the node actions with their permission rules, shared by card menu and tile drawer. */
export function lagerAktionen(node: LagerKnoten, ctx: LagerKontext): Aktion[] {
  const inventurMoeglich = buchenMoeglich(ctx, node);
  // Entnehmen and Umlagern need stock somewhere in the subtree.
  const entnahmeMoeglich = inventurMoeglich && ctx.hatBestand(node.id);
  return [
    {
      text: 'Unterebene anlegen',
      icon: <IconPlus size={18} />,
      onClick: () => ctx.unterebene(node),
      sichtbar:
        ctx.darfVerwalten && !node.archiviert && node.art === null && node.ifcoHoeheCm === null,
    },
    {
      text: 'Böden hinzufügen',
      icon: <IconPlus size={18} />,
      onClick: () => ctx.boeden(node),
      sichtbar: ctx.darfVerwalten && !node.archiviert && node.art === 'regal',
    },
    {
      text: 'Bearbeiten',
      icon: <IconEdit size={18} />,
      onClick: () => ctx.bearbeiten(node),
      sichtbar: ctx.darfVerwalten,
    },
    {
      text: 'Nach oben',
      icon: <IconArrowUp size={18} />,
      onClick: () => ctx.verschieben(node, -1),
      disabled: !ctx.kannVerschieben(node, -1),
      sichtbar: ctx.darfVerwalten && node.art !== 'regalboden',
    },
    {
      text: 'Nach unten',
      icon: <IconArrowDown size={18} />,
      onClick: () => ctx.verschieben(node, 1),
      disabled: !ctx.kannVerschieben(node, 1),
      sichtbar: ctx.darfVerwalten && node.art !== 'regalboden',
    },
    {
      text: 'Warenliste bearbeiten',
      icon: <IconListDetails size={18} />,
      onClick: () => ctx.waren(node),
      sichtbar: ctx.darfVerwalten && !node.archiviert,
    },
    {
      text: 'Entnehmen',
      primaer: true,
      icon: <IconPackageExport size={18} />,
      onClick: () => ctx.entnehmen(node),
      sichtbar: entnahmeMoeglich,
      trenner: ctx.darfVerwalten,
    },
    {
      text: 'Einlagern',
      primaer: true,
      icon: <IconPackageImport size={18} />,
      onClick: () => ctx.einlagern(node),
      sichtbar: inventurMoeglich,
      trenner: ctx.darfVerwalten && !entnahmeMoeglich,
    },
    {
      text: 'Umlagern',
      primaer: true,
      icon: <IconArrowsExchange size={18} />,
      onClick: () => ctx.umlagern(node),
      sichtbar: entnahmeMoeglich,
    },
    {
      text: inventurText(ctx, node),
      primaer: true,
      icon: <IconClipboardCheck size={18} />,
      onClick: () => ctx.inventur(node),
      sichtbar: inventurMoeglich,
    },
    {
      text: node.archiviert ? 'Wiederherstellen' : 'Archivieren',
      icon: node.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
      onClick: () => ctx.archivieren(node),
      sichtbar: ctx.darfVerwalten,
      trenner: true,
    },
    {
      text: 'Löschen',
      icon: <IconTrash size={18} />,
      color: 'red',
      onClick: () => ctx.loeschen(node),
      sichtbar: ctx.darfVerwalten,
    },
  ];
}
