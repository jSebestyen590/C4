import {
  type AnwesenheitsEingabe,
  type Beschlussfaehigkeit,
  anwesenheitsVerlauf,
} from './protokollAnwesenheit';
import {
  bausteinAufnahmeDatenSchema,
  bausteinBeschlussDatenSchema,
  bausteinEmDatenSchema,
  bausteinWahlDatenSchema,
  type BausteinWahlDaten,
  type ProtokollDokument,
  type ProtokollKnoten,
  wahlErgebnis,
  wahlRunden,
  wahlStimmenProPerson,
} from './protokolle';

// Vote counts of binding votes against the members present (see docs/protokolle.md): every
// Abstimmung (also the one of a Neues EM / Aufnahme) and every Wahl round must have exactly as many
// votes as the present members can cast. Pure functions; the document is only walked.

export interface StimmenEingabe extends AnwesenheitsEingabe {
  /** Name of a person for the texts of a Neues EM / Aufnahme; unknown people fall back to the free-text name. */
  personName?: (sub: string) => string | undefined;
}

/** One check: `ist` votes counted, `soll` votes expected. */
export interface StimmenPruefung {
  bausteinId: string;
  /** Which Baustein the check belongs to. */
  typ: 'abstimmung' | 'wahl';
  /** 0 = the vote itself / the main round of a Wahl, i = Stichwahl i. */
  runde: number;
  ist: number;
  soll: number;
  /** Members present at that point. */
  anwesend: number;
  /** Votes per member (Wahl: `min(stimmenProPerson, plaetze)`, Abstimmung: 1). */
  proPerson: number;
  ok: boolean;
}

export interface StimmenProblem {
  bausteinId: string;
  text: string;
}

export interface StimmenErgebnis {
  pruefungen: StimmenPruefung[];
  problems: StimmenProblem[];
}

const mehrzahl = (n: number, eins: string, viele: string): string =>
  `${n} ${n === 1 ? eins : viele}`;
const stimmenText = (n: number): string => mehrzahl(n, 'Stimme', 'Stimmen');
const mitgliederText = (n: number): string => mehrzahl(n, 'Mitglied', 'Mitglieder');

/** `Abstimmung „Antrag“`; without a title just `Abstimmung`. */
const mitTitel = (art: string, titel: string): string => {
  const t = titel.trim();
  return t === '' ? art : `${art} „${t}“`;
};

/** "Stimmen: 4 von 5" / "Stimmen: 7 von 10 (5 × 2)" for the hint under a vote. */
export function stimmenHinweisText(p: StimmenPruefung): string {
  const rechnung = p.typ === 'wahl' && p.proPerson !== 1 ? ` (${p.anwesend} × ${p.proPerson})` : '';
  const runde = p.runde > 0 ? `Stichwahl ${p.runde}: ` : '';
  return `${runde}Stimmen: ${p.ist} von ${p.soll}${rechnung}`;
}

const summe = (zahlen: readonly number[]): number => zahlen.reduce((a, b) => a + b, 0);

function wahlPruefungen(
  id: string,
  daten: BausteinWahlDaten,
  stand: Beschlussfaehigkeit,
): { pruefungen: StimmenPruefung[]; offen: boolean } {
  const pro = wahlStimmenProPerson(daten);
  const neu = (runde: number, ist: number, proPerson: number): StimmenPruefung => {
    const soll = stand.anwesend * proPerson;
    return {
      bausteinId: id,
      typ: 'wahl',
      runde,
      ist,
      soll,
      anwesend: stand.anwesend,
      proPerson,
      ok: ist === soll,
    };
  };
  const ergebnis = wahlErgebnis(daten);
  const pruefungen = [
    neu(0, summe(daten.kandidaten.map((k) => k.stimmen)) + daten.enthaltung, pro),
  ];
  wahlRunden(daten).forEach((r, i) => {
    const s = daten.stichwahlen[i];
    if (!s) return;
    pruefungen.push(
      neu(
        i + 1,
        summe(r.kandidaten.map((k) => s.stimmen[k] ?? 0)) + s.enthaltung,
        Math.min(pro, r.plaetze),
      ),
    );
  });
  return { pruefungen, offen: ergebnis.offen !== null };
}

