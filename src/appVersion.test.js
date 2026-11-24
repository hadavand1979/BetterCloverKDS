const test = require('node:test');
const assert = require('node:assert/strict');
const { appVersionText, installedAppVersion } = require('./appVersion');

test('android and apple settings name the installed version and build', () => {
  assert.equal(appVersionText({ platform: 'android', version: '1.0.0', build: '3' }), 'Android version 1.0.0, build 3');
  assert.equal(appVersionText({ platform: 'ios', version: '1.0.0', build: '2' }), 'Apple version 1.0.0, build 2');
});

test('a phone build uses the installed binary, and web falls back to the app config', () => {
  const constants = { expoConfig: { version: '1.0.0', android: { versionCode: 3 }, ios: { buildNumber: '2' } } };
  assert.equal(
    installedAppVersion({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '4' }, constants, 'android'),
    'Android version 1.0.0, build 4',
  );
  assert.equal(installedAppVersion({}, constants, 'ios'), 'Apple version 1.0.0, build 2');
  assert.equal(installedAppVersion({}, constants, 'web'), 'This screen version 1.0.0');
});
