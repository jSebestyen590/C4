import type {
  PrivatpartyDetailDto,
  PrivatpartyNachrichtDto,
  PrivatpartyEventKurzDto,
  PrivatpartyListeDto,
  PrivatpartyPersonDto,
  PrivatpartyUmfrageKurzDto,
} from '@c4/shared';
import type { PrivatpartyEintrag, PrivatpartyPersonDaten } from './privatpartys';

// DTOs of the Privatparty routes (see docs/privatpartys.md).

export const alsListeDto = (e: PrivatpartyEintrag): PrivatpartyListeDto => ({
  id: e.id,
  status: e.status,
  anlass: e.anlass,
  person: e.personId && e.personName ? { id: e.personId, name: e.personName } : null,
  mailAdresse: e.mailAdresse,
  termine: e.termine,
  terminId: e.terminId,
  unbeantwortet: e.unbeantwortet,
  letzteNachrichtAm: e.letzteNachrichtAm?.toISOString() ?? null,
  angelegtAm: e.angelegtAm.toISOString(),
});

export const alsDetailDto = (
  e: PrivatpartyEintrag,
  umfrage: PrivatpartyUmfrageKurzDto | null,
  event: PrivatpartyEventKurzDto | null,
  nachrichten: PrivatpartyNachrichtDto[],
  mailEingerichtet: boolean,
  antwortAn: string | null,
): PrivatpartyDetailDto => ({
  ...alsListeDto(e),
  notizen: e.notizen,
  nachrichten,
  mailEingerichtet,
  antwortAn,
  umfrage,
  event,
  aktualisiertAm: e.aktualisiertAm.toISOString(),
});

export const alsPersonDto = (
  p: PrivatpartyPersonDaten,
  anzahlPrivatpartys: number,
): PrivatpartyPersonDto => ({
  id: p.id,
  name: p.name,
  email: p.email,
  kontakt: p.kontakt,
  notizen: p.notizen,
  anzahlPrivatpartys,
});