function problemText(p: StimmenPruefung, titel: string): string {
  const stichwahl = p.runde > 0 ? ` – Stichwahl ${p.runde}` : '';
  if (p.typ === 'abstimmung') {
    return `${titel}: ${stimmenText(p.ist)}, aber ${mitgliederText(p.anwesend)} anwesend.`;
  }
  return `${titel}${stichwahl}: ${stimmenText(p.ist)}, erwartet ${p.soll} (${mitgliederText(p.anwesend)} × ${stimmenText(p.proPerson)}).`;
}

/**
 * Checks every binding vote of the document against the members present at that point
 * (`anwesenheitsVerlauf`): Abstimmung, the vote of a Neues EM (only if there is one) and of an
 * Aufnahme need `ja + nein + enthaltung` = present members. A Wahl needs, per round that applies,
 * the votes of the candidates of that round plus Enthaltungen = present × votes per person (Stichwahl:
 * at most the seats of that round). A tie that still needs a Stichwahl is a problem, too. A Meinungsbild
 * is not binding and not checked. Damaged Baustein data is skipped.
 */
export function stimmenPruefen(
  dokument: ProtokollDokument,
  eingabe: StimmenEingabe,
): StimmenErgebnis {
  const verlauf = anwesenheitsVerlauf(dokument, eingabe);
  const pruefungen: StimmenPruefung[] = [];
  const problems: StimmenProblem[] = [];
  const name = (sub: string | null, frei: string): string =>
    (sub !== null ? eingabe.personName?.(sub) : undefined) ?? frei;

  const abstimmung = (
    id: string,
    titel: string,
    stand: Beschlussfaehigkeit,
    d: { ja: number; nein: number; enthaltung: number },
  ) => {
    const ist = d.ja + d.nein + d.enthaltung;
    const p: StimmenPruefung = {
      bausteinId: id,
      typ: 'abstimmung',
      runde: 0,
      ist,
      soll: stand.anwesend,
      anwesend: stand.anwesend,
      proPerson: 1,
      ok: ist === stand.anwesend,
    };
    pruefungen.push(p);
    if (!p.ok) problems.push({ bausteinId: id, text: problemText(p, titel) });
  };

  const besuch = (knoten: ProtokollKnoten): void => {
    const id = knoten.attrs?.id;
    const stand = typeof id === 'string' ? verlauf.bausteine[id] : undefined;
    if (typeof id === 'string' && stand) {
      const roh = knoten.attrs?.daten;
      if (knoten.type === 'bausteinBeschluss') {
        const d = bausteinBeschlussDatenSchema.safeParse(roh);
        if (d.success) abstimmung(id, mitTitel('Abstimmung', d.data.antrag), stand, d.data);
      } else if (knoten.type === 'bausteinEm') {
        const d = bausteinEmDatenSchema.safeParse(roh);
        if (d.success && d.data.abstimmung) {
          const titel = mitTitel('Neues EM', name(d.data.sub, d.data.name));
          abstimmung(id, `${titel}, Abstimmung`, stand, d.data.abstimmung);
        }
      } else if (knoten.type === 'bausteinAufnahme') {
        const d = bausteinAufnahmeDatenSchema.safeParse(roh);
        if (d.success) {
          const titel = mitTitel('Aufnahme', name(d.data.sub, d.data.name));
          abstimmung(id, `${titel}, Abstimmung`, stand, d.data.abstimmung);
        }
      } else if (knoten.type === 'bausteinWahl') {
        const d = bausteinWahlDatenSchema.safeParse(roh);
        if (d.success) {
          const titel = mitTitel('Wahl', d.data.posten);
          const { pruefungen: ps, offen } = wahlPruefungen(id, d.data, stand);
          pruefungen.push(...ps);
          const falsch = ps.filter((p) => !p.ok);
          for (const p of falsch) problems.push({ bausteinId: id, text: problemText(p, titel) });
          // An open tie whose round exists but has no votes is reported as a vote count already.
          if (offen && !falsch.some((p) => p.runde === ps.length - 1 && p.runde > 0)) {
            problems.push({ bausteinId: id, text: `${titel}: Stichwahl nötig (Gleichstand).` });
          }
        }
      }
    }
    for (const kind of knoten.content ?? []) besuch(kind);
  };
  besuch(dokument);
  return { pruefungen, problems };
}
