import type { GespeicherteEinstellung, MitgliedStatus } from '@c4/shared';
import type { BenachrichtigungenStore, PushAbo } from './benachrichtigungen';

/** In-memory store for tests. `mitglieder` supplies the members (with status) at call time. */
export function createFakeBenachrichtigungenStore(
  mitglieder: () => readonly { sub: string; status: MitgliedStatus; deaktiviert?: boolean }[],
) {
  const abos: PushAbo[] = [];
  const einstellungen = new Map<string, GespeicherteEinstellung>(); // key: `${sub}|${art}`
  const versand = new Set<string>();
  const store: BenachrichtigungenStore = {
    vapid: async () => ({ publicKey: 'public-key', privateKey: 'private-key' }),
    aboSpeichern: async (sub, abo) => {
      const vorhanden = abos.findIndex((a) => a.endpoint === abo.endpoint);
      const neu = {
        id: `abo${abos.length + 1}`,
        mitgliedSub: sub,
        endpoint: abo.endpoint,
        p256dh: abo.keys.p256dh,
        auth: abo.keys.auth,
      };
      if (vorhanden >= 0) abos[vorhanden] = neu;
      else abos.push(neu);
    },
    aboLoeschen: async (sub, endpoint) => {
      const i = abos.findIndex((a) => a.endpoint === endpoint && a.mitgliedSub === sub);
      if (i >= 0) abos.splice(i, 1);
    },
    aboEntfernen: async (endpoint) => {
      const i = abos.findIndex((a) => a.endpoint === endpoint);
      if (i >= 0) abos.splice(i, 1);
    },
    aboVorhanden: async (sub, endpoint) =>
      abos.some((a) => a.mitgliedSub === sub && a.endpoint === endpoint),
    abosVon: async (subs) => abos.filter((a) => subs.includes(a.mitgliedSub)),
    empfaenger: async (art, subs) =>
      mitglieder()
        .filter((m) => !m.deaktiviert && (!subs || subs.includes(m.sub)))
        .map((m) => ({
          sub: m.sub,
          status: m.status,
          gespeichert: einstellungen.get(`${m.sub}|${art}`) ?? null,
        })),
    mitgliedEinstellungen: async (sub) => {
      const m = mitglieder().find((x) => x.sub === sub);
      if (!m) return undefined;
      const gespeichert = new Map<string, GespeicherteEinstellung>();
      for (const [k, v] of einstellungen) {
        const [s, art] = k.split('|') as [string, string];
        if (s === sub) gespeichert.set(art, v);
      }
      return { status: m.status, gespeichert };
    },
    einstellungSetzen: async (sub, art, aktiv, minuten) => {
      einstellungen.set(`${sub}|${art}`, { aktiv, minuten });
    },
    versandBelegen: async (schluessel) => {
      if (versand.has(schluessel)) return false;
      versand.add(schluessel);
      return true;
    },
    versandFreigeben: async (schluessel) => {
      versand.delete(schluessel);
    },
  };
  return { store, abos, einstellungen, versand };
}
