import { Anchor, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { seitAbText } from './inventarAnzeige';
import type { AusleiheEintrag } from './inventarDaten';

interface Ziel {
  lagerortId: string | null;
  ifcoId: string | null;
}

/** Open Ausleihen holding pieces of `gegenstandId` taken from `ziel`, with the amount taken there. */
export function offenAnPlatz(ausleihen: AusleiheEintrag[], gegenstandId: string, ziel: Ziel) {
  return ausleihen.flatMap((a) => {
    const hier = a.positionen.filter(
      (p) =>
        p.gegenstandId === gegenstandId &&
        p.zurueckAm === null &&
        p.lagerortId === ziel.lagerortId &&
        p.ifcoId === ziel.ifcoId,
    );
    const anzahl = hier.reduce((s, p) => s + p.anzahl, 0);
    const ganzeIfco = hier.length > 0 && hier.every((p) => p.ganzeIfco);
    return anzahl > 0 ? [{ a, anzahl, ganzeIfco }] : [];
  });
}

const AusleiheLink = ({ a }: Readonly<{ a: AusleiheEintrag }>) => (
  <Anchor component={Link} to={`/inventar/ausleihen/${encodeURIComponent(a.id)}`} inherit>
    {a.an}
  </Anchor>
);

/**
 * Lending notes below a place line: `verliehen: 3 (an Feuerwehr)` and one line per reservation
 * `vorgemerkt: 2 ab 25.10.2026 10:00 (an Jugendgruppe)`, each borrower linked to its Ausleihe.
 * With `einzeln` (the Gegenstand exists once) the numbers are left out: `verliehen (an Feuerwehr)`,
 * `vorgemerkt ab 25.10.2026 10:00 (an Jugendgruppe)`.
 */
export function PlatzAusleihHinweise({
  ausleihen,
  gegenstandId,
  ziel,
  einzeln = false,
}: Readonly<{
  ausleihen: AusleiheEintrag[];
  gegenstandId: string;
  ziel: Ziel;
  /** True when the Gegenstand exists exactly once in total. */
  einzeln?: boolean;
}>) {
  const offen = offenAnPlatz(ausleihen, gegenstandId, ziel);
  const verliehen = offen.filter((x) => x.a.status !== 'geplant');
  const vorgemerkt = offen.filter((x) => x.a.status === 'geplant');
  const summe = verliehen.reduce((s, x) => s + x.anzahl, 0);
  return (
    <>
      {summe > 0 && (
        <Text size="sm" c="grape" mt={4} style={{ overflowWrap: 'anywhere' }}>
          verliehen{einzeln ? '' : `: ${summe}`} (an{' '}
          {verliehen.map(({ a, ganzeIfco }, i) => (
            <span key={a.id}>
              {i > 0 && ', '}
              <AusleiheLink a={a} />
              {ganzeIfco && ', mit der ganzen IFCO'}
            </span>
          ))}
          )
        </Text>
      )}
      {vorgemerkt.map(({ a, anzahl, ganzeIfco }) => (
        <Text key={a.id} size="sm" c="cyan" mt={4} style={{ overflowWrap: 'anywhere' }}>
          vorgemerkt{einzeln ? '' : `: ${anzahl}`} {seitAbText(a.ausgeliehenAm)} (an{' '}
          <AusleiheLink a={a} />
          {ganzeIfco && ', mit der ganzen IFCO'})
        </Text>
      ))}
    </>
  );
}
