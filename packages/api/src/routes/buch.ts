import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  buchAbrechnungEingabeSchema,
  buchNummerSchema,
  buchJahre,
  buchRangliste,
  buchSeiteEingabeSchema,
  buchStornoSchema,
  buchTarifEingabeSchema,
  buchZeileLeer,
  formatEuro,
  gueltigerTarif,
  heuteBerlin,
  istUeberzug,
  type BuchAbrechnungErgebnisDto,
  type BuchEintragDto,
  type BuchMeineDto,
  type BuchRanglisteDto,
  type BuchSeiteDetailDto,
  type BuchSeiteDto,
  type BuchTarif,
  type BuchTarifDto,
  type FinanzMitgliedDto,
  type MitgliedStatus,
} from '@c4/shared';
import { bestEffort } from '../benachrichtigungen';
import {
  BuchKonflikt,
  BuchUngueltig,
  SEITE_NICHT_AKTIV,
  type BuchSeiteMitSaldo,
  type BuchVerlaufEintrag,
} from '../buch';
import type { BuchTarifRow } from '../db/schema';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

const STATUS_NAME: Record<MitgliedStatus, string> = {
  anwaerter: 'Anwärter:in',
  mitglied: 'Mitglied',
  em: 'EM',
  extern: 'Extern',
};

const alsTarif = (t: BuchTarifRow): BuchTarif & { id: string } => ({
  id: t.id,
  status: t.status,
  strichwertCent: t.strichwertCent,
  maxUeberzugCent: t.maxUeberzugCent,
  gueltigAb: t.gueltigAb,
  erstelltAm: t.erstelltAm.toISOString(),
});

