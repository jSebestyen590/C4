/**
 * Woher die IDs für Routen mit Parametern kommen: je Quelle ein Listen-Endpunkt (GET), das erste Element
 * liefert den Wert. `abfragen` werden der Reihe nach probiert, bis eine Liste Elemente hat.
 * Das Ergebnis steht in `.auth/ids.json` als `{ "<Router-Pfad>": { "<param>": "<wert>" } }`
 * (`null`, wenn keine Daten da sind; die Route wird dann übersprungen).
 */
export interface Abfrage {
  /** Pfad ohne führenden Slash, z. B. `api/posten`. */
  api: string;
  query?: Record<string, string>;
  /** Eigenschaft der Antwort, die die Liste enthält; fehlt sie, ist die Antwort selbst die Liste. */
  liste?: string;
}

export interface IdQuelle {
  /** Router-Pfade, die diese Quelle nutzen. */
  routen: string[];
  param: string;
  abfragen: Abfrage[];
  /** Feld im Listenelement, das die ID enthält. Eine Funktion für abgeleitete Werte. */
  feld: string | ((element: Record<string, unknown>) => unknown);
  /** Nur Elemente, für die der Filter wahr ist. */
  filter?: (element: Record<string, unknown>) => boolean;
}

/** Kalender: heute -60 / +60 Tage als `YYYY-MM-DD` (`kalenderZeitraumSchema`). */
export function kalenderZeitraum(heute = new Date()): { von: string; bis: string } {
  const tag = (offset: number): string => {
    const d = new Date(heute);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  return { von: tag(-60), bis: tag(60) };
}

export function idQuellen(): IdQuelle[] {
  const entwurf = (e: Record<string, unknown>) => e.status === 'entwurf';
  const gebucht = (e: Record<string, unknown>) => e.status !== 'entwurf';
  return [
    {
      routen: ['/mitglieder/:kennung'],
      param: 'kennung',
      abfragen: [{ api: 'api/mitglieder' }],
      feld: (m) => m.username || m.sub,
    },
    { routen: ['/posten/:id'], param: 'id', abfragen: [{ api: 'api/posten' }], feld: 'id' },
    { routen: ['/schluessel/:id'], param: 'id', abfragen: [{ api: 'api/schluessel' }], feld: 'id' },
    {
      routen: ['/schluessel/anfragen/:id'],
      param: 'id',
      abfragen: [{ api: 'api/schluessel/anfragen' }],
      feld: 'id',
    },
    {
      routen: ['/protokolle/:id'],
      param: 'id',
      abfragen: [{ api: 'api/protokolle' }],
      feld: 'id',
    },
    {
      routen: ['/umfragen/:id', '/umfragen/:id/bearbeiten'],
      param: 'id',
      abfragen: [{ api: 'api/umfragen' }, { api: 'api/umfragen/beendet', liste: 'umfragen' }],
      feld: 'id',
    },
    {
      routen: ['/privatpartys/:id', '/privatpartys/:id/bearbeiten'],
      param: 'id',
      abfragen: [{ api: 'api/privatpartys', query: { status: 'alle' } }],
      feld: 'id',
    },
    {
      routen: ['/privatpartys/personen/:id'],
      param: 'id',
      abfragen: [{ api: 'api/privatpartys/personen' }],
      feld: 'id',
    },
    { routen: ['/waren/:id'], param: 'id', abfragen: [{ api: 'api/waren' }], feld: 'id' },
    {
      routen: ['/lager/inventur/:id'],
      param: 'id',
      abfragen: [{ api: 'api/inventuren' }],
      feld: 'id',
    },
    {
      routen: ['/lager/:id/entnehmen', '/lager/:id/einlagern', '/lager/:id/umlagern'],
      param: 'id',
      abfragen: [{ api: 'api/lagerorte' }],
      feld: 'id',
    },
    {
      routen: ['/inventar/gegenstaende/:id'],
      param: 'id',
      abfragen: [{ api: 'api/inventar/gegenstaende' }],
      feld: 'id',
    },
    {
      routen: ['/inventar/ausleihen/:id', '/inventar/ausleihen/:id/bearbeiten'],
      param: 'id',
      abfragen: [{ api: 'api/inventar/ausleihen' }],
      feld: 'id',
    },
    {
      routen: ['/inventar/ifcos/:id'],
      param: 'id',
      abfragen: [{ api: 'api/inventar/ifcos' }],
      feld: 'id',
    },
    {
      routen: ['/kalender/events/:id', '/kalender/events/:id/bearbeiten'],
      param: 'id',
      abfragen: [{ api: 'api/kalender/events', query: kalenderZeitraum() }],
      feld: 'id',
    },
    {
      routen: ['/finanzen/journal/:id'],
      param: 'id',
      abfragen: [{ api: 'api/finanzen/buchungen', liste: 'buchungen' }],
      feld: 'id',
    },
    {
      routen: ['/finanzen/bargeld/zaehlungen/:id'],
      param: 'id',
      abfragen: [{ api: 'api/finanzen/zaehlungen', liste: 'zaehlungen' }],
      feld: 'id',
    },
    {
      routen: ['/finanzen/kassen/abrechnungen/:id'],
      param: 'id',
      abfragen: [{ api: 'api/finanzen/kassenabrechnungen', liste: 'abrechnungen' }],
      feld: 'id',
    },
    {
      routen: ['/finanzen/kassen/:kontoId/abrechnen'],
      param: 'kontoId',
      abfragen: [{ api: 'api/finanzen/kassen' }],
      feld: 'kontoId',
    },
    {
      routen: ['/finanzen/belege/:id'],
      param: 'id',
      abfragen: [{ api: 'api/finanzen/belege', liste: 'belege' }],
      feld: 'id',
      filter: gebucht,
    },
    {
      // Die Entwürfe stehen in der Belegliste (`status: 'entwurf'`, `id` ist die Entwurfs-ID).
      routen: ['/finanzen/belege/entwurf/:id'],
      param: 'id',
      abfragen: [{ api: 'api/finanzen/belege', query: { status: 'entwurf' }, liste: 'belege' }],
      feld: 'id',
      filter: entwurf,
    },
    {
      routen: ['/finanzen/rechnungen/:id'],
      param: 'id',
      abfragen: [{ api: 'api/finanzen/rechnungen', liste: 'rechnungen' }],
      feld: 'id',
      filter: gebucht,
    },
    {
      // Wie bei Belegen: kein Listen-Endpunkt für Entwürfe, `status: 'entwurf'` der Rechnungsliste.
      routen: ['/finanzen/rechnungen/entwurf/:id'],
      param: 'id',
      abfragen: [
        { api: 'api/finanzen/rechnungen', query: { status: 'entwurf' }, liste: 'rechnungen' },
      ],
      feld: 'id',
      filter: entwurf,
    },
    {
      routen: ['/belege/:id'],
      param: 'id',
      abfragen: [{ api: 'api/finanzen/einreichungen' }],
      feld: 'id',
    },
    {
      routen: ['/finanzen/buch/seiten/:id'],
      param: 'id',
      abfragen: [{ api: 'api/buch/seiten' }],
      feld: 'id',
    },
    {
      routen: ['/finanzen/lager-abgleich/:wareId'],
      param: 'wareId',
      abfragen: [{ api: 'api/lager-abgleich', liste: 'waren' }],
      feld: 'wareId',
    },
  ];
}
