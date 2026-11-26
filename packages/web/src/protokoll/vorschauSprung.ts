/**
 * Scrolls the document view (page or preview drawer) once to the element with `data-id` = `id`
 * (a Baustein or `abschnitt:<art>`). Without a match nothing happens.
 */
export function dokumentStelleScrollen(id: string): void {
  const dokumente = document.querySelectorAll('[data-testid="protokoll-dokument"]');
  const dokument = dokumente[dokumente.length - 1];
  const el = dokument?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.style.scrollMarginTop = '80px';
  el.scrollIntoView({ block: 'start' });
}
