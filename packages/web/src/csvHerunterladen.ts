/**
 * Offers a CSV text as a download: `c4-<auswertung>-<zeitraum>.csv`. The text comes from `csvText`
 * in `@c4/shared` (UTF-8 BOM, `;`, CRLF).
 */
export function csvHerunterladen(auswertung: string, zeitraum: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `c4-${auswertung}-${zeitraum}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
