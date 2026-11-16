import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  umfrageEingabeSchema,
  umfrageLaeuft,
  ungueltigNachAenderung,
  ausVorlageZuZeit,
  type EventEingabe,
  leererKreis,
  MITGLIED_STATI,
  PRIVATPARTY_STATI,
  privatpartyEingabeSchema,
  privatpartyNachrichtSchema,
  privatpartyZuordnenSchema,
  type PrivatpartyMailStatusDto,
  type PrivatpartyNachrichtDto,
  privatpartyOptionName,
  terminText,
  privatpartyPersonEingabeSchema,
  privatpartyStatusEingabeSchema,
  privatpartyUmfrageSchema,
  privatpartyUmfrageTitel,
  privatpartyZusageSchema,
  UMFRAGE_ERINNERUNG_STANDARD,
  type PrivatpartyEventKurzDto,
  type PrivatpartyUmfrageKurzDto,
} from '@c4/shared';
import { bestEffort } from '../benachrichtigungen';
import {
  alsDetailDto as alsPrivatpartyDetailDto,
  alsListeDto as alsPrivatpartyListeDto,
  alsPersonDto as alsPrivatpartyPersonDto,
} from '../privatpartyAnsicht';
import { mailJob } from '../privatpartyMail';
import { TerminInBenutzung, type PrivatpartyEintrag } from '../privatpartys';
import { type UmfrageSpeichern } from '../umfragen';
import { kreisDerUmfrage } from '../umfrageAnsicht';
import { meldeNeueUmfrage, meldeTermineGeaendert } from '../umfrageBenachrichtigungen';
import { type AuthEnv } from '../auth';
import type { RoutenKontext } from './kontext';

