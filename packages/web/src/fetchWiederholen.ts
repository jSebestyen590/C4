// On resume the PWA refetches many queries at once; the Lambda account concurrency limit then
// throttles (API Gateway 503). Retry only idempotent requests (GET/HEAD): a mutation might
// already have run.
export const WIEDERHOLUNG_VERZOEGERUNGEN_MS = [400, 1200];
const WIEDERHOLBARE_STATUS = new Set([429, 502, 503, 504]);

export async function fetchMitWiederholung(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const methode = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (methode !== 'GET' && methode !== 'HEAD') return fetch(input, init);
  for (let versuch = 0; ; versuch++) {
    const verzoegerung = WIEDERHOLUNG_VERZOEGERUNGEN_MS[versuch];
    try {
      const res = await fetch(input, init);
      if (verzoegerung === undefined || !WIEDERHOLBARE_STATUS.has(res.status)) return res;
    } catch (fehler) {
      if (verzoegerung === undefined) throw fehler;
    }
    await new Promise((r) => setTimeout(r, verzoegerung));
  }
}
