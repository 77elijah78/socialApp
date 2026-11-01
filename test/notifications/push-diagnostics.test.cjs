// Diagnostic classification only. Native/Expo/backend failures are doubles;
// these tests do not identify the user's actual handset configuration.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settle } = require('../messaging/harness.cjs');
const { PushTokenCoordinator } = require('../../src/services/notifications/PushTokenCoordinator.ts');
const identity = { accountId: 'me', authToken: 'test-jwt' };
const coded = (code, message) => Object.assign(new Error(message), { code });
async function failAt(stage, error) {
  const native = { capability: () => ({ available: true }), permission: async () => ({ granted: true, canAskAgain: true }),
    deviceToken: async () => ({ type: 'android', data: 'native-fixture' }), token: async () => 'ExpoPushToken[test]', unregister: async () => {} };
  const backend = { beforeToken: async () => {}, register: async () => {}, revoke: async () => {} };
  const fail = async () => { throw error; };
  if (stage === 'permissions') native.permission = fail;
  if (stage === 'identity') backend.beforeToken = fail;
  if (stage === 'native-token') native.deviceToken = fail;
  if (stage === 'expo-token') native.token = fail;
  if (stage === 'server') backend.register = fail;
  if (stage === 'cleanup') { native.permission = async () => ({ granted: false, canAskAgain: true }); backend.revokeCurrent = async () => {}; native.unregister = fail; }
  const controller = new PushTokenCoordinator(native, backend);
  try { controller.update(identity, true); await settle(); return controller.getSnapshot(); }
  finally { controller.stop(); }
}

test('missing Firebase in the installed APK is actionable instead of hidden by the generic synchronization error', async () => {
  const status = await failAt('native-token', coded('E_REGISTRATION_FAILED',
    'Unable to get Firebase Messaging instance. Did you configure googleServicesFile path in app config? Default FirebaseApp is not initialized. secret-private-value'));
  assert.equal(status.state, 'error');
  assert.match(status.detail, /\[FCM_CONFIG_MISSING\]/);
  assert.match(status.detail, /development build/i);
  assert.equal(status.detail.includes('secret-private-value'), false);
});

const diagnosticCases = [
  ['FCM network/service availability', 'native-token', coded('E_REGISTRATION_FAILED', 'Fetching the token failed: java.io.IOException: SERVICE_NOT_AVAILABLE'), 'FCM_SERVICE_UNAVAILABLE'],
  ['Firebase installations authentication', 'native-token', coded('E_REGISTRATION_FAILED', 'java.io.IOException: FIS_AUTH_ERROR'), 'FIREBASE_INSTALLATION_AUTH'],
  ['Firebase authentication failure', 'native-token', coded('E_REGISTRATION_FAILED', 'AUTHENTICATION_FAILED'), 'FIREBASE_INSTALLATION_AUTH'],
  ['Google Play messaging service missing', 'native-token', coded('E_REGISTRATION_FAILED', 'MISSING_INSTANCEID_SERVICE'), 'GOOGLE_PLAY_SERVICES_UNAVAILABLE'],
  ['Firebase native rate limit', 'native-token', coded('E_REGISTRATION_FAILED', 'TOO_MANY_REGISTRATIONS'), 'FCM_RATE_LIMITED'],
  ['Expo network error', 'expo-token', coded('ERR_NOTIFICATIONS_NETWORK_ERROR', 'Network request failed: secret-original-payload'), 'EXPO_NETWORK_ERROR'],
  ['Expo rate limit numeric status', 'expo-token', coded('ERR_NOTIFICATIONS_SERVER_ERROR', 'expected an OK response, received: 429 (body: secret-original-payload)'), 'EXPO_RATE_LIMITED'],
  ['Expo rate limit status text', 'expo-token', coded('ERR_NOTIFICATIONS_SERVER_ERROR', 'expected an OK response, received: Too Many Requests (body: secret-original-payload)'), 'EXPO_RATE_LIMITED'],
  ['Expo rejected response', 'expo-token', coded('ERR_NOTIFICATIONS_SERVER_ERROR', 'received: Forbidden (body: secret-original-payload)'), 'EXPO_TOKEN_REJECTED'],
  ['missing native module', 'native-token', coded('ERR_UNAVAILABLE', 'private-native-identifiers'), 'NATIVE_MODULE_UNAVAILABLE'],
  ['missing native installation', 'expo-token', coded('ERR_NOTIF_DEVICE_ID', 'private-native-identifiers'), 'NATIVE_INSTALLATION_UNAVAILABLE'],
  ['missing EAS ID', 'expo-token', coded('ERR_NOTIFICATIONS_NO_EXPERIENCE_ID', 'private-native-identifiers'), 'EAS_PROJECT_ID_MISSING'],
  ['missing native package ID', 'expo-token', coded('ERR_NOTIFICATIONS_NO_APPLICATION_ID', 'private-native-identifiers'), 'NATIVE_APP_ID_MISSING'],
];
for (const [name, stage, error, expected] of diagnosticCases) test(`safe actionable diagnostic: ${name}`, async () => {
  const status = await failAt(stage, error);
  assert.equal(status.state, 'error'); assert.ok(status.detail.startsWith(`[${expected}]`), status.detail);
  assert.equal(status.detail.includes('secret-original-payload'), false);
  assert.equal(status.detail.includes('private-native-identifiers'), false);
});

