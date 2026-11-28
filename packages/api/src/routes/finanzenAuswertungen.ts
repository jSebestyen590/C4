import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  auswertungJahrSchema,
  auswertungJahreSchema,
  auswertungZeitraumSchema,
  einkaufAuswertung,
  euerAuswertung,
  eventEinnahmen,
  eventVerlauf,
  guvAuswertung,
  jahrGrenzen,
  pfandSaldo,
  ustAuswertung,
  type EinkaufAuswertungDto,
  type EuerAuswertungDto,
  type EventAuswertungDto,
  type GuvAuswertungDto,
  type UstAuswertungDto,
} from '@c4/shared';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

// Auswertungen (docs/finanzen.md „Auswertungen“): the store delivers raw rows, `@c4/shared` calculates.
export const finanzenAuswertungenRoutes = (ctx: RoutenKontext) => {
  const { deps, auth, finanzenLesen } = ctx;

  return new Hono<AuthEnv>()
    .get(
      '/finanzen/auswertungen/ust',
      auth,
      finanzenLesen,
      zValidator('query', auswertungZeitraumSchema),
      async (c) => {
        const { von, bis, intervall } = c.req.valid('query');
        const [zeilen, saetze] = await Promise.all([
          deps.finanzen.auswertungZeilen(von, bis),
          deps.finanzen.auswertungSteuersaetze(),
        ]);
        const dto: UstAuswertungDto = ustAuswertung(zeilen, von, bis, intervall, saetze);
        return c.json(dto);
      },
    )
    .get(
      '/finanzen/auswertungen/guv',
      auth,
      finanzenLesen,
      zValidator('query', auswertungZeitraumSchema),
      async (c) => {
        const { von, bis, intervall } = c.req.valid('query');
        const [zeilen, konten] = await Promise.all([
          deps.finanzen.auswertungZeilen(von, bis),
          deps.finanzen.auswertungKonten(),
        ]);
        const dto: GuvAuswertungDto = guvAuswertung(zeilen, konten, von, bis, intervall);
        return c.json(dto);
      },
    )
    .get(
      '/finanzen/auswertungen/euer',
      auth,
      finanzenLesen,
      zValidator('query', auswertungJahrSchema),
      async (c) => {
        const { jahr } = c.req.valid('query');
        const { von, bis } = jahrGrenzen(jahr);
        const [zeilen, konten] = await Promise.all([
          deps.finanzen.auswertungZeilen(von, bis),
          deps.finanzen.auswertungKonten(),
        ]);
        const dto: EuerAuswertungDto = euerAuswertung(zeilen, konten, jahr);
        return c.json(dto);
      },
    )
    .get(
      '/finanzen/auswertungen/events',
      auth,
      finanzenLesen,
      zValidator('query', auswertungZeitraumSchema),
      async (c) => {
        const { von, bis, intervall } = c.req.valid('query');
        const quellen = await deps.finanzen.auswertungEventQuellen(von, bis);
        const events = eventEinnahmen(quellen);
        const summe = events.reduce(
          (s, e) => ({
            barBruttoCent: s.barBruttoCent + e.barBruttoCent,
            barNettoCent: s.barNettoCent + e.barNettoCent,
            karteBruttoCent: s.karteBruttoCent + e.karteBruttoCent,
            karteNettoCent: s.karteNettoCent + e.karteNettoCent,
            summeBruttoCent: s.summeBruttoCent + e.summeBruttoCent,
            summeNettoCent: s.summeNettoCent + e.summeNettoCent,
          }),
          {
            barBruttoCent: 0,
            barNettoCent: 0,
            karteBruttoCent: 0,
            karteNettoCent: 0,
            summeBruttoCent: 0,
            summeNettoCent: 0,
          },
        );
        const dto: EventAuswertungDto = {
          von,
          bis,
          intervall,
          events,
          summe,
          verlauf: eventVerlauf(quellen, von, bis, intervall),
        };
        return c.json(dto);
      },
    )
    .get(
      '/finanzen/auswertungen/einkauf',
      auth,
      finanzenLesen,
      zValidator('query', auswertungJahreSchema),
      async (c) => {
        const { vonJahr, bisJahr } = c.req.valid('query');
        const [{ posten, gebinde, aliase }, pfandZeilen] = await Promise.all([
          deps.finanzen.auswertungEinkauf(vonJahr, bisJahr),
          deps.finanzen.auswertungPfandZeilen(bisJahr),
        ]);
        const dto: EinkaufAuswertungDto = einkaufAuswertung(
          posten,
          gebinde,
          vonJahr,
          bisJahr,
          pfandSaldo(pfandZeilen, vonJahr, bisJahr),
          aliase,
        );
        return c.json(dto);
      },
    );
};
