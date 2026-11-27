import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ohneAusnahmen, touchAusnahmeSelektoren } from './ausnahmen';
import {
  beobachteConsole,
  rendert,
  schriftVerstoesse,
  scrollVerstoesse,
  touchVerstoesse,
  warteBisGeladen,
} from './pruefungen';
import { routen } from './routen';

type Ids = Record<string, Record<string, string> | null>;

function idsLesen(): Ids {
  try {
    return JSON.parse(readFileSync('.auth/ids.json', 'utf8')) as Ids;
  } catch {
    return {};
  }
}

for (const route of routen) {
  // Testtitel = Router-Pfad, damit `--grep` ihn direkt findet.
  test(route.pfad, async ({ page, baseURL }, testInfo) => {
    test.skip(route.ueberspringen !== undefined, route.ueberspringen ?? '');

    let pfad = route.pfad;
    if (pfad.includes(':')) {
      const ids = idsLesen()[route.pfad];
      test.skip(!ids, 'Keine Daten für die ID dieser Route vorhanden (leere Liste)');
      for (const [param, wert] of Object.entries(ids ?? {})) {
        pfad = pfad.replace(`:${param}`, encodeURIComponent(wert));
      }
    }

    const phone = testInfo.project.name === 'phone';
    const arbeit = route.art === 'finanzen-arbeit';
    const kopf = `[${testInfo.project.name}] ${route.pfad}`;
    const meldung = (zeilen: string[], pruefung: string) =>
      zeilen.map((z) => `${kopf} ${pruefung}: ${z}`).join('\n');
    const hinweis = (zeilen: string[], pruefung: string) => {
      for (const z of zeilen) {
        testInfo.annotations.push({ type: 'hinweis', description: `${pruefung}: ${z}` });
      }
    };

    const meldungen = beobachteConsole(page);
    await page.goto(pfad.replace(/^\//, ''));
    const ladefehler = await warteBisGeladen(page);

    expect.soft(ladefehler ? [ladefehler] : [], meldung([ladefehler ?? ''], 'laden')).toEqual([]);
    const renderFehler = await rendert(page, pfad, baseURL ?? '');
    expect.soft(renderFehler, meldung(renderFehler, 'rendert')).toEqual([]);

    const scroll = ohneAusnahmen(route.pfad, 'scroll', await scrollVerstoesse(page));
    expect.soft(scroll, meldung(scroll, 'scroll')).toEqual([]);

    const konsole = ohneAusnahmen(route.pfad, 'console', meldungen());
    expect.soft(konsole, meldung(konsole, 'console')).toEqual([]);

    if (phone) {
      const touch = await touchVerstoesse(page, touchAusnahmeSelektoren.map((a) => a.selektor));
      const hart = ohneAusnahmen(route.pfad, 'touch', touch.hart);
      const weich = ohneAusnahmen(route.pfad, 'touch', touch.weich);
      const schrift = ohneAusnahmen(route.pfad, 'schrift', await schriftVerstoesse(page));
      if (arbeit) {
        hinweis([...hart, ...weich], 'touch');
        hinweis(schrift, 'schrift');
      } else {
        hinweis(weich, 'touch');
        expect.soft(hart, meldung(hart, 'touch')).toEqual([]);
        expect.soft(schrift, meldung(schrift, 'schrift')).toEqual([]);
      }
    }
  });
}