for (const [stage, expected] of Object.entries({ permissions: 'PERMISSION_CHECK_FAILED', identity: 'PUSH_IDENTITY_FAILED', 'native-token': 'FCM_TOKEN_FAILED', 'expo-token': 'EXPO_TOKEN_FAILED', server: 'PUSH_SERVER_FAILED', cleanup: 'PUSH_CLEANUP_FAILED' })) test(`unknown ${stage} errors remain stage-specific without leaking raw data`, async () => {
  const status = await failAt(stage, coded('ExpoPushToken[do-not-copy]', 'secret-token Bearer jwt-credential private-key'));
  assert.ok(status.detail.startsWith(`[${expected}]`), status.detail);
  for (const secret of ['do-not-copy', 'secret-token', 'jwt-credential', 'private-key']) assert.equal(status.detail.includes(secret), false);
});

test('missing Firebase during native cleanup is distinguished from permission denial', async () => {
  const status = await failAt('cleanup', coded('E_REGISTRATION_FAILED', 'Unable to get Firebase Messaging instance. googleServicesFile missing'));
  assert.equal(status.state, 'error'); assert.match(status.detail, /^\[FCM_CONFIG_MISSING\]/);
});
test('a native cause marker can be classified without exposing the exception/cause contents', async () => {
  const error = Object.assign(new Error('wrapped error secret'), { cause: new Error('SERVICE_NOT_AVAILABLE secret') });
  const status = await failAt('native-token', error);assert.match(status.detail, /^\[FCM_SERVICE_UNAVAILABLE\]/);assert.equal(status.detail.includes('secret'), false);
});
test('backend validation and ownership messages remain their existing sanitized actionable messages', async () => {
  const { PushSetupError } = require('../../src/services/notifications/PushBackendService.ts');
  const message = 'Server push is unavailable. Check PUSH_ENABLED=true, the push migration and the deployed backend release.';
  const status = await failAt('server', new PushSetupError(message));assert.equal(status.detail, message);
});
test('a native error for an old account cannot overwrite the new account status', async () => {
  const { deferred } = require('../messaging/harness.cjs');const gate=deferred();let first=true;
  const controller=new PushTokenCoordinator({capability:()=>({available:true}),permission:async()=>({granted:true,canAskAgain:true}),deviceToken:async()=>({type:'android',data:'fixture'}),token:async()=>{if(first){first=false;return gate.promise;}return'ExpoPushToken[new]';},unregister:async()=>{}},{register:async()=>{},revoke:async()=>{}});
  try { controller.update(identity,true);await settle();controller.update({accountId:'new-owner',authToken:'new-jwt'},true);gate.reject(coded('E_REGISTRATION_FAILED','Default FirebaseApp is not initialized'));await settle();assert.equal(controller.getSnapshot().state,'ready');assert.equal(controller.getSnapshot().detail.includes('FCM_CONFIG_MISSING'),false); }
  finally {controller.stop();}
});
