import { Box, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type { Gebinde } from '@c4/shared';
import { BestandZeile } from './BestandZeile';
import {
  verfuegbar,
  zeilenKey,
  type AusgangAbschnittDaten,
  type BestandKarte,
  type Eingaben,
} from './lagerBestand';

/**
 * One section of the withdrawal tables (Entnahme, Umlagerung): heading with the node path, one row
 * per Ware with stock, one input per Gebinde (grey = current stock; orange = more than available).
 */
export function AusgangAbschnitt({
  abschnitt,
  karte,
  eingaben,
  alleGebinde,
  onAnzahl,
  children,
}: Readonly<{
  abschnitt: AusgangAbschnittDaten;
  karte: BestandKarte;
  eingaben: Eingaben;
  alleGebinde: Gebinde[];
  onAnzahl: (zeilenKey: string, gebindeId: string, wert: string) => void;
  /** Section footer (Nachfüllen, Ziel). */
  children?: ReactNode;
}>) {
  const lid = abschnitt.lagerortId;
  return (
    <section>
      <Box
        px="xs"
        py={6}
        bg="var(--mantine-color-default-hover)"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Text size="sm" fw={700} style={{ overflowWrap: 'anywhere' }}>
          {abschnitt.pfad}
        </Text>
      </Box>
      <Box px="xs">
        {abschnitt.waren.map(({ ware, gebinde }) => {
          const key = zeilenKey(lid, ware.id);
          const eingabe = eingaben[key];
          const warenGebinde = alleGebinde.filter((g) => ware.gebindeIds.includes(g.id));
          const bestand = (g: Gebinde) => {
            const eigen = karte.get(`${lid}|${ware.id}|${g.id}`) ?? 0;
            return Math.max(0, eigen);
          };
          return (
            <BestandZeile
              key={key}
              ware={ware}
              zeile={{ key, wareId: ware.id, mhd: '', fest: false, anzahl: eingabe ?? {} }}
              gebinde={gebinde}
              alleGebinde={alleGebinde}
              mhdFeld={false}
              platzhalter={(gebindeId) => {
                const g = gebinde.find((x) => x.id === gebindeId);
                return String(g ? bestand(g) : 0);
              }}
              warnung={(gebindeId, wert) => {
                const g = gebinde.find((x) => x.id === gebindeId);
                return (
                  !!g &&
                  Number(wert || 0) > verfuegbar(karte, lid, ware.id, g, warenGebinde, eingabe)
                );
              }}
              onAnzahl={(gebindeId, wert) => onAnzahl(key, gebindeId, wert)}
            />
          );
        })}
        {children}
      </Box>
    </section>
  );
}
