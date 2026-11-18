import {
  berechneKassenabrechnung,
  fachFehler,
  kasseKontenFehler,
  pruefeBestand,
  pruefeBuchung,
  pruefeKassenTransfers,
  stueckelungVollstaendig,
  type BestandKonto,
  type BuchungVerweisDto,
  type KasseDto,
  type KassenabrechnungEingabe,
  type KassenKonto,
  type KassenRechnung,
  type KontoVerweisDto,
  type StueckelungDto,
} from '@c4/shared';

// Barkassen: pure helpers shared by the database store and the fake (see docs/finanzen.md).

/** Master data of a Kasse the store needs to settle it. */
export interface KassenStamm {
  kontoId: string;
  grundbestand: StueckelungDto[];
}

export interface KassenPlan {
  /** German messages; empty = the Abrechnung may be booked. */
  fehler: string[];
  rechnung?: KassenRechnung;
}

/**
 * Validates a Kassenabrechnung against the accounts (Kasse, Erlöskonto, Ziel-Fach, Nachschub-Fächer
 * must be usable), computes it and checks the booking (lines, group rule, stock rule).
 * `konten` and `bestand` hold every account of the Abrechnung; the Bargeld ones need their stock.
 */
export function planeKassenabrechnung(p: {
  eingabe: KassenabrechnungEingabe;
  stamm: KassenStamm;
  konten: readonly KassenKonto[];
  bestand: readonly BestandKonto[];
}): KassenPlan {
  const { eingabe } = p;
  const nach = new Map(p.konten.map((k) => [k.id, k]));
  const kasse = nach.get(eingabe.kontoId);
  const erloes = nach.get(eingabe.erloesKontoId);
  const ziel = nach.get(eingabe.zielFachId);
  const fehler = [
    ...fachFehler(kasse, 'Die Kasse'),
    ...kasseKontenFehler(erloes, ziel, eingabe.kontoId),
    ...pruefeKassenTransfers(eingabe.transfers, eingabe.zielFachId, eingabe.kontoId),
  ];
  for (const id of new Set(eingabe.transfers.map((t) => t.fachId)))
    if (id !== eingabe.zielFachId && id !== eingabe.kontoId)
      fehler.push(...fachFehler(nach.get(id)));
  const kasseBestand = p.bestand.find((b) => b.id === eingabe.kontoId);
  if (fehler.length > 0 || !kasse || !erloes || !kasseBestand) return { fehler };

  const rechnung = berechneKassenabrechnung({
    kasse: { id: kasse.id, name: kasse.name },
    bestand: stueckelungVollstaendig(kasseBestand.anzahl),
    grundbestand: p.stamm.grundbestand,
    ist: eingabe.ist,
    transfers: eingabe.transfers,
    erloesKonto: { id: erloes.id, steuersatzStandard: erloes.steuersatzStandard ?? null },
    zielFachId: eingabe.zielFachId,
    events: eingabe.events,
  });
  if (rechnung.zeilen.length > 0) {
    fehler.push(
      ...pruefeBuchung({ zeilen: rechnung.zeilen }, p.konten),
      ...pruefeBestand(rechnung.zeilen, p.bestand),
    );
  }
  return { fehler, rechnung };
}

/** The newest entry per `eventId` (by `gezaehltAm`, then `id`). */
export function neuesteJeEvent<T extends { id: string; eventId: string; gezaehltAm: string }>(
  liste: readonly T[],
): T[] {
  const neueste = new Map<string, T>();
  for (const z of liste) {
    const alt = neueste.get(z.eventId);
    if (!alt || z.gezaehltAm > alt.gezaehltAm || (z.gezaehltAm === alt.gezaehltAm && z.id > alt.id))
      neueste.set(z.eventId, z);
  }
  return [...neueste.values()];
}

export interface AbrechnungKurz {
  id: string;
  datum: string;
  buchung: BuchungVerweisDto | null;
  /** ISO timestamp. */
  erstelltAm: string;
  storniert: boolean;
}

/** The newest Abrechnung that is not reversed. */
export const letzteAbrechnung = (liste: readonly AbrechnungKurz[]): AbrechnungKurz | undefined =>
  [...liste]
    .filter((a) => !a.storniert)
    .sort((a, b) => b.erstelltAm.localeCompare(a.erstelltAm) || b.id.localeCompare(a.id))[0];

/** Dienst-Zählungen made after `seit` (an ISO timestamp, null = all), the newest per event. */
export const offeneZaehlungen = <T extends { id: string; eventId: string; gezaehltAm: string }>(
  zaehlungen: readonly T[],
  seit: string | null,
): T[] => neuesteJeEvent(zaehlungen.filter((z) => seit === null || z.gezaehltAm > seit));

/** The `KasseDto` of one Kasse from its loaded parts. */
export function baueKasseDto(p: {
  konto: { id: string; name: string; archiviert: boolean };
  bestand: BestandKonto;
  grundbestand: readonly StueckelungDto[];
  erloesKonto: KontoVerweisDto;
  zielFach: KontoVerweisDto;
  abrechnungen: readonly AbrechnungKurz[];
  zaehlungen: readonly { id: string; eventId: string; gezaehltAm: string }[];
}): KasseDto {
  const letzte = letzteAbrechnung(p.abrechnungen);
  return {
    kontoId: p.konto.id,
    name: p.konto.name,
    archiviert: p.konto.archiviert,
    grundbestand: stueckelungVollstaendig(
      new Map(p.grundbestand.map((s) => [s.nennwertCent, s.anzahl])),
    ),
    bestand: stueckelungVollstaendig(p.bestand.anzahl),
    saldoCent: p.bestand.saldoCent,
    standardErloesKonto: p.erloesKonto,
    standardZielFach: p.zielFach,
    letzteAbrechnung: letzte
      ? { id: letzte.id, datum: letzte.datum, buchung: letzte.buchung }
      : null,
    offeneZaehlungen: offeneZaehlungen(p.zaehlungen, letzte?.erstelltAm ?? null).length,
  };
}

/** Why a Kasse cannot be counted or settled (empty = fine). */
export const kasseNutzbarFehler = (
  stamm: unknown,
  konto: { name: string; archiviert: boolean } | undefined,
): string[] => {
  if (!stamm || !konto) return ['Die Kasse gibt es nicht.'];
  if (konto.archiviert) return [`Die Kasse „${konto.name}“ ist archiviert.`];
  return [];
};

/** Event display title: its own title or the name of its Kategorie. */
export const eventTitelAnzeige = (titel: string | null, kategorie: string): string =>
  titel && titel.trim() !== '' ? titel : kategorie;