export const buchRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, buchLesen, finanzenLesen, finanzenBuchen, finanzenVerwalten, gefunden } = ctx;

  /** Display data of members (usernames come from Cognito); null without a profile. */
  const mitglieder = async () => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const zeilen = new Map(rows.map((r) => [r.sub, r]));
    return (sub: string): FinanzMitgliedDto | null => {
      const zeile = zeilen.get(sub);
      if (!zeile) return null;
      return {
        sub,
        username: konten.get(sub)?.username ?? null,
        vorname: zeile.vorname,
        nachname: zeile.nachname,
        status: zeile.status,
        anrede: zeile.anrede ?? 'neutral',
      };
    };
  };
  type MitgliedSuche = Awaited<ReturnType<typeof mitglieder>>;

  /** Status that selects the tarif of a page: the member's current one, `extern` for external names. */
  const tarifStatus = (s: BuchSeiteMitSaldo, mitglied: MitgliedSuche): MitgliedStatus =>
    (s.seite.mitgliedSub ? mitglied(s.seite.mitgliedSub)?.status : undefined) ?? 'extern';

  const tarifFuer = (s: BuchSeiteMitSaldo, mitglied: MitgliedSuche, tarife: BuchTarifRow[]) =>
    gueltigerTarif(tarife.map(alsTarif), tarifStatus(s, mitglied), heuteBerlin());

  const seiteDto = (
    s: BuchSeiteMitSaldo,
    mitglied: MitgliedSuche,
    tarife: BuchTarifRow[],
  ): BuchSeiteDto => {
    const tarif = tarifFuer(s, mitglied, tarife);
    return {
      id: s.seite.id,
      nummer: s.seite.nummer,
      mitglied: s.seite.mitgliedSub ? mitglied(s.seite.mitgliedSub) : null,
      externName: s.seite.externName,
      archiviert: s.seite.archiviertAm !== null,
      saldoCent: s.saldoCent,
      tarif: tarif
        ? { strichwertCent: tarif.strichwertCent, maxUeberzugCent: tarif.maxUeberzugCent }
        : null,
      ueberzug: tarif ? istUeberzug(s.saldoCent, tarif.maxUeberzugCent) : false,
    };
  };

  const eintragDto = (v: BuchVerlaufEintrag, mitglied: MitgliedSuche): BuchEintragDto => ({
    id: v.row.id,
    abrechnungId: v.row.abrechnungId,
    stornoVon: v.row.stornoVon,
    storniert: v.storniert,
    striche: v.row.striche,
    strichwertCent: v.row.strichwertCent,
    barCent: v.row.barCent,
    abzahlungCent: v.row.abzahlungCent,
    betragCent: v.row.betragCent,
    text: v.row.text,
    erstelltAm: v.row.erstelltAm.toISOString(),
    erstelltVon: mitglied(v.row.erstelltVon),
  });

  const detailDto = async (
    s: BuchSeiteMitSaldo,
    mitglied: MitgliedSuche,
    tarife: BuchTarifRow[],
  ): Promise<BuchSeiteDetailDto> => ({
    ...seiteDto(s, mitglied, tarife),
    verlauf: (await deps.buch.verlauf(s.seite.id)).map((v) => eintragDto(v, mitglied)),
    nummernVerlauf: (await deps.buch.seitenVerlauf(s.seite.id)).map((v) => ({
      id: v.id,
      art: v.art,
      nummer: v.nummer,
      erstelltAm: v.erstelltAm.toISOString(),
      erstelltVon: mitglied(v.erstelltVon),
    })),
  });

  const buchFehler = (err: unknown): never => {
    if (err instanceof BuchUngueltig) throw new HTTPException(400, { message: err.message });
    if (err instanceof BuchKonflikt) throw new HTTPException(409, { message: err.message });
    throw err;
  };

  return (
    new Hono<AuthEnv>()
      // The caller's own active page(s) with the Verlauf.
      .get('/buch/meine', auth, buchLesen, async (c) => {
        const [seiten, tarife, mitglied] = await Promise.all([
          deps.buch.seitenVon(c.get('user').sub),
          deps.buch.tarife(),
          mitglieder(),
        ]);
        const dto: BuchMeineDto = {
          seiten: await Promise.all(seiten.map((s) => detailDto(s, mitglied, tarife))),
        };
        return c.json(dto);
      })
      // Turnover ranking for a year or `alle`; never exposes balances.
      .get('/buch/rangliste', auth, buchLesen, async (c) => {
        const wert = c.req.query('jahr') ?? 'alle';
        const jahr = wert === 'alle' ? null : Number(wert);
        if (jahr !== null && !Number.isInteger(jahr)) {
          throw new HTTPException(400, { message: 'Ungültiges Jahr.' });
        }
        const [rows, mitglied] = await Promise.all([deps.buch.fuerRangliste(), mitglieder()]);
        const schluessel = (r: (typeof rows)[number]) =>
          r.mitgliedSub ? `sub:${r.mitgliedSub}` : `extern:${r.seiteId}`;
        const namen = new Map(rows.map((r) => [schluessel(r), r]));
        const dto: BuchRanglisteDto = {
          aktuellesJahr: Number(heuteBerlin().slice(0, 4)),
          jahr,
          rangliste: buchRangliste(
            rows.map((r) => ({ ...r, schluessel: schluessel(r) })),
            jahr,
          ).flatMap((z) => {
            const r = namen.get(z.schluessel);
            const m = r?.mitgliedSub ? mitglied(r.mitgliedSub) : null;
            if (!m && !r?.externName) return [];
            return [
              {
                mitglied: m,
                externName: m ? null : (r?.externName ?? null),
                umsatzCent: z.umsatzCent,
                striche: z.striche,
              },
            ];
          }),
          jahre: buchJahre(rows),
        };
        return c.json(dto);
      })
      .get('/buch/seiten', auth, finanzenLesen, async (c) => {
        const [seiten, tarife, mitglied] = await Promise.all([
          deps.buch.seiten(c.req.query('archiviert') === 'true'),
          deps.buch.tarife(),
          mitglieder(),
        ]);
        const dto: BuchSeiteDto[] = seiten.map((s) => seiteDto(s, mitglied, tarife));
        return c.json(dto);
      })
      .get('/buch/seiten/:id', auth, finanzenLesen, async (c) => {
        const s = gefunden(await deps.buch.seite(c.req.param('id')), 'Seite nicht gefunden');
        const [tarife, mitglied] = await Promise.all([deps.buch.tarife(), mitglieder()]);
        return c.json(await detailDto(s, mitglied, tarife));
      })
      .post(
        '/buch/seiten',
        auth,
        finanzenBuchen,
        zValidator('json', buchSeiteEingabeSchema),
        async (c) => {
          const daten = c.req.valid('json');
          if (daten.mitgliedSub && !(await deps.mitglieder.holen(daten.mitgliedSub))) {
            throw new HTTPException(400, { message: 'Das Mitglied gibt es nicht.' });
          }
          const id = await deps.buch.seiteAnlegen(daten, c.get('user').sub).catch(buchFehler);
          return c.json({ id }, 201);
        },
      )
      .post('/buch/seiten/:id/archivieren', auth, finanzenBuchen, async (c) => {
        gefunden(
          await deps.buch.seiteArchivieren(c.req.param('id'), c.get('user').sub),
          'Seite nicht gefunden',
        );
        return c.json({ ok: true });
      })
      .post(
        '/buch/seiten/:id/nummer',
        auth,
        finanzenBuchen,
        zValidator('json', buchNummerSchema),
        async (c) => {
          gefunden(
            await deps.buch
              .seiteNummerAendern(c.req.param('id'), c.req.valid('json').nummer, c.get('user').sub)
              .catch(buchFehler),
            'Seite nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .post(
        '/buch/seiten/:id/reaktivieren',
        auth,
        finanzenBuchen,
        zValidator('json', buchNummerSchema),
        async (c) => {
          gefunden(
            await deps.buch
              .seiteReaktivieren(c.req.param('id'), c.req.valid('json').nummer, c.get('user').sub)
              .catch(buchFehler),
            'Seite nicht gefunden',
          );
          return c.json({ ok: true });
        },
      )
      .get('/buch/tarife', auth, finanzenLesen, async (c) => {
        const dto: BuchTarifDto[] = (await deps.buch.tarife()).map((t) => ({
          ...alsTarif(t),
        }));
        return c.json(dto);
      })
      .post(
        '/buch/tarife',
        auth,
        finanzenVerwalten,
        zValidator('json', buchTarifEingabeSchema),
        async (c) => {
          const id = await deps.buch.tarifAnlegen(c.req.valid('json'), c.get('user').sub);
          return c.json({ id }, 201);
        },
      )
      // One Abrechnung over many pages: empty rows are ignored, everything is saved or nothing.
      .post(
        '/buch/abrechnungen',
        auth,
        finanzenBuchen,
        zValidator('json', buchAbrechnungEingabeSchema),
        async (c) => {
          const eingabe = c.req.valid('json');
          const zeilen = eingabe.zeilen.filter((z) => !buchZeileLeer(z));
          if (zeilen.length === 0) {
            throw new HTTPException(400, { message: 'Bitte trag mindestens einen Wert ein.' });
          }
          const [seiten, tarife, mitglied] = await Promise.all([
            deps.buch.seiten(false),
            deps.buch.tarife(),
            mitglieder(),
          ]);
          const nachId = new Map(seiten.map((s) => [s.seite.id, s]));
          const mitStrichwert = zeilen.map((z) => {
            const s = nachId.get(z.seiteId);
            if (!s) throw new HTTPException(409, { message: SEITE_NICHT_AKTIV });
            const tarif = tarifFuer(s, mitglied, tarife);
            if (z.striche > 0 && !tarif) {
              throw new HTTPException(400, {
                message: `Für Seite ${s.seite.nummer} ist kein Tarif für den Status „${STATUS_NAME[tarifStatus(s, mitglied)]}“ hinterlegt. Lege zuerst einen Tarif an.`,
              });
            }
            return { ...z, strichwertCent: tarif?.strichwertCent ?? 0 };
          });
          const ergebnis = await deps.buch
            .abrechnen(
              { idempotenzSchluessel: eingabe.idempotenzSchluessel, zeilen: mitStrichwert },
              c.get('user').sub,
            )
            .catch(buchFehler);
          const ueberzug = ergebnis.saldi.flatMap((x) => {
            const s = nachId.get(x.seiteId);
            const tarif = s && tarifFuer(s, mitglied, tarife);
            return s && tarif && istUeberzug(x.saldoCent, tarif.maxUeberzugCent)
              ? [{ s, x }]
              : [];
          });
          if (!ergebnis.wiederholt) {
            // The overdrawn members hear about it; failures never break the Abrechnung.
            await bestEffort(async () => {
              for (const { s, x } of ueberzug) {
                const sub = s.seite.mitgliedSub;
                if (!sub) continue;
                await deps.benachrichtigungen.senden({
                  subs: [sub],
                  art: 'buch.ueberzug',
                  titel: 'Dein Buch ist überzogen',
                  text: `Du bist mit ${formatEuro(Math.abs(x.saldoCent))} in der Barzahlung`,
                  url: '/app/buch',
                  dedupeSchluessel: `buch.ueberzug:${ergebnis.id}:${sub}`,
                });
              }
            });
          }
          const dto: BuchAbrechnungErgebnisDto = {
            id: ergebnis.id,
            eintraege: ergebnis.eintraege,
            saldi: ergebnis.saldi,
            ueberzug: ueberzug.map(({ x }) => ({
              seiteId: x.seiteId,
              nummer: x.nummer,
              saldoCent: x.saldoCent,
            })),
            ...(ergebnis.wiederholt && { wiederholt: true }),
          };
          return c.json(dto, ergebnis.wiederholt ? 200 : 201);
        },
      )
      .post(
        '/buch/eintraege/:id/storno',
        auth,
        finanzenBuchen,
        zValidator('json', buchStornoSchema),
        async (c) => {
          const ergebnis = gefunden(
            await deps.buch
              .stornieren(c.req.param('id'), c.req.valid('json'), c.get('user').sub)
              .catch(buchFehler),
            'Eintrag nicht gefunden',
          );
          return c.json(
            { id: ergebnis.id, seiteId: ergebnis.seiteId },
            ergebnis.wiederholt ? 200 : 201,
          );
        },
      )
  );
};
