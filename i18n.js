// Language switcher runtime.
//
// The static HTML on every page ships with a [data-lang-switcher] block
// holding one <a class="lang-link"> per supported locale, each pointing at
// that locale's apex (e.g. https://nestliapp.com/, https://cn.nestliapp.com/).
//
// At load time this script:
//   1. Rewrites each link to preserve the current path + query, so a
//      visitor on /pricing/ swapping language lands on /pricing/ on the
//      other host instead of being kicked to the home page.
//   2. Marks the link whose hostname matches the active locale as the
//      current one, by replacing the <a> with a <span class="lang-active">.
//
// The active locale is read from <html data-locale="...">. The Cloudflare
// Worker on cn.nestliapp.com sets this to "zh-Hans". Static HTML served
// by GitHub Pages on nestliapp.com keeps the default ("en"). Adding a
// future locale only requires adding its <a> in the switcher HTML and an
// entry in LOCALE_HOSTS below.
(function () {
  var LOCALE_HOSTS = {
    'en':      'nestliapp.com',
    'zh-Hans': 'cn.nestliapp.com'
  };

  var html = document.documentElement;
  var activeLocale = html.getAttribute('data-locale') || 'en';
  var activeHost = LOCALE_HOSTS[activeLocale] || LOCALE_HOSTS.en;

  var path = location.pathname + location.search;

  // Locale-scoped blocks (e.g. the mainland China download warning) should
  // disappear when not relevant to the active locale. The Worker on
  // cn.nestliapp.com strips them server-side; on the GitHub Pages mirror
  // we have to handle it here so English visitors don't see Chinese-only
  // shells (empty boxes with stale styling).
  document.querySelectorAll('[data-locale-only]').forEach(function (el) {
    var allowed = (el.getAttribute('data-locale-only') || '').split(/\s+/).filter(Boolean);
    if (allowed.length && allowed.indexOf(activeLocale) === -1) {
      el.remove();
    }
  });

  document.querySelectorAll('[data-lang-switcher] a.lang-link').forEach(function (a) {
    var u;
    try { u = new URL(a.href); } catch (e) { return; }

    a.href = u.protocol + '//' + u.hostname + path;

    if (u.hostname === activeHost) {
      var span = document.createElement('span');
      span.className = 'lang-active';
      span.setAttribute('aria-current', 'true');
      span.textContent = a.textContent;
      a.replaceWith(span);
    }
  });
})();
