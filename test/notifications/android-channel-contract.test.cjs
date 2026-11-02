// Executes the installed Expo Android JS wrapper, but not Android Java/native
// rendering. Native-source assertions pin why omission is correct for SDK 56.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mock, native } = require('../messaging/harness.cjs');
const sdk = path.dirname(require.resolve('expo-notifications/package.json'));
const captured = [];
mock('expo-modules-core', { UnavailabilityError: class UnavailabilityError extends Error {} });
mock(path.join(sdk, 'src/NotificationChannelManager'), {
  async setNotificationChannelAsync(id, options) { captured.push({ id, options }); return { id, ...options }; },
});
const types = require(path.join(sdk, 'src/NotificationChannelManager.types.ts'));
const { setNotificationChannelAsync } = require(path.join(sdk, 'src/setNotificationChannelAsync.android.ts'));
mock('expo-notifications', { ...types, setNotificationChannelAsync });
mock('expo-constants', { executionEnvironment: 'bare' });
native.Platform.OS = 'android';
const { ensureMessageChannel } = require('../../src/services/notifications/NativeMessageNotifications.ts');

test('actual Expo Android wrapper receives no sound key while channel identity/importance/privacy remain unchanged', async () => {
  await ensureMessageChannel();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].id, 'messages');
  assert.equal(captured[0].options.importance, types.AndroidImportance.HIGH);
  assert.equal(captured[0].options.lockscreenVisibility, types.AndroidNotificationVisibility.PRIVATE);
  assert.equal(Object.hasOwn(captured[0].options, 'sound'), false);
  assert.equal(Object.hasOwn(captured[0].options, 'audioAttributes'), false);
  assert.equal(captured[0].options.enableVibrate, true);
});

test('installed native SDK differentiates omitted system-default sound from null silence and custom resource strings', () => {
  const manager = fs.readFileSync(path.join(sdk, 'android/src/main/java/expo/modules/notifications/notifications/channels/managers/AndroidXNotificationsChannelManager.java'), 'utf8');
  const validation = manager.slice(manager.indexOf('public boolean customSoundExists'), manager.indexOf('protected Uri createSoundUriFromArguments'));
  const resolution = manager.slice(manager.indexOf('protected Uri createSoundUriFromArguments'), manager.indexOf('protected long[] createVibrationPatternFromList'));
  assert.match(validation, /if\s*\(!args\.containsKey\(SOUND_KEY\)\)\s*\{\s*return true;/);
  assert.match(validation, /return mSoundResolver\.resourceExists\(filename\);/);
  assert.match(resolution, /if\s*\(!args\.containsKey\(SOUND_KEY\)\)\s*\{\s*return Settings\.System\.DEFAULT_NOTIFICATION_URI;/);
  assert.match(resolution, /if\s*\(filename == null\)\s*\{\s*return null;/);
  assert.match(resolution, /return mSoundResolver\.resolve\(filename\);/);
});
