import { dienstTermine, icsErzeugen, type MeinDienstDto } from '@c4/shared';

/** Builds an `.ics` file in the browser from own Dienste and offers it as a download. */
export function dienstIcsHerunterladen(dienste: readonly MeinDienstDto[], dateiname: string): void {
  const ics = icsErzeugen(dienstTermine(dienste, window.location.origin), {
    kalenderName: 'C4 – Meine Dienste',
  });
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
