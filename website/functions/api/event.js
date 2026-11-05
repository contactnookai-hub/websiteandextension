/**
 * POST /api/event?kind=view|click|ping&label=...&id=...
 * Counts page views and "Add to Chrome" clicks per day, and keeps a 90-second presence list for the live count.
 * Stores no IPs, cookies or user agents: only the day, the kind, a short label, and a random per-tab id.
 */
const KINDS = new Set(["view", "click", "ping"]);
const clean = (s, max) => (s || "").replace(/[^a-z0-9/_-]/gi, "").slice(0, max);

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (!KINDS.has(kind)) return new Response(null, { status: 400 });
  const now = Date.now();
  const id = clean(url.searchParams.get("id"), 36);
  const statements = [];
  if (id) {
    statements.push(env.DB.prepare("INSERT INTO live (id, seen) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET seen = ?2").bind(id, now));
  }
  if (kind !== "ping") {
    const day = new Date(now).toISOString().slice(0, 10);
    const label = clean(url.searchParams.get("label"), 40) || "other";
    statements.push(
      env.DB.prepare("INSERT INTO counts (day, kind, label, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(day, kind, label) DO UPDATE SET n = n + 1").bind(day, kind, label)
    );
  }
  // Keep the presence list small.
  if (Math.random() < 0.05) statements.push(env.DB.prepare("DELETE FROM live WHERE seen < ?1").bind(now - 10 * 60 * 1000));
  if (statements.length) await env.DB.batch(statements);
  return new Response(null, { status: 204 });
}
