/** Channels a member can be reached on best. The database keeps them comma-separated. */
export const KONTAKTKANAELE = ['whatsapp', 'telegram', 'signal', 'discord', 'mail'] as const;
export type Kontaktkanal = (typeof KONTAKTKANAELE)[number];

/** Channels that are reached by phone number; choosing one requires a readable number. */
export const TELEFON_KANAELE: readonly Kontaktkanal[] = ['whatsapp', 'signal', 'telegram'];

/**
 * Phone number in international form without separators (digits only, no "+"), or null when it
 * cannot be read unambiguously. "+49 171 1234567" and "0171/1234567" (German default) both give
 * "491711234567".
 */
export function telefonNormalisieren(telefon: string): string | null {
  const bereinigt = telefon.trim().replace(/[\s\-/().]/g, '');
  if (!/^\+?\d+$/.test(bereinigt)) return null;
  let ziffern: string;
  if (bereinigt.startsWith('+')) ziffern = bereinigt.slice(1);
  else if (bereinigt.startsWith('00')) ziffern = bereinigt.slice(2);
  else if (bereinigt.startsWith('0')) ziffern = `49${bereinigt.slice(1)}`;
  else return null;
  return /^[1-9]\d{7,14}$/.test(ziffern) ? ziffern : null;
}

/**
 * Link that opens the app of a channel for a member, or null when the needed detail is missing.
 * Discord has no link by username, so it never gets one.
 */
export function kontaktLink(
  kanal: Kontaktkanal,
  angaben: { telefon: string | null; email: string | null },
): string | null {
  if (kanal === 'mail') return angaben.email ? `mailto:${angaben.email}` : null;
  const nummer = angaben.telefon ? telefonNormalisieren(angaben.telefon) : null;
  if (!nummer) return null;
  switch (kanal) {
    case 'whatsapp':
      return `https://wa.me/${nummer}`;
    case 'signal':
      return `https://signal.me/#p/+${nummer}`;
    case 'telegram':
      return `https://t.me/+${nummer}`;
    default:
      return null;
  }
}

/** Escapes a vCard 3.0 text value. */
function vcardText(wert: string): string {
  return wert
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Folds a content line at 75 characters; continuation lines start with one space. */
function vcardFalten(zeile: string): string {
  if (zeile.length <= 75) return zeile;
  const teile = [zeile.slice(0, 75)];
  for (let i = 75; i < zeile.length; i += 74) teile.push(` ${zeile.slice(i, i + 74)}`);
  return teile.join('\r\n');
}

/** What goes into the contact card of a member; empty values are left out. */
export interface VcardAngaben {
  vorname: string;
  nachname: string;
  username?: string | null;
  telefon?: string | null;
  email?: string | null;
  /** `YYYY-MM-DD` */
  geburtsdatum?: string | null;
  adresse?: string | null;
  discordName?: string | null;
  /** Base64 of a JPEG; added as PHOTO. */
  fotoBase64?: string | null;
}

/** vCard 3.0 (CRLF lines) that iOS and Android both import as a new contact. */
export function vcardErstellen(a: VcardAngaben): string {
  const vorname = a.vorname.trim();
  const nachname = a.nachname.trim();
  const username = a.username?.trim() ?? '';
  const name = `${vorname} ${nachname}`.trim() || username;
  const zeilen: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  zeilen.push(`N:${vcardText(nachname)};${vcardText(vorname)};;;`);
  zeilen.push(`FN:${vcardText(name)}`);
  if (username) zeilen.push(`NICKNAME:${vcardText(username)}`);
  zeilen.push('ORG:C4');
  const telefon = a.telefon?.trim();
  if (telefon) {
    const nummer = telefonNormalisieren(telefon);
    zeilen.push(`TEL;TYPE=CELL:${nummer ? `+${nummer}` : vcardText(telefon)}`);
  }
  const email = a.email?.trim();
  if (email) zeilen.push(`EMAIL;TYPE=INTERNET:${vcardText(email)}`);
  if (a.geburtsdatum) zeilen.push(`BDAY:${a.geburtsdatum}`);
  const adresse = a.adresse?.trim();
  if (adresse) zeilen.push(`ADR;TYPE=HOME:;;${vcardText(adresse)};;;;`);
  const discord = a.discordName?.trim();
  if (discord) zeilen.push(`NOTE:${vcardText(`Discord: ${discord}`)}`);
  if (a.fotoBase64) zeilen.push(`PHOTO;ENCODING=b;TYPE=JPEG:${a.fotoBase64}`);
  zeilen.push('END:VCARD');
  return `${zeilen.map(vcardFalten).join('\r\n')}\r\n`;
}
