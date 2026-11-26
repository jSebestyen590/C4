import { Mark, markInputRule, mergeAttributes } from '@tiptap/react';

/** Typed `""Text""` becomes an inline quote (the quote marks are removed). */
const ZITAT_EINGABE = /(?:^|\s)(""(?!\s+"")([^"]+)"")$/;

/**
 * Inline quote: a word-for-word quote in the middle of a sentence, shown in „…“, italic and dimmed
 * (see `protokoll.css`). The block quote (`blockquote`) is the quote as its own paragraph.
 */
export const ZitatInline = Mark.create({
  name: 'zitatInline',
  // Typing at the end of a quote continues outside of it.
  inclusive: false,

  parseHTML() {
    return [{ tag: 'q' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['q', mergeAttributes({ class: 'pk-zitat-inline' }, HTMLAttributes), 0];
  },

  addInputRules() {
    return [markInputRule({ find: ZITAT_EINGABE, type: this.type })];
  },
});
