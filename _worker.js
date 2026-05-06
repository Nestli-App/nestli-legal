// Nestli site router + i18n at the edge.
//
// One template per page (the static HTML in `/`), one dictionary per locale
// (`/i18n/<locale>.json`). At request time this Worker:
//
//   1. Picks a locale from the request Host (cn.* -> zh-Hans, else en).
//      China-IP routing from nestliapp.com -> cn.nestliapp.com is handled
//      upstream in Cloudflare DNS/Rules, so by the time we see the request
//      the host already encodes the audience.
//   2. Loads the matching dictionary from the assets bundle.
//   3. Streams the HTML through HTMLRewriter, replacing every element
//      tagged with `data-i18n*` attributes with the translated value.
//
// To add a new language: drop `i18n/<locale>.json` next to the existing
// ones, add an entry in SUPPORTED_LOCALES below, point a hostname at this
// Worker, and (optionally) set the host -> locale rule. No HTML changes
// needed.

const SUPPORTED_LOCALES = [
  { code: 'en',      htmlLang: 'en',      hostPrefix: null },
  { code: 'zh-Hans', htmlLang: 'zh-Hans', hostPrefix: 'cn.' },
];
const DEFAULT_LOCALE = 'en';

function pickLocale(host) {
  for (const l of SUPPORTED_LOCALES) {
    if (l.hostPrefix && host.startsWith(l.hostPrefix)) return l;
  }
  return SUPPORTED_LOCALES.find(l => l.code === DEFAULT_LOCALE);
}

function getByPath(obj, path) {
  if (!obj || !path) return null;
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[part];
  }
  return cur == null ? null : cur;
}

// Cache parsed dictionaries inside the isolate so successive requests on the
// same edge node don't re-parse JSON. Cloudflare recycles isolates, so this
// is best-effort.
const dictCache = new Map();

async function loadDict(env, request, locale) {
  if (dictCache.has(locale)) return dictCache.get(locale);
  const url = new URL(`/i18n/${locale}.json`, request.url);
  const resp = await env.ASSETS.fetch(new Request(url, { method: 'GET' }));
  if (!resp.ok) return {};
  const dict = await resp.json();
  dictCache.set(locale, dict);
  return dict;
}

class LocaleAttrs {
  constructor(locale) { this.locale = locale; }
  element(el) {
    el.setAttribute('lang', this.locale.htmlLang);
    el.setAttribute('data-locale', this.locale.code);
  }
}

class TextReplacer {
  constructor(dict, attr) { this.dict = dict; this.attr = attr; }
  element(el) {
    const key = el.getAttribute(this.attr);
    const val = getByPath(this.dict, key);
    if (val == null) return;
    el.setInnerContent(String(val), { html: false });
  }
}

class HTMLReplacer {
  constructor(dict) { this.dict = dict; }
  element(el) {
    const key = el.getAttribute('data-i18n-html');
    let val = getByPath(this.dict, key);
    if (val == null) return;
    // Non-string values (e.g. an array of hero phrases) are emitted as JSON
    // so a `<script type="application/json">` placeholder can carry them
    // through to client code without per-key markers.
    if (typeof val !== 'string') val = JSON.stringify(val);
    el.setInnerContent(val, { html: true });
  }
}

class AttrReplacer {
  constructor(dict) { this.dict = dict; }
  element(el) {
    // Format: "attrName:dot.path,attr2:dot.path2"
    const spec = el.getAttribute('data-i18n-attr');
    if (!spec) return;
    for (const pair of spec.split(',')) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (!attr || !key) continue;
      const val = getByPath(this.dict, key);
      if (val != null) el.setAttribute(attr, String(val));
    }
  }
}

class LocaleVisibility {
  // <... data-locale-only="zh-Hans"> stays in the document only when the
  // active locale matches. Lets us scope locale-specific blocks (e.g. the
  // mainland China cross-border banner) inside one shared template.
  constructor(locale) { this.locale = locale; }
  element(el) {
    const allowed = (el.getAttribute('data-locale-only') || '').split(/\s+/).filter(Boolean);
    if (allowed.length && !allowed.includes(this.locale.code)) {
      el.remove();
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Permanent redirect: legacy /cn/<path> -> https://cn.nestliapp.com/<path>.
    // Anyone hitting /cn/foo on either host lands on the CN site at /foo.
    if (url.pathname === '/cn' || url.pathname === '/cn/') {
      return Response.redirect(`https://cn.nestliapp.com/${url.search}`, 301);
    }
    if (url.pathname.startsWith('/cn/')) {
      const rest = url.pathname.slice('/cn/'.length);
      return Response.redirect(`https://cn.nestliapp.com/${rest}${url.search}`, 301);
    }

    const locale = pickLocale(url.hostname);

    const response = await env.ASSETS.fetch(request);
    const ct = response.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('text/html')) return response;

    const dict = await loadDict(env, request, locale.code);

    const rewriter = new HTMLRewriter()
      .on('html', new LocaleAttrs(locale))
      .on('[data-locale-only]', new LocaleVisibility(locale))
      .on('[data-i18n]', new TextReplacer(dict, 'data-i18n'))
      .on('[data-i18n-html]', new HTMLReplacer(dict))
      .on('[data-i18n-attr]', new AttrReplacer(dict));

    const out = rewriter.transform(response);
    // Make sure caches key on host so cn.* and the apex don't share an entry.
    const headers = new Headers(out.headers);
    headers.append('Vary', 'Host');
    return new Response(out.body, {
      status: out.status,
      statusText: out.statusText,
      headers,
    });
  },
};
