import type { GespeicherteEinstellung, MitgliedStatus } from '@c4/shared';
import type { BenachrichtigungenStore, PushAbo, VerlaufZeile } from './benachrichtigungen';

/** In-memory store for tests. `mitglieder` supplies the members (with status) at call time. */
export function createFakeBenachrichtigungenStore(
  mitglieder: () => readonly { sub: string; status: MitgliedStatus; deaktiviert?: boolean }[],
) {
  const abos: PushAbo[] = [];
  const einstellungen = new Map<string, GespeicherteEinstellung>(); // key: `${sub}|${art}`
  const versand = new Set<string>();
  const verlauf: (VerlaufZeile & { sub: string; schluessel: string | null })[] = [];
  let verlaufZaehler = 0;
  const fehler = { verlaufEintragen: false };
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
    verlaufEintragen: async (eintraege) => {
      if (fehler.verlaufEintragen) throw new Error('verlauf failed');
      const ids = new Map<string, string>();
      for (const e of eintraege) {
        let zeile =
          e.schluessel === null
            ? undefined
            : verlauf.find((v) => v.sub === e.sub && v.schluessel === e.schluessel);
        if (!zeile) {
          verlaufZaehler += 1;
          zeile = {
            id: `v${String(verlaufZaehler).padStart(5, '0')}`,
            sub: e.sub,
            schluessel: e.schluessel,
            art: e.art,
            titel: e.titel,
            text: e.text,
            url: e.url,
            erstellt: new Date(),
            gelesen: null,
          };
          verlauf.push(zeile);
        }
        ids.set(e.sub, zeile.id);
      }
      return ids;
    },
    verlaufSeite: async (sub, { arten, nurUngelesen, vor, limit }) =>
      verlauf
        .filter(
          (v) =>
            v.sub === sub &&
            (!arten || arten.includes(v.art)) &&
            (!nurUngelesen || v.gelesen === null) &&
            (!vor ||
              v.erstellt < vor.erstellt ||
              (v.erstellt.getTime() === vor.erstellt.getTime() && v.id < vor.id)),
        )
        .sort((a, b) => b.erstellt.getTime() - a.erstellt.getTime() || (a.id < b.id ? 1 : -1))
        .slice(0, limit)
        .map((v) => ({
          id: v.id,
          art: v.art,
          titel: v.titel,
          text: v.text,
          url: v.url,
          erstellt: v.erstellt,
          gelesen: v.gelesen,
        })),
    verlaufUngelesen: async (sub) =>
      verlauf.filter((v) => v.sub === sub && v.gelesen === null).length,
    verlaufGelesen: async (sub, id) => {
      const v = verlauf.find((x) => x.id === id && x.sub === sub);
      if (!v) return false;
      v.gelesen ??= new Date();
      return true;
    },
    verlaufAlleGelesen: async (sub, arten) => {
      for (const v of verlauf) {
        if (v.sub === sub && v.gelesen === null && (!arten || arten.includes(v.art))) {
          v.gelesen = new Date();
        }
      }
    },
    verlaufAufraeumen: async (vor) => {
      let n = 0;
      for (let i = verlauf.length - 1; i >= 0; i--) {
        if (verlauf[i]!.erstellt < vor) {
          verlauf.splice(i, 1);
          n += 1;
        }
      }
      return n;
    },
  };
  return { store, abos, einstellungen, versand, verlauf, fehler };
}
