import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const homeHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const downloadsHtml = await readFile(
  new URL('../downloads/index.html', import.meta.url),
  'utf8',
);

test('homepage links the Google Play button to the published Android app', () => {
  const googlePlayButton = [...homeHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .find(([, , content]) => (
      content.includes('data-i18n="page.home.btn.googlePlay"')
    ));

  assert.ok(googlePlayButton, 'Google Play button should be an active link');
  const [, attributes] = googlePlayButton;
  assert.match(
    attributes,
    /href="https:\/\/play\.google\.com\/store\/apps\/details\?id=au\.com\.clarechen\.nestli"/,
  );
  assert.match(attributes, /target="_blank"/);
  assert.match(attributes, /rel="noreferrer"/);
  assert.doesNotMatch(attributes, /\bplaceholder\b|aria-disabled=/);
});

test('download cards publish APK version 1.0.1', () => {
  assert.match(
    downloadsHtml,
    /href="https:\/\/github\.com\/jimmy1992abc\/nestli-legal\/releases\/download\/v1\.0\.1\/nestli-release\.apk"/,
  );
  assert.match(
    downloadsHtml,
    /data-href="https:\/\/gitee\.com\/jimmy1992abc\/nestli\/releases\/download\/v1\.0\.1\/nestli-release-cn\.apk"/,
  );

  const versionLabels = [
    ...downloadsHtml.matchAll(/<div class="dl-meta">(v[^<]+)<\/div>/g),
  ].map((match) => match[1]);

  assert.deepEqual(versionLabels, [
    'v1.0.1 · Android 7.0+',
    'v1.0.1 · 安卓 7.0 及以上',
  ]);
});
