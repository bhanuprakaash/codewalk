// Cloudflare Pages advanced mode: every request needs the password in the PASSWORD secret
// (any user name). With no secret set, nothing is served.
export default {
  async fetch(request, env) {
    const want = env.PASSWORD;
    const got = (request.headers.get('Authorization') || '').match(/^Basic (.+)$/);
    let pass = null;
    try {
      if (got) pass = atob(got[1]).split(':').slice(1).join(':');
    } catch {}
    if (!want || pass !== want)
      return new Response('Password needed.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="codewalk", charset="UTF-8"' },
      });
    const res = await env.ASSETS.fetch(request);
    if (!new URL(request.url).pathname.startsWith('/files/')) return res;
    const out = new Response(res.body, res);
    out.headers.set('Content-Security-Policy', 'PAGE_CSP');
    out.headers.set('X-Content-Type-Options', 'nosniff');
    return out;
  },
};
