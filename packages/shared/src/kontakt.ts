/** Channels a member can be reached on best. The database keeps them comma-separated. */
export const KONTAKTKANAELE = ['whatsapp', 'telegram', 'signal', 'discord', 'mail'] as const;
export type Kontaktkanal = (typeof KONTAKTKANAELE)[number];
