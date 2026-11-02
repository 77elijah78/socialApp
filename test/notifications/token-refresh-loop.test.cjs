// Mounted actual root host/controller/helpers + installed SDK token reader,
// emitter and Expo exchange. Native token events and HTTP are test doubles.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { mock, native, settle } = require('../messaging/harness.cjs');
const sdkRoot = path.dirname(require.resolve('expo-notifications/package.json'));
const listeners = new Set(), requests = [], registrations = [];
let nativeReads = 0, nativeValue = 'fcm_token_A';
const emit = value => { for (const listener of listeners) listener({ devicePushToken: value }); };
const manager = {
  async getDevicePushTokenAsync() {
    nativeReads++;
    // Bound the broken pre-fix loop so this regression cannot run forever.
    if (nativeReads > 3) throw new Error('Repeated native lookup: refresh loop');
    const token = nativeValue;
    queueMicrotask(() => emit(token)); // SDK native implementation emits on every successful lookup.
    return token;
  },
  addListener(name, callback) { assert.equal(name, 'onDevicePushToken'); listeners.add(callback); return { remove: () => listeners.delete(callback) }; },
};
class CodedError extends Error { constructor(code, message) { super(message); this.code = code; } }
native.Platform.OS = 'android';
mock('expo-modules-core', { Platform: native.Platform, CodedError, UnavailabilityError: CodedError });
mock('expo-constants', { executionEnvironment: 'bare', easConfig: { projectId: '00000000-0000-4000-8000-000000000001' } });
mock('expo-device', { isDevice: true });
mock('expo-application', { applicationId: 'com.elijah77.social' });
mock(path.join(sdkRoot, 'src/PushTokenManager'), manager);
mock(path.join(sdkRoot, 'src/ServerRegistrationModule'), { getInstallationIdAsync: async () => 'sdk-installation' });
mock(path.join(sdkRoot, 'src/DevicePushTokenAutoRegistration.fx'), { setAutoServerRegistrationEnabledAsync: async () => {} });
mock(path.join(sdkRoot, 'src/warnOfExpoGoPushUsage'), { warnOfExpoGoPushUsage() {} });
const { getDevicePushTokenAsync } = require(path.join(sdkRoot, 'src/getDevicePushTokenAsync.ts'));
const { getExpoPushTokenAsync } = require(path.join(sdkRoot, 'src/getExpoPushTokenAsync.ts'));
const { addPushTokenListener } = require(path.join(sdkRoot, 'src/TokenEmitter.ts'));
mock('expo-notifications', { getDevicePushTokenAsync, getExpoPushTokenAsync, addPushTokenListener,
  setNotificationHandler() {}, setNotificationChannelAsync: async () => {}, AndroidImportance: { HIGH: 6 }, AndroidNotificationVisibility: { PRIVATE: 0 },
  getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }) });
const helper = require('../../src/services/notifications/NativeMessageNotifications.ts');
const { PushTokenCoordinator } = require('../../src/services/notifications/PushTokenCoordinator.ts');
const identity = { accountId: 'account-A', authToken: 'jwt-A' };
const controller = new PushTokenCoordinator({ capability: helper.pushCapability, permission: helper.readPushPermission,
  deviceToken: () => helper.getAndroidPushDeviceToken(), token: value => helper.getMessagePushToken(value), unregister: async () => {} }, {
  register: async value => { assert.match(value, /^ExpoPushToken\[/); registrations.push(value); }, revoke: async () => {},
});
mock('@/store/hooks', { useAppSelector: selector => selector({ auth: { isAuthenticated: true, user: { id: identity.accountId }, token: identity.authToken }, app: { notificationsEnabled: true } }) });
mock('@/providers/OverlayProvider', { useOverlayVisible: () => false });
mock('expo-router', { useGlobalSearchParams: () => ({}), useSegments: () => ['(tabs)', 'home'], useRootNavigationState: () => ({ key: 'ready-root' }) });
mock('@/services/notifications/MessageNotifications', { messagePush: controller,
  messageNotifications: { banners: { subscribe: () => () => {}, getSnapshot: () => null }, getAccountId: () => identity.accountId },
  startMessageNotifications: () => () => controller.stop(), updateMessageNotificationScope: () => controller.update(identity, true), refreshMessagePush: () => controller.refresh(),
});
const Host = require('../../src/components/notifications/MessageNotificationsHost.tsx').default;

test('SDK fetch-emitted token event does not re-enter native lookup or registration; real rotation still registers once', async () => {
  const originalFetch = global.fetch; let root;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://exp.host/--/api/v2/push/getExpoPushToken');
    const body = JSON.parse(options.body); requests.push(body);
    return { ok: true, json: async () => ({ data: { expoPushToken: `ExpoPushToken[${body.deviceToken}]` } }) };
  };
  try {
    await act(async () => { root = create(React.createElement(Host)); await settle(); });
    assert.equal(nativeReads, 1, 'one native lookup: its own onDevicePushToken event must not start another');
    assert.equal(requests.length, 1); assert.equal(registrations.length, 1);
    assert.equal(controller.getSnapshot().state, 'ready'); assert.equal(listeners.size, 1);
    await act(async () => { nativeValue = 'fcm_token_B'; emit(nativeValue); emit(nativeValue); emit(nativeValue); await settle(); });
    assert.equal(nativeReads, 1, 'rotation payload is exchanged directly, not looked up again');
    assert.equal(requests.length, 2); assert.equal(requests[1].deviceToken, 'fcm_token_B');
    assert.equal(registrations.length, 2); assert.equal(controller.getSnapshot().state, 'ready');
    const stable = requests.length; await act(async () => { await settle(); }); assert.equal(requests.length, stable);
  } finally {
    if (root) await act(async () => { root.unmount(); await settle(); }); controller.stop(); global.fetch = originalFetch;
  }
  assert.equal(listeners.size, 0);
});

test('installed SDK explicitly emits a token event from lookup and supports a supplied token to skip that lookup', () => {
  const nativeSource = fs.readFileSync(path.join(sdkRoot, 'android/src/main/java/expo/modules/notifications/tokens/PushTokenModule.kt'), 'utf8');
  const exchangeSource = fs.readFileSync(path.join(sdkRoot, 'src/getExpoPushTokenAsync.ts'), 'utf8');
  assert.match(nativeSource, /promise\.resolve\(token\)\s+onNewToken\(token\)/);
  assert.match(exchangeSource, /options\.devicePushToken\s*\|\|\s*\(await getDevicePushTokenAsync\(\)\)/);
});
