// Locale-scoped block stripping for the GitHub Pages mirror.
//
// Some pages have content that only applies to a specific locale — e.g. the
// mainland China download warning at /downloads/. The Cloudflare Worker on
// cn.nestliapp.com strips elements whose `data-locale-only` doesn't match
// the active locale before serving. Static GitHub Pages at nestliapp.com
// has no Worker, so without this script English visitors would see empty
// styled shells (e.g. a yellow warning box with no content) where those
// blocks live in the source HTML.
//
// The script reads the active locale from `<html data-locale="...">`. Each
// element with `data-locale-only="zh-Hans"` (or a space-separated list of
// locales) is removed when the active locale is not in that list.
(function () {
  var activeLocale = document.documentElement.getAttribute('data-locale') || 'en';
  document.querySelectorAll('[data-locale-only]').forEach(function (el) {
    var allowed = (el.getAttribute('data-locale-only') || '').split(/\s+/).filter(Boolean);
    if (allowed.length && allowed.indexOf(activeLocale) === -1) {
      el.remove();
    }
  });
})();
