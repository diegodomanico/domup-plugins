/**
 * Code injected into a signed-in https://flow.google.com tab.
 *
 * Everything that talks to Flow runs *inside the page*, so requests carry the
 * user's own cookies and the page's XSRF token (`at`). Only non-generating
 * RPCs are sent this way; generation goes through Flow's UI (see ui.ts). The
 * MCP never sees or stores the user's password or cookies.
 */
export const BRIDGE_JS = String.raw `
(() => {
  if (window.__flowMcp && window.__flowMcp.version === 3) return 'present';

  const wiz = () => {
    const w = window.WIZ_global_data;
    if (!w || !w.SNlM0e) throw new Error('NOT_SIGNED_IN: Flow page has no session token. Sign in to flow.google.com in this browser.');
    return w;
  };

  const reqid = () => String(Math.floor(Math.random() * 900000) + 100000);

  const parseChunks = (txt) => {
    // batchexecute framing: ")]}'" then [length, json] pairs. Parse every JSON line.
    const out = [];
    for (const line of txt.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('[')) continue;
      try { out.push(...JSON.parse(t)); } catch (e) { /* partial line */ }
    }
    return out;
  };

  const rpc = async (rpcid, payload, sourcePath) => {
    const w = wiz();
    const qs = new URLSearchParams({
      rpcids: rpcid, 'source-path': sourcePath || location.pathname,
      bl: w.cfb2h, 'f.sid': w.FdrFJe, hl: 'en', _reqid: reqid(), rt: 'c',
    });
    const body = new URLSearchParams({
      'f.req': JSON.stringify([[[rpcid, JSON.stringify(payload), null, 'generic']]]),
      at: w.SNlM0e,
    });
    const r = await fetch('/_/AiSandboxAngularFrontend/data/batchexecute?' + qs, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-same-domain': '1' },
      body: body.toString() + '&',
    });
    const txt = await r.text();
    if (r.status === 401 || r.status === 403) return { status: r.status, error: 'NOT_SIGNED_IN', raw: txt.slice(0, 300) };
    for (const e of parseChunks(txt)) {
      if (Array.isArray(e) && e[0] === 'wrb.fr' && e[1] === rpcid) {
        return { status: r.status, data: e[2] ? JSON.parse(e[2]) : null, error: e[5] || null };
      }
    }
    return { status: r.status, error: 'NO_RESPONSE_FRAME', raw: txt.slice(0, 500) };
  };

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  })).toUpperCase();

  const status = () => {
    try { const w = wiz(); return { ok: true, build: w.cfb2h, path: location.pathname, recaptcha: !!(window.grecaptcha && window.grecaptcha.enterprise) }; }
    catch (e) { return { ok: false, error: String(e.message || e), path: location.pathname }; }
  };

  window.__flowMcp = { version: 3, rpc, uuid, status };
  return 'installed';
})()
`;
