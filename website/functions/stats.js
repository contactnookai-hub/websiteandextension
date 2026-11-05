/**
 * GET /stats?key=STATS_KEY: a private page with live visitors, views and "Add to Chrome" clicks.
 * STATS_KEY is a Pages secret; without the right key this returns 404 so the page isn't discoverable.
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get("key");
  if (!env.STATS_KEY || key !== env.STATS_KEY) return new Response("Not found", { status: 404 });
  const now = Date.now();
  const since = new Date(now - 13 * 86400000).toISOString().slice(0, 10);
  const [live, livePages, totals, daily] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM live WHERE seen > ?1").bind(now - 75000),
    env.DB.prepare("SELECT COALESCE(path, '/') AS path, COUNT(*) AS n FROM live WHERE seen > ?1 GROUP BY path ORDER BY n DESC").bind(now - 75000),
    env.DB.prepare("SELECT kind, label, SUM(n) AS n FROM counts GROUP BY kind, label ORDER BY kind, n DESC"),
    env.DB.prepare("SELECT day, SUM(CASE WHEN kind='view' THEN n ELSE 0 END) AS views, SUM(CASE WHEN kind='click' THEN n ELSE 0 END) AS clicks FROM counts WHERE day >= ?1 GROUP BY day ORDER BY day DESC").bind(since),
  ]);
  const sum = (kind) => totals.results.filter((r) => r.kind === kind).reduce((a, r) => a + r.n, 0);
  const rows = (kind) => totals.results.filter((r) => r.kind === kind).map((r) => `<tr><td>${esc(r.label)}</td><td>${r.n}</td></tr>`).join("") || `<tr><td colspan="2">None yet</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="20"><title>Nook stats</title><style>
body{font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:28px 18px;background:#f4f8fd;color:#111}main{max-width:720px;margin:0 auto}
.big{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0 28px}.card{background:#fff;border:1px solid #e3e9f2;border-radius:14px;padding:16px}
.card b{display:block;font-size:34px;letter-spacing:-.02em}.card span{color:#5b6475;font-size:13px}.live b{color:#1a8f4e}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e9f2;border-radius:14px;overflow:hidden;margin:8px 0 26px}td,th{text-align:left;padding:9px 14px;border-top:1px solid #eef2f7}th{background:#f8fafd;font-weight:600;border-top:0}
h2{font-size:16px;margin:0}small{color:#5b6475}@media(max-width:520px){.big{grid-template-columns:1fr}}</style></head><body><main>
<h1 style="margin:0">Nook website stats</h1><small>Refreshes every 20 seconds. Counts since setup; no cookies, nothing personal.</small>
<div class="big"><div class="card live"><b>${live.results[0].n}</b><span>on the site now</span></div>
<div class="card"><b>${sum("view")}</b><span>page views</span></div><div class="card"><b>${sum("click")}</b><span>"Add to Chrome" clicks</span></div></div>
<h2>On the site now, by page</h2><table><tr><th>Page</th><th>People</th></tr>${livePages.results.map((r) => `<tr><td>${esc(r.path)}</td><td>${r.n}</td></tr>`).join("") || `<tr><td colspan="2">Nobody right now</td></tr>`}</table>
<h2>Last 14 days</h2><table><tr><th>Day</th><th>Views</th><th>Add to Chrome clicks</th></tr>${daily.results.map((d) => `<tr><td>${d.day}</td><td>${d.views}</td><td>${d.clicks}</td></tr>`).join("") || `<tr><td colspan="3">None yet</td></tr>`}</table>
<h2>Clicks by button</h2><table><tr><th>Where</th><th>Clicks</th></tr>${rows("click")}</table>
<h2>Views by page</h2><table><tr><th>Page</th><th>Views</th></tr>${rows("view")}</table>
<p><small>Counted on Cloudflare: a Cloudflare Pages Function writes every visit and click to Cloudflare D1 (database <code>nook-stats</code>, account contact.nookai@gmail.com), and this page reads it straight from there. Visitors who block scripts aren't counted. To cross-check, Cloudflare's own dashboards: <a href="https://dash.cloudflare.com/?to=/:account/:zone/analytics/traffic&zone=trynook.org">Traffic analytics for trynook.org</a> (every request, measured at Cloudflare's network) and <a href="https://dash.cloudflare.com/?to=/:account/web-analytics">Web Analytics</a>.</small></p>
</main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
