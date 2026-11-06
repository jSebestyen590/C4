import { Font } from '@react-pdf/renderer';

export const PDF_SCHRIFT = 'Noto Sans';

/** Where the four faces of the font come from (URLs in the browser, file paths in tests). */
export interface SchriftQuellen {
  normal: string;
  fett: string;
  kursiv: string;
  fettKursiv: string;
}

let registriert: SchriftQuellen | null = null;

/** Registers the font once per source set; the PDF has no built-in font with German typography. */
export function schriftenRegistrieren(q: SchriftQuellen): void {
  if (registriert && Object.values(registriert).join('|') === Object.values(q).join('|')) return;
  Font.register({
    family: PDF_SCHRIFT,
    fonts: [
      { src: q.normal, fontWeight: 400, fontStyle: 'normal' },
      { src: q.fett, fontWeight: 700, fontStyle: 'normal' },
      { src: q.kursiv, fontWeight: 400, fontStyle: 'italic' },
      { src: q.fettKursiv, fontWeight: 700, fontStyle: 'italic' },
    ],
  });
  // No hyphenation: the default dictionary is English and would break German words wrongly.
  Font.registerHyphenationCallback((wort) => [wort]);
  registriert = q;
}
