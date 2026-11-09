import { randomUUID } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import {
  heuteBerlin,
  terminDauerFehler,
  terminNormalisieren,
  terminText,
  type umfrageEingabeSchema,
  type UmfrageTermin,
} from '@c4/shared';
import type { KalenderStore } from './kalender';
import type { UmfrageDaten, UmfrageSpeichern } from './umfragen';

// Turning validated poll input into what the store saves; shared by the poll routes and the
// Privatparty poll (see docs/umfragen.md).

type Eingabe = z.output<typeof umfrageEingabeSchema>;

/** Validated input with ids: existing questions and options keep theirs, new ones get one. */
export const umfrageSpeichern = (e: Eingabe, bestehend?: UmfrageDaten): UmfrageSpeichern => {
  if (e.endetAm < heuteBerlin()) {
    throw new HTTPException(400, { message: 'Das Ablaufdatum liegt in der Vergangenheit.' });
  }
  return {
    titel: e.titel,
    beschreibung: e.beschreibung,
    endetAm: e.endetAm,
    anonym: e.anonym,
    ergebnisse: e.ergebnisse,
    pflicht: e.pflicht,
    optional: e.optional,
    erinnerungenPflicht: e.erinnerungenPflicht,
    erinnerungenOptional: e.erinnerungenOptional,
    fragen: e.fragen.map((f) => {
      const alt = bestehend?.fragen.find((x) => x.id === f.id);
      return {
        id: alt?.id ?? randomUUID(),
        text: f.text,
        freitext: f.freitext,
        maxAntworten: f.maxAntworten,
        optionen: f.optionen.map((o) => ({
          id: alt?.optionen.find((x) => x.id === o.id)?.id ?? randomUUID(),
          text: o.text,
          termin: o.termin,
        })),
      };
    }),
    termin: e.termin,
    terminFrei: e.terminFrei,
  };
};

type Kalender = Pick<KalenderStore, 'kategorien' | 'vorlagen' | 'dienstformen'>;

/** Kategorie and Vorlage behind a scheduling poll; with a Vorlage its Kategorie counts. */
export const terminQuellen = async (
  kalender: Kalender,
  termin: UmfrageTermin,
  nurAktive: boolean,
) => {
  const [kategorien, vorlagen] = await Promise.all([
    kalender.kategorien(!nurAktive),
    termin.vorlageId ? kalender.vorlagen(!nurAktive) : Promise.resolve([]),
  ]);
  const vorlage = termin.vorlageId ? vorlagen.find((v) => v.id === termin.vorlageId) : null;
  const kategorie = kategorien.find(
    (k) => k.id === (vorlage ? vorlage.kategorieId : termin.kategorieId),
  );
  return { vorlage: vorlage ?? null, kategorie: kategorie ?? null };
};

/**
 * Fits a scheduling poll to its Kategorie (or Vorlage): drops what they decide themselves,
 * checks the rest and fills an empty title with the Vorlage's or Kategorie's name.
 */
export const terminVorbereiten = async (kalender: Kalender, e: Eingabe): Promise<Eingabe> => {
  if (!e.termin) return e;
  const { vorlage, kategorie } = await terminQuellen(kalender, e.termin, true);
  if (e.termin.vorlageId && !vorlage) {
    throw new HTTPException(400, { message: 'Unbekannte Vorlage.' });
  }
  if (!kategorie) throw new HTTPException(400, { message: 'Unbekannte Kategorie.' });
  const [frage] = e.fragen;
  const n = terminNormalisieren(
    { ...e.termin, kategorieId: kategorie.id },
    frage!.optionen,
    kategorie.dauer,
  );
  const fehler = terminDauerFehler(n.termin, n.optionen, kategorie.dauer);
  if (fehler) throw new HTTPException(400, { message: fehler });
  if (!vorlage && kategorie.art === 'teilnahme' && n.termin.bedarf) {
    throw new HTTPException(400, {
      message: 'Bei einer Teilnahme-Kategorie gibt es keine Dienste.',
    });
  }
  if (!vorlage && kategorie.art === 'dienste') {
    if (!n.termin.bedarf) {
      throw new HTTPException(400, {
        message:
          'Bitte wähle die Dienstform und wie viele es mindestens und am liebsten sein sollen.',
      });
    }
    const dienstform = (await kalender.dienstformen(false)).some(
      (d) => d.id === n.termin.bedarf!.dienstformId,
    );
    if (!dienstform) throw new HTTPException(400, { message: 'Unbekannte Dienstform.' });
  }
  return {
    ...e,
    titel: e.titel || vorlage?.titel || kategorie.name,
    termin: n.termin,
    fragen: [
      {
        ...frage!,
        optionen: n.optionen.map((o) => ({
          ...o,
          text: o.termin ? terminText(o.termin) : o.text,
        })),
      },
    ],
  };
};
