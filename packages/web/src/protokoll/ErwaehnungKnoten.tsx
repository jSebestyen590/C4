import { Text } from '@mantine/core';
import {
  mergeAttributes,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { ERWAEHNUNG_TYP, erwaehnungAttrs } from '@c4/shared';
import { StatusName } from '../StatusAnzeige';
import { erwaehnungPersonName, GRUPPE_TITEL } from './erwaehnungLogik';
import { useProtokollKontext } from './kontext';

/**
 * Inline, atomic @mention of a member (`art: 'person'`, `sub`) or a group (`art: 'gruppe'`, `gruppe`).
 * Only its attributes are stored; the name is looked up when shown, so renamed members stay correct.
 */
export const ErwaehnungKnoten = Node.create({
  name: ERWAEHNUNG_TYP,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      art: {
        default: 'person',
        parseHTML: (el) => el.getAttribute('data-art'),
        renderHTML: (attrs) => ({ 'data-art': attrs.art as string }),
      },
      sub: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-sub'),
        renderHTML: (attrs) => (attrs.sub ? { 'data-sub': attrs.sub as string } : {}),
      },
      gruppe: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-gruppe'),
        renderHTML: (attrs) => (attrs.gruppe ? { 'data-gruppe': attrs.gruppe as string } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-erwaehnung]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = erwaehnungAttrs(node.attrs);
    const text = attrs?.art === 'gruppe' && attrs.gruppe ? GRUPPE_TITEL[attrs.gruppe] : '';
    return ['span', mergeAttributes(HTMLAttributes, { 'data-erwaehnung': '' }), `@${text}`];
  },

  renderText({ node }) {
    const attrs = erwaehnungAttrs(node.attrs);
    return attrs?.art === 'gruppe' && attrs.gruppe ? `@${GRUPPE_TITEL[attrs.gruppe]}` : '@';
  },

  addNodeView() {
    return ReactNodeViewRenderer(ErwaehnungAnsicht, { as: 'span' });
  },
});

/** A person in the color of their status (bold), a group in normal weight. */
function ErwaehnungAnsicht({ node, selected }: ReactNodeViewProps) {
  const attrs = erwaehnungAttrs(node.attrs);
  const { teilnahme, ems, mitglieder } = useProtokollKontext();
  let inhalt;
  if (attrs?.art === 'person' && attrs.sub) {
    const m = [...teilnahme, ...ems, ...mitglieder].find((p) => p.sub === attrs.sub);
    inhalt = m ? (
      <StatusName status={m.status}>{`@${erwaehnungPersonName(m)}`}</StatusName>
    ) : (
      <Text component="span" c="dimmed">
        @Unbekannt
      </Text>
    );
  } else if (attrs?.art === 'gruppe' && attrs.gruppe) {
    inhalt = <span>{`@${GRUPPE_TITEL[attrs.gruppe]}`}</span>;
  } else {
    inhalt = (
      <Text component="span" c="dimmed">
        @
      </Text>
    );
  }
  return (
    <NodeViewWrapper
      as="span"
      className="protokoll-erwaehnung"
      data-selected={selected || undefined}
      data-erwaehnung=""
    >
      {inhalt}
    </NodeViewWrapper>
  );
}
