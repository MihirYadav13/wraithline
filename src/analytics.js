// Anonymous play analytics and the feedback form's transport. Everything here is configured at
// build time through VITE_* env vars (see README, "Analytics and feedback"); with them unset,
// track() does nothing and no request ever leaves the browser, so local dev sends nothing.
//
// Events carry only game facts (map, difficulty, outcome, minutes). Never pass player names,
// room codes or free text to track().
const env = import.meta.env;
const PROVIDER = (env.VITE_ANALYTICS_PROVIDER || '').toLowerCase(); // plausible | umami | custom
const SITE = env.VITE_ANALYTICS_SITE_ID || ''; // Plausible: site domain. Umami: website id.
const URL_ = env.VITE_ANALYTICS_URL || '';
const OPT_OUT_KEY = 'wraithline-analytics-optout';
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// The dashboard snippet's script URL (https://plausible.io/js/script.js, https://umami.example/script.js)
// is accepted as-is: events go to that host's collection API, no third-party script is loaded.
function apiBase() {
  try {
    return new URL(URL_).origin;
  } catch {
    return '';
  }
}

const senders = {
  plausible: (name, props) =>
    post(`${apiBase()}/api/event`, {
      name,
      url: pageUrl(),
      domain: SITE,
      // Plausible custom properties must be strings
      props: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, String(v)])),
    }),
  umami: (name, props) =>
    post(`${apiBase()}/api/send`, {
      type: 'event',
      payload: { website: SITE, hostname: location.hostname, url: location.pathname, language: navigator.language, screen: `${screen.width}x${screen.height}`, name, data: props },
    }, 'application/json'), // Umami only parses JSON bodies; it answers the CORS preflight
  custom: (name, props) => post(URL_, { event: name, props, version: VERSION }),
};

const pageUrl = () => location.origin + location.pathname;

export const analyticsConfigured = !!(senders[PROVIDER] && URL_ && (PROVIDER === 'custom' || SITE));

export function analyticsOptedOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(out) {
  try {
    if (out) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {}
}

export function track(event, props = {}) {
  if (!analyticsConfigured || analyticsOptedOut()) return;
  try {
    senders[PROVIDER](event, props).catch(() => {});
  } catch {}
}

// text/plain keeps the request "simple" so no CORS preflight is needed; keepalive lets an event
// fired while the page unloads still go out.
function post(url, body, type = 'text/plain') {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(body), keepalive: true });
}

// ---- feedback (user-initiated, so not affected by the analytics opt-out)
export const FEEDBACK_URL = env.VITE_FEEDBACK_URL || '';
export const FEEDBACK_LINK = env.VITE_FEEDBACK_LINK || ''; // Discord invite or itch.io page

export async function sendFeedback(data) {
  const res = await fetch(FEEDBACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...data, version: VERSION }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
