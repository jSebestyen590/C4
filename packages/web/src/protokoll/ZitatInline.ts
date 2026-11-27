import { Mark, markInputRule, mergeAttributes } from '@tiptap/react';

/** Typed `""Text""` becomes an inline quote (the quote marks are removed). */
const ZITAT_EINGABE = /(?:^|\s)(""(?!\s+"")([^"]+)"")$/;

/**
 * Inline quote: a word-for-word quote in the middle of a sentence, shown in „…“, italic and dimmed
 * (see `protokoll.css`). The block quote (`blockquote`) is the quote as its own paragraph.
 */
export const ZitatInline = Mark.create({
  name: 'zitatInline',
  // Typing at the end of a quote continues it (also after /zitat); ArrowRight at the end leaves it.
  inclusive: true,

  parseHTML() {
    return [{ tag: 'q' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['q', mergeAttributes({ class: 'pk-zitat-inline' }, HTMLAttributes), 0];
  },

  addKeyboardShortcuts() {
    return {
      // At the end of the quote the arrow key only drops the active mark: the next typed text is outside.
      ArrowRight: ({ editor }) => {
        const { selection, storedMarks } = editor.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if (!this.type.isInSet(storedMarks ?? $from.marks())) return false;
        if ($from.nodeAfter && this.type.isInSet($from.nodeAfter.marks)) return false;
        return editor.commands.command(({ tr }) => {
          tr.removeStoredMark(this.type);
          return true;
        });
      },
    };
  },

  addInputRules() {
    return [markInputRule({ find: ZITAT_EINGABE, type: this.type })];
  },
});
