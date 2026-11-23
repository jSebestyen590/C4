import {
  type BausteinEventDaten,
  type BausteinTyp,
  type BausteinVergangenesEventDaten,
  type EventDto,
  type EventKategorieDto,
  type VorlageDto,
} from '@c4/shared';

/**
 * What the headings of Event and Vergangenes Event need to show the Kategorie ("10.10. PP Caro"):
 * plain maps, so they work in the editor, the document view and the PDF alike.
 */
export interface KategorieNamen {
  /** Kategorie name by Kategorie id. */
  kategorien: Readonly<Record<string, string>>;
  /** Kategorie id of a Vorlage by Vorlage id. */
  vorlagen: Readonly<Record<string, string>>;
  /** Kategorie name of a calendar event by event id. */
  events: Readonly<Record<string, string>>;
}

export function kategorieNamenBauen(
  kategorien: readonly Pick<EventKategorieDto, 'id' | 'name'>[],
  vorlagen: readonly Pick<VorlageDto, 'id' | 'kategorieId'>[],
  events: readonly Pick<EventDto, 'id' | 'kategorie'>[],
): KategorieNamen {
  const eventNamen: Record<string, string> = {};
  for (const e of events) if (e.kategorie?.name) eventNamen[e.id] = e.kategorie.name;
  const vorlagenKat: Record<string, string> = {};
  for (const v of vorlagen) if (v.kategorieId) vorlagenKat[v.id] = v.kategorieId;
  return {
    kategorien: Object.fromEntries(kategorien.map((k) => [k.id, k.name])),
    vorlagen: vorlagenKat,
    events: eventNamen,
  };
}

/**
 * Kategorie name for the heading of a Baustein: Event = chosen Kategorie, else the Vorlage's;
 * Vergangenes Event = Kategorie of the linked calendar event (nothing when not linked).
 */
export function bausteinKategorie(
  typ: BausteinTyp | string,
  daten: unknown,
  namen: KategorieNamen | undefined,
): string | undefined {
  if (!namen || !daten) return undefined;
  if (typ === 'bausteinEvent') {
    const d = daten as Partial<BausteinEventDaten>;
    const id = d.kategorieId ?? (d.vorlageId ? namen.vorlagen[d.vorlageId] : undefined);
    return id ? namen.kategorien[id] : undefined;
  }
  if (typ === 'bausteinVergangenesEvent') {
    const d = daten as Partial<BausteinVergangenesEventDaten>;
    return d.eventId ? namen.events[d.eventId] : undefined;
  }
  return undefined;
}
