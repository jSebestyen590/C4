/** Channels a member can be reached on best. The database keeps them comma-separated. */
export const KONTAKTKANAELE = ['whatsapp', 'telegram', 'signal', 'discord', 'mail'] as const;
export type Kontaktkanal = (typeof KONTAKTKANAELE)[number];

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
