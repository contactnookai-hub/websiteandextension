/**
 * One address for search engines: www.trynook.org (and, once DNS is live and APEX_REDIRECT is set,
 * trynook.pages.dev) send a 301 to https://trynook.org with the same path.
 */
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const toApex = url.hostname === "www.trynook.org" || (env.APEX_REDIRECT === "on" && url.hostname === "trynook.pages.dev");
  if (toApex) {
    url.hostname = "trynook.org";
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
