// A read-only copy made by `codewalk export`: its index.html carries this meta, and every GET the
// app makes to /api is a saved file under /snap, named like server/export.go's snapKey.
export const STATIC = !!document.querySelector('meta[name="codewalk-static"]');

function snapKey(endpoint: string, q: URLSearchParams) {
  const keys = [...new Set(q.keys())].sort();
  const s = `${endpoint}?${keys.map((k) => `${k}=${q.get(k)}`).join('&')}`;
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function serveSnapshots() {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/'))
      return real(input, init);
    if ((init?.method ?? 'GET') !== 'GET') return json(403, { error: 'This is a read-only copy.' });
    const res = await real(`/snap/${snapKey(url.pathname.slice(5), url.searchParams)}.json`);
    // a missing file comes back as the app's index.html
    if (!res.ok || !res.headers.get('content-type')?.includes('json'))
      return json(404, { error: 'Not in this read-only copy.' });
    return res;
  };
}