export const privatpartysRoutes = (ctx: RoutenKontext) => {
  const {
    deps,
    auth,
    privatpartysVerwalten,
    kalenderFehler,
    umfrageKontext,
    umfrageSpeichern,
    terminVorbereiten,
    eventLoeschenMitPruefung,
    eigenesProfilMussExistieren,
    gefunden,
    akteurMitName,
  } = ctx;

  const MAIL_AUS = 'Die Party-Mail ist nicht eingerichtet.';

  const privatpartyGefunden = async (id: string): Promise<PrivatpartyEintrag> =>
    gefunden(await deps.privatpartys.holen(id), 'Privatparty nicht gefunden');

  /** Where a reply goes: the reply address of the mails, else the person's email. */
  const antwortAdresse = async (e: PrivatpartyEintrag): Promise<string | null> => {
    if (e.mailAdresse) return e.mailAdresse;
    const person = e.personId ? await deps.privatpartys.person(e.personId) : undefined;
    return person?.email ?? null;
  };

  const privatpartyDetail = async (e: PrivatpartyEintrag) => {
    const [umfrage, event, nachrichten, konten, mailEingerichtet, antwortAn] = await Promise.all([
      e.umfrageId ? deps.umfragen.holen(e.umfrageId) : undefined,
      e.eventId ? deps.kalender.event(e.eventId) : undefined,
      deps.privatpartys.nachrichten(e.id),
      deps.userAdmin.konten(),
      deps.partymail.eingerichtet(),
      antwortAdresse(e),
    ]);
    const umfrageKurz: PrivatpartyUmfrageKurzDto | null = umfrage
      ? { id: umfrage.id, titel: umfrage.titel, laeuft: umfrageLaeuft(umfrage, new Date()) }
      : null;
    // An event deleted in the calendar is shown as none.
    const eventKurz: PrivatpartyEventKurzDto | null = event
      ? { id: event.id, titel: event.anzeigeTitel, beginn: event.beginn }
      : null;
    const sender = new Map<string, PrivatpartyNachrichtDto['gesendetVon']>();
    for (const sub of new Set(nachrichten.flatMap((n) => (n.mitgliedSub ? [n.mitgliedSub] : [])))) {
      const profil = await deps.mitglieder.holen(sub);
      sender.set(
        sub,
        profil
          ? {
              sub,
              username: konten.get(sub)?.username ?? null,
              vorname: profil.vorname,
              nachname: profil.nachname,
              status: profil.status,
              anrede: profil.anrede ?? 'neutral',
            }
          : null,
      );
    }
    const dtos: PrivatpartyNachrichtDto[] = nachrichten.map((n) => ({
      id: n.id,
      richtung: n.richtung,
      vonAdresse: n.vonAdresse,
      vonName: n.vonName,
      anAdresse: n.anAdresse,
      betreff: n.betreff,
      text: n.text,
      anhaenge: n.anhaenge,
      zeitpunkt: n.zeitpunkt.toISOString(),
      gesendetVon: n.mitgliedSub ? (sender.get(n.mitgliedSub) ?? null) : null,
    }));
    return alsPrivatpartyDetailDto(e, umfrageKurz, eventKurz, dtos, mailEingerichtet, antwortAn);
  };

  /**
   * Fits the options of a running Privatparty poll to the current Wunschtermine: options are found by
   * date and name (like when the chosen one is matched back), so a changed date or time is a new
   * option; options of removed dates go, with the votes on them.
   */
  const privatpartyUmfrageNachziehen = async (privatpartyId: string) => {
    const e = await deps.privatpartys.holen(privatpartyId);
    if (!e?.umfrageId) return;
    const u = await deps.umfragen.holen(e.umfrageId);
    if (!u || !umfrageLaeuft(u, new Date())) return;
    const frage = u.fragen[0];
    if (!frage) return;
    const optionen = e.termine.map((t) => {
      const name = privatpartyOptionName(t);
      const alt = frage.optionen.find((o) => o.termin?.datum === t.datum && o.termin.name === name);
      if (alt) return alt;
      const termin = { datum: t.datum, bis: null, beginn: null, ende: null, name };
      return { id: randomUUID(), text: terminText(termin), termin };
    });
    const bisherIds = frage.optionen.map((o) => o.id);
    if (optionen.length === bisherIds.length && optionen.every((o) => bisherIds.includes(o.id))) {
      return;
    }
    const daten: UmfrageSpeichern = {
      ...u,
      fragen: [{ ...frage, optionen }, ...u.fragen.slice(1)],
    };
    const aenderung = ungueltigNachAenderung(
      daten.fragen.map((f) => ({
        ...f,
        optionIds: f.optionen.map((o) => o.id),
        leerErlaubt: daten.termin !== null || daten.terminFrei,
      })),
      u.stimmen,
      u.abgaben.map((x) => x.sub),
    );
    await deps.umfragen.aktualisieren(u.id, daten, aenderung);
    // Voters whose votes were dropped are asked to vote again, the rest of the circle (and outside
    // holders who voted) hear that the dates changed.
    await bestEffort(async () => {
      const k = await umfrageKontext();
      const kreis = [...new Set([...kreisDerUmfrage(u, k).keys(), ...u.abgaben.map((x) => x.sub)])];
      await meldeTermineGeaendert(
        deps.benachrichtigungen,
        u,
        createHash('sha256')
          .update(
            optionen
              .map((o) => o.id)
              .sort()
              .join(','),
          )
          .digest('hex')
          .slice(0, 16),
        aenderung.erneut,
        kreis,
      );
    });
  };

  /** Accepts a wish date: creates the event from the Vorlage at the wished times and ends a running poll. */
  const privatpartyZusagen = async (
    e: PrivatpartyEintrag,
    terminId: string,
    vorlageId: string,
    sub: string,
  ): Promise<string> => {
    if (e.status === 'zugesagt' && e.eventId && (await deps.kalender.event(e.eventId))) {
      throw new HTTPException(409, { message: 'Die Privatparty ist schon zugesagt.' });
    }
    const termin = e.termine.find((t) => t.id === terminId);
    if (!termin) throw new HTTPException(400, { message: 'Unbekannter Termin.' });
    const vorlage = (await deps.kalender.vorlagen(false)).find((v) => v.id === vorlageId);
    if (!vorlage) throw new HTTPException(400, { message: 'Unbekannte Vorlage.' });
    const kategorie = (await deps.kalender.kategorien(false)).find(
      (k) => k.id === vorlage.kategorieId,
    );
    if (!kategorie) throw new HTTPException(400, { message: 'Unbekannte Kategorie.' });
    const eingabe: EventEingabe = {
      ...ausVorlageZuZeit(vorlage, termin.datum, termin.beginn, termin.ende, kategorie),
      // Only the Vorlage's (else a plain) title: no contact data in the calendar.
      titel: vorlage.titel.trim() || 'Privatparty',
    };
    const eventId = await deps.kalender.eventAnlegen(eingabe, sub).catch(kalenderFehler);
    if (e.umfrageId) {
      const u = await deps.umfragen.holen(e.umfrageId);
      if (u && umfrageLaeuft(u, new Date())) await deps.umfragen.beenden(u.id, new Date());
    }
    await deps.privatpartys.zusagen(e.id, termin.id, eventId);
    return eventId;
  };

  // ----- Todos: helpers

  return new Hono<AuthEnv>()
    .get('/privatpartys/personen', auth, privatpartysVerwalten, async (c) => {
      const liste = await deps.privatpartys.personen();
      return c.json(liste.map((p) => alsPrivatpartyPersonDto(p, p.anzahl)));
    })
    .post(
      '/privatpartys/personen',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyPersonEingabeSchema),
      async (c) => {
        const id = await deps.privatpartys.personAnlegen(c.req.valid('json'), c.get('user').sub);
        return c.json({ id }, 201);
      },
    )
    .get('/privatpartys/personen/:id', auth, privatpartysVerwalten, async (c) => {
      const person = gefunden(
        await deps.privatpartys.person(c.req.param('id')),
        'Person nicht gefunden',
      );
      const privatpartys = await deps.privatpartys.nachPerson(person.id);
      return c.json({
        ...alsPrivatpartyPersonDto(person, privatpartys.length),
        privatpartys: privatpartys.map(alsPrivatpartyListeDto),
      });
    })
    .put(
      '/privatpartys/personen/:id',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyPersonEingabeSchema),
      async (c) => {
        gefunden(
          await deps.privatpartys.personAktualisieren(c.req.param('id'), c.req.valid('json')),
          'Person nicht gefunden',
        );
        return c.json({ ok: true });
      },
    )
    .delete('/privatpartys/personen/:id', auth, privatpartysVerwalten, async (c) => {
      const ergebnis = await deps.privatpartys.personLoeschen(c.req.param('id'));
      if (ergebnis === 'nicht_gefunden') {
        throw new HTTPException(404, { message: 'Person nicht gefunden' });
      }
      if (ergebnis === 'in_benutzung') {
        throw new HTTPException(409, {
          message: 'Zu dieser Person gibt es noch Privatpartys.',
        });
      }
      return c.json({ ok: true });
    })
    .get('/privatpartys/mail-status', auth, privatpartysVerwalten, async (c) => {
      const [eingerichtet, stand] = await Promise.all([
        deps.partymail.eingerichtet(),
        deps.privatpartys.abrufStand(),
      ]);
      return c.json({
        eingerichtet,
        letzterAbruf: stand.letzterAbruf?.toISOString() ?? null,
        fehler: stand.fehler,
      } satisfies PrivatpartyMailStatusDto);
    })
    .post('/privatpartys/mail/abrufen', auth, privatpartysVerwalten, async (c) => {
      if (!(await deps.partymail.eingerichtet()))
        throw new HTTPException(409, { message: MAIL_AUS });
      const ergebnis = await mailJob(deps);
      if (ergebnis.fehler)
        throw new HTTPException(502, { message: 'Der Abruf ist fehlgeschlagen.' });
      return c.json({ neu: ergebnis.neu });
    })
    .post(
      '/privatpartys/nachrichten/:id/zuordnen',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyZuordnenSchema),
      async (c) => {
        const nachricht = gefunden(
          await deps.privatpartys.nachricht(c.req.param('id')),
          'Nachricht nicht gefunden',
        );
        const daten = c.req.valid('json');
        const quelleId = nachricht.privatpartyId;
        let zielId: string;
        if ('neu' in daten) {
          // Same blank entry the mail job creates for an unthreaded incoming mail.
          const quelle = await privatpartyGefunden(quelleId);
          zielId = await deps.privatpartys.anlegen(
            {
              personId: null,
              anlass: null,
              notizen: null,
              termine: [],
              mailAdresse: nachricht.richtung === 'ein' ? nachricht.vonAdresse : quelle.mailAdresse,
              letzteNachrichtAm: nachricht.zeitpunkt,
            },
            null,
          );
        } else {
          const ziel = await privatpartyGefunden(daten.privatpartyId);
          if (ziel.id === quelleId) {
            throw new HTTPException(400, {
              message: 'Die Nachricht gehört schon zu dieser Anfrage.',
            });
          }
          if (ziel.status !== 'offen') {
            throw new HTTPException(409, { message: 'Die Anfrage ist nicht offen.' });
          }
          zielId = ziel.id;
        }
        await deps.privatpartys.nachrichtVerschieben(nachricht.id, zielId);
        // An entry that only existed for this mail is not needed any more.
        const geloescht = await deps.privatpartys.leerenEintragLoeschen(quelleId);
        return c.json({ ok: true, geloescht, id: zielId });
      },
    )
    .get(
      '/privatpartys',
      auth,
      privatpartysVerwalten,
      zValidator('query', z.object({ status: z.enum([...PRIVATPARTY_STATI, 'alle']).optional() })),
      async (c) => {
        const status = c.req.valid('query').status ?? 'offen';
        const liste = await deps.privatpartys.alle(status === 'alle' ? undefined : status);
        return c.json(liste.map(alsPrivatpartyListeDto));
      },
    )
    .post(
      '/privatpartys',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyEingabeSchema),
      async (c) => {
        const daten = c.req.valid('json');
        gefunden(await deps.privatpartys.person(daten.personId), 'Person nicht gefunden');
        const id = await deps.privatpartys.anlegen(daten, c.get('user').sub);
        return c.json({ id }, 201);
      },
    )
    .get('/privatpartys/:id', auth, privatpartysVerwalten, async (c) => {
      return c.json(await privatpartyDetail(await privatpartyGefunden(c.req.param('id'))));
    })
    .put(
      '/privatpartys/:id',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyEingabeSchema),
      async (c) => {
        const daten = c.req.valid('json');
        gefunden(await deps.privatpartys.person(daten.personId), 'Person nicht gefunden');
        try {
          gefunden(
            await deps.privatpartys.aktualisieren(c.req.param('id'), daten),
            'Privatparty nicht gefunden',
          );
        } catch (err) {
          if (err instanceof TerminInBenutzung) {
            throw new HTTPException(409, {
              message: 'Der zugesagte Termin kann nicht entfernt werden.',
            });
          }
          throw err;
        }
        await privatpartyUmfrageNachziehen(c.req.param('id'));
        return c.json({ ok: true });
      },
    )
    .delete('/privatpartys/:id', auth, privatpartysVerwalten, async (c) => {
      const ergebnis = await deps.privatpartys.loeschen(c.req.param('id'));
      if (ergebnis === 'nicht_gefunden') {
        throw new HTTPException(404, { message: 'Privatparty nicht gefunden' });
      }
      if (ergebnis === 'in_benutzung') {
        throw new HTTPException(409, {
          message: 'An der Privatparty hängen ein Event oder Nachrichten. Sage sie stattdessen ab.',
        });
      }
      return c.json({ ok: true });
    })
    .post(
      '/privatpartys/:id/umfrage',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyUmfrageSchema),
      async (c) => {
        const sub = c.get('user').sub;
        const e = await privatpartyGefunden(c.req.param('id'));
        const { vorlageId, endetAm, pflicht } = c.req.valid('json');
        if (e.termine.length === 0) {
          throw new HTTPException(400, { message: 'Lege zuerst Wunschtermine an.' });
        }
        if (e.umfrageId) {
          const bisher = await deps.umfragen.holen(e.umfrageId);
          if (bisher && umfrageLaeuft(bisher, new Date())) {
            throw new HTTPException(409, { message: 'Es läuft schon eine Umfrage.' });
          }
        }
        const vorlage = (await deps.kalender.vorlagen(false)).find((v) => v.id === vorlageId);
        if (!vorlage) throw new HTTPException(400, { message: 'Unbekannte Vorlage.' });
        await eigenesProfilMussExistieren(sub);
        const alle = { ...leererKreis(), status: [...MITGLIED_STATI] };
        const geparst = umfrageEingabeSchema.safeParse({
          titel: privatpartyUmfrageTitel(),
          beschreibung: null,
          endetAm,
          anonym: false,
          ergebnisse: 'sofort',
          pflicht: pflicht ? alle : leererKreis(),
          optional: pflicht ? leererKreis() : alle,
          erinnerungenPflicht: pflicht ? [...UMFRAGE_ERINNERUNG_STANDARD.pflicht] : [],
          erinnerungenOptional: pflicht ? [] : [...UMFRAGE_ERINNERUNG_STANDARD.optional],
          fragen: [
            {
              text: '',
              freitext: false,
              maxAntworten: null,
              optionen: e.termine.map((t) => ({
                text: '',
                termin: {
                  datum: t.datum,
                  bis: null,
                  beginn: null,
                  ende: null,
                  name: privatpartyOptionName(t),
                },
              })),
            },
          ],
          termin: {
            kategorieId: vorlage.kategorieId,
            vorlageId: vorlage.id,
            jeTermin: false,
            beginn: null,
            ende: null,
            bedarf: null,
          },
        });
        if (!geparst.success) {
          throw new HTTPException(400, {
            message: geparst.error.issues[0]?.message ?? 'Ungültige Umfrage.',
          });
        }
        const eingabe = await terminVorbereiten(geparst.data);
        const id = await deps.umfragen.anlegen(umfrageSpeichern(eingabe), sub);
        await deps.privatpartys.umfrageSetzen(e.id, id);
        await bestEffort(async () => {
          const [u, k, akteur] = await Promise.all([
            deps.umfragen.holen(id),
            umfrageKontext(),
            akteurMitName(sub),
          ]);
          if (u) await meldeNeueUmfrage(deps.benachrichtigungen, u, k, akteur);
        });
        return c.json({ id }, 201);
      },
    )
    .post(
      '/privatpartys/:id/nachrichten',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyNachrichtSchema),
      async (c) => {
        const sub = c.get('user').sub;
        const e = await privatpartyGefunden(c.req.param('id'));
        if (!(await deps.partymail.eingerichtet())) {
          throw new HTTPException(409, { message: MAIL_AUS });
        }
        const an = await antwortAdresse(e);
        if (!an) {
          throw new HTTPException(400, {
            message: 'Es gibt keine E-Mail-Adresse für die Antwort. Trage sie bei der Person ein.',
          });
        }
        if (!z.string().email().safeParse(an).success) {
          throw new HTTPException(400, {
            message:
              'Die E-Mail-Adresse für die Antwort ist ungültig. Korrigiere sie bei der Person.',
          });
        }
        const bisher = await deps.privatpartys.nachrichten(e.id);
        const letzte = bisher.at(-1);
        const betreff = letzte?.betreff?.trim()
          ? /^re:/i.test(letzte.betreff.trim())
            ? letzte.betreff.trim()
            : `Re: ${letzte.betreff.trim()}`
          : 'Deine Anfrage beim C4';
        const gesendet = await deps.partymail
          .senden({
            an,
            betreff,
            text: c.req.valid('json').text,
            inReplyTo: letzte?.messageId ?? null,
            referenzen: letzte
              ? [...new Set([...letzte.referenzen, letzte.messageId])].slice(-20)
              : [],
          })
          .catch((err: unknown) => {
            console.error('Party-Mail send failed', err);
            throw new HTTPException(502, {
              message:
                `Die Mail konnte nicht gesendet werden. ${err instanceof Error ? err.message : ''}`.trim(),
            });
          });
        const id = await deps.privatpartys.nachrichtAnlegen({
          privatpartyId: e.id,
          richtung: 'aus',
          messageId: gesendet.messageId,
          inReplyTo: letzte?.messageId ?? null,
          referenzen: letzte ? [...letzte.referenzen, letzte.messageId] : [],
          vonAdresse: gesendet.vonAdresse,
          vonName: gesendet.vonName,
          anAdresse: an,
          betreff,
          text: c.req.valid('json').text,
          anhaenge: [],
          zeitpunkt: new Date(),
          mitgliedSub: sub,
        });
        await bestEffort(() => deps.partymail.gesendetAblegen(gesendet.raw));
        return c.json({ id }, 201);
      },
    )
    .post(
      '/privatpartys/:id/zusage',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyZusageSchema),
      async (c) => {
        const e = await privatpartyGefunden(c.req.param('id'));
        const { terminId, vorlageId } = c.req.valid('json');
        const eventId = await privatpartyZusagen(e, terminId, vorlageId, c.get('user').sub);
        return c.json({ eventId }, 201);
      },
    )
    .put(
      '/privatpartys/:id/status',
      auth,
      privatpartysVerwalten,
      zValidator('json', privatpartyStatusEingabeSchema),
      async (c) => {
        const e = await privatpartyGefunden(c.req.param('id'));
        const { status, terminId, vorlageId } = c.req.valid('json');
        if (status === 'zugesagt') {
          if (!terminId || !vorlageId) {
            throw new HTTPException(400, { message: 'Bitte wähle Termin und Vorlage.' });
          }
          const eventId = await privatpartyZusagen(e, terminId, vorlageId, c.get('user').sub);
          return c.json({ eventId });
        }
        // Leaving "zugesagt" deletes the event (if it is already gone, nothing to do).
        if (e.eventId) await eventLoeschenMitPruefung(e.eventId);
        await deps.privatpartys.statusSetzen(e.id, status);
        // A declined request ends its running poll, like an acceptance does.
        if (status === 'abgesagt' && e.umfrageId) {
          const u = await deps.umfragen.holen(e.umfrageId);
          if (u && umfrageLaeuft(u, new Date())) await deps.umfragen.beenden(u.id, new Date());
        }
        return c.json({ ok: true });
      },
    );
  // ----- Todos (see docs/todos.md): always the signed-in member's own;
};
