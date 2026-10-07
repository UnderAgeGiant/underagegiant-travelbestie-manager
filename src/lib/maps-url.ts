// Google Maps link allow-list for user-entered personal-activity links (Feature 71).
// The link is rendered on the PUBLIC shared page, so only real Google Maps hosts pass.
// Mirrored in the frontend: src/app/core/maps/maps-url-validate.util.ts — change both together.
const GOOGLE_TLD = String.raw`[a-z]{2,3}(\.[a-z]{2})?`;
const GOOGLE_HOST = new RegExp(`^(www\.)?google\.${GOOGLE_TLD}$`);
const MAPS_GOOGLE_HOST = new RegExp(`^maps\.google\.${GOOGLE_TLD}$`);

export function isGoogleMapsUrl(s: string): boolean {
  let u: URL;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl') return true;
  if (host === 'goo.gl') return u.pathname.startsWith('/maps');
  if (MAPS_GOOGLE_HOST.test(host)) return true;
  if (GOOGLE_HOST.test(host)) return u.pathname.startsWith('/maps');
  return false;
}
