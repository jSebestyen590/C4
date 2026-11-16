import { Hono } from 'hono';
import { istDatenAbweichung, istKonflikt } from './db/wiederholung';
import { HTTPException } from 'hono/http-exception';
import { type UserAdmin } from './admin';
import { type EmailAenderung } from './emailaenderung';
import { type PostenStore } from './posten';
import { type KalenderStore } from './kalender';
import { type Benachrichtigungen } from './benachrichtigungen';
import { type PartyMail } from './partymailTypen';
import { type PrivatpartysStore } from './privatpartys';
import { type FreigabenStore, type OneDrive, type OrdnerCacheStore } from './onedrive';
import { type WarenStore } from './waren';
import { type InventarStore } from './inventar';
import { type TodosStore } from './todos';
import { type SchluesselStore } from './schluessel';
import { type SchluesselAnfragenStore } from './schluesselAnfragen';
import { type TrichterStore } from './trichter';
import { type FinanzenStore } from './finanzen';
import { type ProtokollStore } from './protokolle';
import { type UmfragenStore } from './umfragen';
import { type MitgliederStore } from './mitglieder';
import { type Profilbilder } from './profilbilder';
import { type Protokollbilder } from './protokollbilder';
import { DEAKTIVIERT, type AuthEnv, type TokenVerifier } from './auth';
import { baueKontext } from './routes/kontext';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { mitgliederRoutes } from './routes/mitglieder';
import { adminRoutes } from './routes/admin';
import { postenRoutes } from './routes/posten';
import { schluesselRoutes } from './routes/schluessel';
import { privatpartysRoutes } from './routes/privatpartys';
import { todosRoutes } from './routes/todos';
import { protokolleRoutes } from './routes/protokolle';
import { trichterRoutes } from './routes/trichter';
import { finanzenRoutes } from './routes/finanzen';
import { umfragenRoutes } from './routes/umfragen';
import { warenRoutes } from './routes/waren';
import { inventarRoutes } from './routes/inventar';
import { kalenderRoutes } from './routes/kalender';
import { bilderRoutes } from './routes/bilder';
import { vcardRoutes } from './routes/vcard';
import { pushRoutes } from './routes/push';
import { benachrichtigungenRoutes } from './routes/benachrichtigungen';

export interface AppDeps {
  verifyToken: TokenVerifier;
  userAdmin: UserAdmin;
  emailAenderung: EmailAenderung;
  mitglieder: MitgliederStore;
  posten: PostenStore;
  waren: WarenStore;
  inventar: InventarStore;
  kalender: KalenderStore;
  schluessel: SchluesselStore;
  schluesselAnfragen: SchluesselAnfragenStore;
  todos: TodosStore;
  umfragen: UmfragenStore;
  trichter: TrichterStore;
  finanzen: FinanzenStore;
  protokolle: ProtokollStore;
  privatpartys: PrivatpartysStore;
  /** The Party-Mail mailbox (IMAP/SMTP); `eingerichtet()` is false without the secret. */
  partymail: PartyMail;
  benachrichtigungen: Benachrichtigungen;
  onedrive: OneDrive;
  /** Cache of the anonymous sharing links of the photo folders. */
  freigaben: FreigabenStore;
  /** Last snapshot of the folder list, shown at once while the live list loads. */
  ordnerCache: OrdnerCacheStore;
  /** Public origin of the web app (`https://c4.example`) for links in the calendar feed; none = no links. */
  appUrl?: string;
  profilbilder: Profilbilder;
  protokollbilder: Protokollbilder;
  /** Resolves when the database answers `select 1`. */
  pingDb: () => Promise<void>;
}

/** Routes without a token: health, calendar feed and vCard (the token is part of the path). */
export const OEFFENTLICH = ['/api/health', '/api/kalender/feed/', '/api/vcard/'];

export function createApp(deps: AppDeps) {
  const ctx = baueKontext(deps);
  return (
    new Hono<AuthEnv>()
      .basePath('/api')
      // Default deny: every route needs a valid token unless it is on `OEFFENTLICH`. The per-route `auth`
      // stays in place for the typed client and skips itself once this guard has authenticated the request.
      .use('*', async (c, next) => {
        const pfad = c.req.path;
        if (OEFFENTLICH.some((p) => pfad === p || (p.endsWith('/') && pfad.startsWith(p)))) {
          return next();
        }
        return ctx.auth(c, next);
      })
      .route('/', healthRoutes())
      .route('/', meRoutes(ctx))
      .route('/', mitgliederRoutes(ctx))
      .route('/', adminRoutes(ctx))
      .route('/', postenRoutes(ctx))
      .route('/', schluesselRoutes(ctx))
      .route('/', privatpartysRoutes(ctx))
      .route('/', todosRoutes(ctx))
      .route('/', protokolleRoutes(ctx))
      .route('/', trichterRoutes(ctx))
      .route('/', finanzenRoutes(ctx))
      .route('/', umfragenRoutes(ctx))
      .route('/', warenRoutes(ctx))
      .route('/', inventarRoutes(ctx))
      .route('/', kalenderRoutes(ctx))
      .route('/', bilderRoutes(ctx))
      .route('/', vcardRoutes(ctx))
      .route('/', pushRoutes(ctx))
      .route('/', benachrichtigungenRoutes(ctx))
      .onError((err, c) => {
        if (err instanceof HTTPException) {
          if (err.cause === DEAKTIVIERT) {
            return c.json({ error: err.message, deaktiviert: true }, err.status);
          }
          return c.json({ error: err.message }, err.status);
        }
        console.error(err);
        if (istKonflikt(err)) {
          return c.json(
            { error: 'Jemand anderes hat gerade dasselbe geändert. Bitte versuch es noch einmal.' },
            409,
          );
        }
        if (istDatenAbweichung(err)) {
          return c.json(
            {
              error:
                'Das passt nicht mehr zum aktuellen Stand. Bitte lade die Seite neu und versuch es noch einmal.',
            },
            409,
          );
        }
        return c.json({ error: 'Internal server error' }, 500);
      })
  );
}
export type AppType = ReturnType<typeof createApp>;
