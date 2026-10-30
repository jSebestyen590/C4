import type { Halter } from '@c4/shared';
import type { Benachrichtigungen } from './benachrichtigungen';

// Key side of the notification module: tells the other party of an Übergabe. The type cannot be
// switched off (see BENACHRICHTIGUNGS_ARTEN).

const UEBERGABE = 'schluessel.uebergabe';

type Sender = Pick<Benachrichtigungen, 'senden'>;

export interface UebergabeMeldung {
  schluessel: { id: string; name: string };
  von: Halter;
  an: Halter;
  /** Sub of the member who recorded the Übergabe; they get no message. */
  akteur: string;
  /** Display name (username, else full name) of a member. */
  name: (sub: string) => string;
}

const istMitglied = (h: Halter, sub: string) => h?.art === 'mitglied' && h.sub === sub;

/** Message texts per recipient; members without the app and the acting member get none. */
export function uebergabeTexte(m: UebergabeMeldung): { sub: string; text: string }[] {
  const { von, an, akteur, name } = m;
  const halterName = (h: NonNullable<Halter>) => (h.art === 'mitglied' ? name(h.sub) : h.name);
  const texte: { sub: string; text: string }[] = [];
  if (an?.art === 'mitglied' && an.sub !== akteur) {
    texte.push({
      sub: an.sub,
      text: istMitglied(von, akteur)
        ? `${name(akteur)} hat dir den Schlüssel übergeben.`
        : von
          ? `${name(akteur)} hat eingetragen, dass du den Schlüssel von ${halterName(von)} bekommen hast.`
          : `${name(akteur)} hat dir den Schlüssel zugewiesen.`,
    });
  }
  if (von?.art === 'mitglied' && von.sub !== akteur) {
    texte.push({
      sub: von.sub,
      text: istMitglied(an, akteur)
        ? `${name(akteur)} hat den Schlüssel von dir bekommen.`
        : an
          ? `${name(akteur)} hat eingetragen, dass du den Schlüssel an ${halterName(an)} weitergegeben hast.`
          : `${name(akteur)} hat eingetragen, dass du den Schlüssel abgegeben hast.`,
    });
  }
  return texte;
}

export async function meldeUebergabe(sender: Sender, m: UebergabeMeldung): Promise<void> {
  await Promise.all(
    uebergabeTexte(m).map(({ sub, text }) =>
      sender.senden({
        subs: [sub],
        art: UEBERGABE,
        titel: `Schlüssel „${m.schluessel.name}“`,
        text,
        url: `/app/schluessel/${m.schluessel.id}`,
      }),
    ),
  );
}
