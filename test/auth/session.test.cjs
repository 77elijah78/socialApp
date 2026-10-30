// Real Redux + auth layout + AuthService/form. Native navigation/storage/HTTP
// boundaries are adapted; these are not installed-device or live-account tests.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { configureStore } = require("@reduxjs/toolkit");
const { Provider, useDispatch, useSelector } = require("react-redux");
const { mock, deferred } = require("../messaging/harness.cjs");

let routes = [];
let Screen;
function Stack({ children }) {
  return React.createElement("Stack", null, children, Screen && React.createElement(Screen));
}
Stack.Screen = "StackScreen";
function Redirect({ href }) {
  React.useEffect(() => { routes.push(href); }, [href]);
  return React.createElement("Redirect", { href });
}
mock("expo-router", {
  Stack, Redirect,
  router: { replace: path => routes.push(path), push: path => routes.push(path) },
});
mock("@/store/hooks", { useAppDispatch: useDispatch, useAppSelector: useSelector });
mock("react-native-safe-area-context", {
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
});
mock("react-native-keyboard-controller", { KeyboardAwareScrollView: "KeyboardAwareScrollView" });
let prepare;
mock("@/services/MessagingCache", { prepareMessagingAccount: id => prepare(id) });
mock("@/services/MediaService", { mediaService: { message: { resetSession() {} }, disconnectSocket() {} } });
let write;
mock("@react-native-async-storage/async-storage", {
  getItem: async () => null,
  setItem: (key, value) => write(key, value),
  removeItem: async () => {},
});
const { getAccessToken, setTokens } = require("../../src/services/api.ts");
const { authService } = require("../../src/services/AuthService.ts");
const { default: authReducer, setCredentials } = require("../../src/store/slices/authSlice.ts");
const AuthLayout = require("../../src/app/(auth)/_layout.tsx").default;
const Login = require("../../src/app/(auth)/login.tsx").default;
const Signup = require("../../src/app/(auth)/register.tsx").default;
const user = { id: "fixture-user", username: "alice", email: "alice@example.test", displayName: "Alice", bio: null };
const credentials = { user, token: "fixture-access", refreshToken: "fixture-refresh" };
let store;
let renderer;
let writes;
let activationTokens;
let unsubscribe;

beforeEach(() => {
  routes = [];
  writes = [];
  activationTokens = [];
  Screen = Login;
  prepare = async () => {};
  write = async (key, value) => { writes.push({ key, value }); };
  setTokens(null, null);
  store = configureStore({ reducer: { auth: authReducer } });
  unsubscribe = store.subscribe(() => {
    if (store.getState().auth.isAuthenticated) activationTokens.push(getAccessToken());
  });
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ success: true, data: { user, accessToken: credentials.token, refreshToken: credentials.refreshToken } }),
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  unsubscribe();
  setTokens(null, null);
});
async function mount() {
  await act(async () => {
    renderer = create(React.createElement(Provider, { store }, React.createElement(AuthLayout)));
  });
}
const auth = () => store.getState().auth;
const call = mode => mode === "login"
  ? authService.login(user.email, "unchanged password", store.dispatch)
  : authService.register(user.email, "unchanged password", user.username, user.displayName, store.dispatch);

test("an authenticated Redux transition leaves the auth group without a form callback or app restart", async () => {
  await mount();
  assert.equal(renderer.root.findAllByType("TextInput").length, 2);
  await act(async () => {
    setTokens(credentials.token, credentials.refreshToken);
    store.dispatch(setCredentials(credentials));
  });
  assert.deepEqual(routes, ["/(tabs)/home"]);
  assert.equal(renderer.root.findAllByType("TextInput").length, 0);
  assert.equal(renderer.root.findByType("Redirect").props.href, "/(tabs)/home");
});

test("an already authenticated auth-group mount redirects immediately, including a deep link or remount", async () => {
  setTokens(credentials.token, credentials.refreshToken);
  store.dispatch(setCredentials(credentials));
  await mount();
  assert.deepEqual(routes, ["/(tabs)/home"]);
  assert.equal(renderer.root.findAllByType("TextInput").length, 0);
});

test("a partial persisted session without an access token is not admitted by the auth-group guard", async () => {
  store.dispatch(setCredentials({ ...credentials, token: "" }));
  await mount();
  assert.deepEqual(routes, []);
  assert.equal(renderer.root.findAllByType("TextInput").length, 2);
});

