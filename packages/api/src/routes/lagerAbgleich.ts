import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  abgleichKorrekturSchema,
  abgleichStichtagSchema,
  heuteBerlin,
  type FinanzMitgliedDto,
  type LagerAbgleichDto,
  type LagerAbgleichEreignisDto,
  type LagerAbgleichWareDto,
  type LagerAbgleichZeileDto,
} from '@c4/shared';
import { type AuthEnv } from '../auth';
import { abgleichBerechnen, textMenge, type AbgleichErgebnis } from '../lagerAbgleich';
import type { RoutenKontext } from './kontext';

// Lager-Beleg-Abgleich (docs/finanzen.md): Einlagerungen vs. Ware-Posten der Belege, with Korrekturen.
export const lagerAbgleichRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, abgleichLesen, abgleichSchreiben, gefunden } = ctx;

  const zeile = (e: AbgleichErgebnis['waren'][number], alle: AbgleichErgebnis['alleGebinde']) => {
    const { info, abgleich: a } = e;
    const dto: LagerAbgleichZeileDto = {
      wareId: info.id,
      name: info.name,
      warengruppe: info.warengruppe,
      ist: a.ist,
      soll: a.soll,
      korrektur: a.korrektur,
      diskrepanz: a.diskrepanz,
      istText: textMenge(a.ist, info, alle),
      sollText: textMenge(a.soll, info, alle),
      korrekturText: textMenge(a.korrektur, info, alle),
      diskrepanzText: textMenge(a.diskrepanz, info, alle),
    };
    return dto;
  };

  /** Display data of the people who made a Korrektur; null if the member has no profile any more. */
  const personen = async () => {
    const [rows, konten] = await Promise.all([deps.mitglieder.alle(), deps.userAdmin.konten()]);
    const zeilen = new Map(rows.map((r) => [r.sub, r]));
    return (sub: string): FinanzMitgliedDto | null => {
      const z = zeilen.get(sub);
      return z
        ? {
            sub,
            username: konten.get(sub)?.username ?? null,
            vorname: z.vorname,
            nachname: z.nachname,
            status: z.status,
            anrede: z.anrede ?? 'neutral',
          }
        : null;
    };
  };

  return new Hono<AuthEnv>()
    .get('/lager-abgleich', auth, abgleichLesen, async (c) => {
      const stichtag = await deps.lagerAbgleich.stichtag();
      if (!stichtag) return c.json<LagerAbgleichDto>({ stichtag: null, waren: [] });
      const ergebnis = abgleichBerechnen(stichtag, await deps.lagerAbgleich.daten(stichtag));
      const waren = ergebnis.waren
        .map((e) => zeile(e, ergebnis.alleGebinde))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      return c.json<LagerAbgleichDto>({ stichtag, waren });
    })
    .get('/lager-abgleich/waren/:id', auth, abgleichLesen, async (c) => {
      const stichtag = await deps.lagerAbgleich.stichtag();
      if (!stichtag)
        throw new HTTPException(409, { message: 'Es ist noch kein Stichtag festgelegt.' });
      const [ergebnis, person] = await Promise.all([
        deps.lagerAbgleich
          .daten(stichtag, c.req.param('id'))
          .then((d) => abgleichBerechnen(stichtag, d)),
        personen(),
      ]);
      const e = gefunden(ergebnis.waren[0], 'Ware nicht gefunden oder ohne Bewegung');
      const alle = ergebnis.alleGebinde;
      const dto: LagerAbgleichWareDto = {
        stichtag,
        ware: zeile(e, alle),
        zeitleiste: e.abgleich.zeitleiste.map((z): LagerAbgleichEreignisDto => {
          const basis = {
            datum: z.datum,
            menge: z.menge,
            mengeText: textMenge(z.menge, e.info, alle),
            diskrepanz: z.diskrepanz,
            diskrepanzText: textMenge(z.diskrepanz, e.info, alle),
          };
          if (z.art === 'ist')
            return { ...basis, art: 'ist', vorgangId: z.vorgangId, lagerortName: z.lagerortName };
          if (z.art === 'soll')
            return { ...basis, art: 'soll', belegId: z.belegId, belegNummer: z.belegNummer };
          return {
            ...basis,
            art: 'korrektur',
            id: z.id,
            grund: z.grund,
            text: z.text,
            person: person(z.erstelltVon),
          };
        }),
      };
      return c.json(dto);
    })
    .post(
      '/lager-abgleich/korrekturen',
      auth,
      abgleichSchreiben,
      zValidator('json', abgleichKorrekturSchema),
      async (c) => {
        const eingabe = c.req.valid('json');
        const stichtag = await deps.lagerAbgleich.stichtag();
        if (!stichtag)
          throw new HTTPException(409, { message: 'Es ist noch kein Stichtag festgelegt.' });
        if (eingabe.datum > heuteBerlin())
          throw new HTTPException(400, { message: 'Das Datum darf nicht in der Zukunft liegen.' });
        if (eingabe.datum < stichtag)
          throw new HTTPException(400, {
            message: 'Das Datum darf nicht vor dem Stichtag liegen.',
          });
        const id = gefunden(
          (await deps.lagerAbgleich.korrekturAnlegen(eingabe, c.get('user').sub)) ?? undefined,
          'Ware nicht gefunden',
        );
        return c.json({ id }, 201);
      },
    )
    .put(
      '/lager-abgleich/stichtag',
      auth,
      abgleichSchreiben,
      zValidator('json', abgleichStichtagSchema),
      async (c) => {
        const { stichtag } = c.req.valid('json');
        await deps.lagerAbgleich.stichtagSetzen(stichtag, c.get('user').sub);
        return c.json({ stichtag });
      },
    );
};