for (const mode of ["login", "register"]) {
  test(`${mode}: persistence rejection cannot publish an authenticated half-session`, async () => {
    Screen = mode === "login" ? Login : Signup;
    write = async () => { throw new Error("Fixture storage unavailable"); };
    await mount();
    await act(async () => {
      await assert.rejects(call(mode), /Fixture storage unavailable/);
    });
    assert.equal(auth().isAuthenticated, false);
    assert.equal(auth().user, null);
    assert.equal(getAccessToken(), null);
    assert.deepEqual(routes, []);
    assert.deepEqual(activationTokens, []);
  });

  test(`${mode}: persistence completes before API tokens and Redux make the account visible`, async () => {
    Screen = mode === "login" ? Login : Signup;
    const pending = deferred();
    write = (key, value) => { writes.push({ key, value }); return pending.promise; };
    await mount();
    let work;
    await act(async () => { work = call(mode); });
    try {
      assert.deepEqual(writes, [{ key: "refreshToken", value: credentials.refreshToken }]);
      assert.equal(auth().isAuthenticated, false);
      assert.equal(getAccessToken(), null);
      assert.deepEqual(routes, []);
    } finally {
      await act(async () => { pending.resolve(); await work; });
    }
    assert.equal(auth().isAuthenticated, true);
    assert.deepEqual(activationTokens, [credentials.token], "subscribers must see the correct API identity at activation");
    assert.deepEqual(routes, ["/(tabs)/home"]);
  });

  test(`${mode}: account/cache preparation failure never commits credentials`, async () => {
    prepare = async () => { throw new Error("Fixture cache unavailable"); };
    await mount();
    await assert.rejects(call(mode), /Fixture cache unavailable/);
    assert.equal(auth().isAuthenticated, false);
    assert.equal(getAccessToken(), null);
    assert.deepEqual(writes, []);
    assert.deepEqual(routes, []);
  });

  test(`${mode}: real form success has one state-driven Home transition`, async () => {
    Screen = mode === "login" ? Login : Signup;
    await mount();
    for (const [id, value] of [
      ...(mode === "register" ? [["auth-full-name", "Alice"]] : []),
      ["auth-email", user.email], ["auth-password", "unchanged password"],
    ]) {
      await act(async () => renderer.root.findByProps({ testID: id }).props.onChangeText(value));
    }
    await act(async () => renderer.root.findByType("TouchableOpacity").props.onPress());
    assert.equal(auth().isAuthenticated, true);
    assert.deepEqual(activationTokens, [credentials.token]);
    assert.deepEqual(routes, ["/(tabs)/home"], "the auth guard, not competing imperative form navigation, owns Home");
    assert.equal(renderer.root.findAllByType("TextInput").length, 0);
  });
}

test("storage failure is shown on the form, and retry reaches Home without restarting", async () => {
  write = async () => { throw new Error("Fixture storage unavailable"); };
  await mount();
  for (const [id, value] of [["auth-email", user.email], ["auth-password", "unchanged password"]]) {
    await act(async () => renderer.root.findByProps({ testID: id }).props.onChangeText(value));
  }
  await act(async () => renderer.root.findByType("TouchableOpacity").props.onPress());
  assert.equal(auth().isAuthenticated, false);
  assert.deepEqual(routes, []);
  assert.ok(renderer.root.findAllByProps({ accessibilityRole: "alert" }).length);
  assert.equal(renderer.root.findByType("TouchableOpacity").props.disabled, false);
  write = async (key, value) => { writes.push({ key, value }); };
  await act(async () => renderer.root.findByType("TouchableOpacity").props.onPress());
  assert.equal(auth().isAuthenticated, true);
  assert.deepEqual(routes, ["/(tabs)/home"]);
});

const Entry = require("../../src/app/index.tsx").default;
for (const [label, token, target] of [
  ["partial", "", "/(auth)/login"],
  ["complete", credentials.token, "/(tabs)/home"],
]) {
  test(`cold entry uses the same ${label} session rule as the auth layout`, async () => {
    store.dispatch(setCredentials({ ...credentials, token }));
    await act(async () => {
      renderer = create(React.createElement(Provider, { store }, React.createElement(Entry)));
    });
    assert.deepEqual(routes, [target]);
  });
}
