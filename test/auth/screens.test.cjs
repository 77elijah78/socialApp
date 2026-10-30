// Real auth screens, form hook, validation, AuthService and Redux reducer.
// Only native UI, routing, HTTP, account setup and token persistence are mocked.
// These are not real-credential or native keyboard/visual tests.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { mock, native, storage, deferred } = require("../messaging/harness.cjs");

let environment = { keyboard: false, width: 390, height: 844, insets: { top: 44, bottom: 34, left: 0, right: 0 } };
const listeners = new Set();
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => environment;
function useEnvironment() { return React.useSyncExternalStore(subscribe, snapshot); }
mock("react-native-safe-area-context", {
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => useEnvironment().insets,
});
mock("react-native-keyboard-controller", {
  KeyboardAwareScrollView: "KeyboardAwareScrollView",
});
let routes = [];
function Stack(props) { return React.createElement("Stack", props, props.children); }
Stack.Screen = "StackScreen";
mock("expo-router", {
  Stack,
  router: {
    replace: (path) => routes.push({ method: "replace", path }),
    push: (path) => routes.push({ method: "push", path }),
  },
});
let prepared = [];
let tokens = [];
let actions = [];
let authState;
mock("@/services/MessagingCache", { prepareMessagingAccount: async (id) => prepared.push(id) });
mock("@/services/MediaService", { mediaService: { message: { resetSession() {} }, disconnectSocket() {} } });
mock("@/services/api", { setTokens: (...value) => tokens.push(value) });
const authReducer = require("../../src/store/slices/authSlice.ts").default;
const dispatch = (action) => { actions.push(action); authState = authReducer(authState, action); };
mock("@/store/hooks", { useAppDispatch: () => dispatch });

const Login = require("../../src/app/(auth)/login.tsx").default;
const Signup = require("../../src/app/(auth)/register.tsx").default;
const Recovery = require("../../src/app/(auth)/forgot-password.tsx").default;
const AuthLayout = require("../../src/app/(auth)/_layout.tsx").default;
const { validateAuthForm, usernameFromName, passwordStrength, authErrorMessage } = require("../../src/utils/authForm.ts");
const { COLORS, SPACING } = require("../../src/constants/theme.ts");
let renderer;
let requests = [];
let response;
let focused = [];
const serverUser = {
  id: "user-1", username: "alice_lovelace", email: "alice@example.com",
  displayName: "Alice Lovelace", bio: null, avatarUrl: null,
};
const success = () => ({
  ok: true,
  json: async () => ({ success: true, data: { user: serverUser, accessToken: "access-token", refreshToken: "refresh-token" } }),
});
const failure = (message) => ({ ok: false, json: async () => ({ success: false, message }) });
const flatten = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const byType = (type) => renderer.root.findByType(type);
const input = (id) => renderer.root.findAllByType("TextInput").find((node) => node.props.testID === id);
const submitButton = () => renderer.root.findByType("TouchableOpacity");
const link = (label) => renderer.root.findAllByType("Pressable").find((node) => node.props.accessibilityLabel === label);
const hasText = (text) => renderer.root.findAllByType("Text").some((node) => node.children.filter((child) => typeof child === "string").join("").includes(text));

beforeEach(() => {
  environment = { keyboard: false, width: 390, height: 844, insets: { top: 44, bottom: 34, left: 0, right: 0 } };
  native.Platform.OS = "ios";
  routes = [];
  prepared = [];
  tokens = [];
  actions = [];
  requests = [];
  focused = [];
  storage.clear();
  authState = authReducer(undefined, { type: "test/init" });
  response = async () => success();
  global.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return response(url, options);
  };
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  assert.equal(listeners.size, 0, "safe-area subscriptions clean up on unmount");
});
async function mount(Component) {
  await act(async () => {
    renderer = create(React.createElement(Component), {
      createNodeMock: (element) => element.type === "TextInput"
        ? { focus: () => focused.push(element.props.testID) }
        : null,
    });
  });
}
async function fill(id, value) { await act(async () => input(id).props.onChangeText(value)); }
async function pressSubmit() { await act(async () => submitButton().props.onPress()); }
async function changeEnvironment(next) {
  await act(async () => {
    environment = { ...environment, ...next };
    for (const listener of listeners) listener();
  });
}
async function fillValid(Component) {
  await mount(Component);
  if (Component === Signup) await fill("auth-full-name", "Alice Lovelace");
  await fill("auth-email", "  alice@example.com  ");
  await fill("auth-password", "  Unchanged password!  ");
}

test("validation preserves generated usernames, login identities, and untrimmed/password policy semantics", () => {
  assert.equal(usernameFromName("Alice Lovelace"), "alice_lovelace");
  assert.equal(usernameFromName("  A.B C!  "), "_ab_c_");
  assert.equal(usernameFromName("東京"), "");
  assert.deepEqual(validateAuthForm("login", { fullName: "", email: "alice_lovelace", password: "x" }), {});
  assert.deepEqual(validateAuthForm("register", { fullName: "Alice", email: "alice@example.com", password: "x" }), {});
  assert.ok(validateAuthForm("register", { fullName: "", email: "not-an-email", password: "" }).email);
  assert.ok(validateAuthForm("register", { fullName: "東京", email: "a@b.co", password: "x" }).fullName);
  assert.equal(passwordStrength("").score, 0);
  assert.equal(passwordStrength("x").label, "Weak");
  assert.equal(passwordStrength("a long password 123!").label, "Strong");
  assert.equal(authErrorMessage({ message: "A server detail" }, "login"), "A server detail");
  assert.equal(authErrorMessage(null, "login"), "Please check your credentials and try again.");
});

test("login opens empty, with real fields/navigation and no demo credentials or nonfunctional social buttons", async () => {
  await mount(Login);
  assert.equal(input("auth-email").props.value, "");
  assert.equal(input("auth-password").props.value, "");
  assert.equal(input("auth-email").props.accessibilityLabel, "Email or username");
  assert.equal(input("auth-password").props.secureTextEntry, true);
  assert.equal(renderer.root.findAllByType("Image").length, 0);
  assert.equal(hasText("Welcome back."), true);
  assert.equal(hasText("Google"), false);
  assert.equal(hasText("Apple"), false);
  assert.equal(submitButton().props.accessibilityState.busy, false);
});

for (const Component of [Login, Signup]) {
  test(`${Component.name}: password visibility preserves the native input instance and value`, async () => {
    await mount(Component);
    await fill("auth-password", "Do not erase this!");
    const password = input("auth-password");
    for (const [label, secure] of [["Show password", false], ["Hide password", true], ["Show password", false]]) {
      await act(async () => link(label).props.onPress());
      assert.equal(input("auth-password"), password);
      assert.equal(password.props.secureTextEntry, secure);
      assert.equal(password.props.value, "Do not erase this!");
    }
  });
}

test("empty login shows required field errors, focuses the first invalid input, and does not call HTTP", async () => {
  await mount(Login);
  await pressSubmit();
  assert.equal(hasText("Enter your email or username."), true);
  assert.equal(hasText("Enter your password."), true);
  assert.deepEqual(focused, ["auth-email"]);
  assert.equal(requests.length, 0);
  await fill("auth-email", "alice");
  await pressSubmit();
  assert.equal(hasText("Enter your email or username."), false);
  assert.equal(focused.at(-1), "auth-password");
  assert.equal(requests.length, 0);
});

test("valid login uses the unchanged AuthService JSON, prepares the account and persists real Redux credentials/tokens", async () => {
  await fillValid(Login);
  await pressSubmit();
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/api\/v1\/auth\/login$/);
  assert.deepEqual(requests[0].body, { email: "alice@example.com", password: "  Unchanged password!  " });
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(prepared, ["user-1"]);
  assert.equal(actions[0].type, "auth/setCredentials");
  assert.equal(authState.isAuthenticated, true);
  assert.equal(authState.user.id, "user-1");
  assert.equal(authState.token, "access-token");
  assert.deepEqual(tokens, [["access-token", "refresh-token"]]);
  assert.equal(storage.get("refreshToken"), "refresh-token");
  assert.deepEqual(routes, [{ method: "replace", path: "/(tabs)/home" }]);
});

test("invalid login displays the server rejection inline, preserves fields and never navigates or persists credentials", async () => {
  response = async () => failure("Invalid email or password.");
  await fillValid(Login);
  await pressSubmit();
  assert.equal(hasText("Invalid email or password."), true);
  assert.equal(hasText("Couldn’t log you in"), true);
  assert.equal(input("auth-password").props.value, "  Unchanged password!  ");
  assert.equal(submitButton().props.accessibilityState.busy, false);
  assert.equal(renderer.root.findAllByProps({ accessibilityRole: "alert" }).length > 0, true);
  assert.deepEqual(routes, []);
  assert.deepEqual(tokens, []);
  assert.deepEqual(prepared, []);
  assert.equal(authState.isAuthenticated, false);
  await fill("auth-email", "other@example.com");
  assert.equal(hasText("Invalid email or password."), false);
});

test("network errors preserve their message and retry works without changing AuthService behavior", async () => {
  response = async () => { throw new Error("Network request failed."); };
  await fillValid(Login);
  await pressSubmit();
  assert.equal(hasText("Network request failed."), true);
  assert.equal(submitButton().props.disabled, false);
  response = async () => success();
  await pressSubmit();
  assert.equal(requests.length, 2);
  assert.equal(authState.isAuthenticated, true);
  assert.equal(routes.at(-1).path, "/(tabs)/home");
});

for (const Component of [Login, Signup]) {
  test(`${Component.name}: loading disables edits/navigation, keeps button size, and blocks rapid duplicate requests`, async () => {
    const pending = deferred();
    response = () => pending.promise;
    await fillValid(Component);
    const button = submitButton();
    const styleBefore = flatten(button.props.style);
    const handler = button.props.onPress;
    await act(async () => { handler(); handler(); });
    assert.equal(requests.length, 1);
    assert.equal(button.props.disabled, true);
    assert.equal(button.props.accessibilityState.busy, true);
    assert.equal(input("auth-email").props.editable, false);
    assert.equal(link(Component === Login ? "Create an account" : "Log in instead").props.disabled, true);
    assert.equal(flatten(button.props.style).minHeight, styleBefore.minHeight);
    assert.equal(renderer.root.findAllByType("ActivityIndicator").length, 1);
    await act(async () => pending.resolve(failure("Please try again later.")));
    assert.equal(button.props.disabled, false);
    assert.equal(input("auth-email").props.editable, true);
    assert.equal(hasText("Please try again later."), true);
  });
}

test("signup validates missing/invalid information before HTTP and updates validation on edit/blur", async () => {
  await mount(Signup);
  await pressSubmit();
  assert.equal(hasText("Enter your full name."), true);
  assert.equal(hasText("Enter your email address."), true);
  assert.equal(hasText("Enter your password."), true);
  assert.equal(focused.at(-1), "auth-full-name");
  await fill("auth-full-name", "Alice Lovelace");
  await fill("auth-email", "not-an-email");
  await fill("auth-password", "x");
  assert.equal(hasText("Enter your full name."), false);
  assert.equal(hasText("Enter a valid email address."), true);
  await pressSubmit();
  assert.equal(requests.length, 0);
  assert.equal(focused.at(-1), "auth-email");
  assert.equal(hasText("Your username will be @alice_lovelace"), true);
});

test("signup keeps generated username/displayName and token/account integration; strength feedback does not reject a short password", async () => {
  await fillValid(Signup);
  await fill("auth-password", "x");
  assert.equal(hasText("Weak"), true);
  await pressSubmit();
  assert.match(requests[0].url, /\/api\/v1\/auth\/register$/);
  assert.deepEqual(requests[0].body, {
    email: "alice@example.com", password: "x", username: "alice_lovelace", displayName: "Alice Lovelace",
  });
  assert.equal(authState.isAuthenticated, true);
  assert.equal(storage.get("refreshToken"), "refresh-token");
  assert.deepEqual(prepared, ["user-1"]);
  assert.deepEqual(tokens, [["access-token", "refresh-token"]]);
  assert.equal(routes.at(-1).path, "/(tabs)/home");
});

for (const message of ["Email already registered.", "Password does not meet the server policy."]) {
  test(`signup preserves server validation feedback: ${message}`, async () => {
    response = async () => failure(message);
    await fillValid(Signup);
    await pressSubmit();
    assert.equal(hasText(message), true);
    assert.equal(hasText("Couldn’t create your account"), true);
    assert.equal(input("auth-full-name").props.value, "Alice Lovelace");
    assert.deepEqual(tokens, []);
    assert.deepEqual(routes, []);
  });
}

test("focus/blur state and keyboard Next actions work through shared field refs", async () => {
  await mount(Signup);
  await act(async () => input("auth-full-name").props.onFocus({ nativeEvent: {} }));
  assert.equal(flatten(input("auth-full-name").parent.props.style).borderColor, COLORS.primary);
  await act(async () => input("auth-full-name").props.onBlur({ nativeEvent: {} }));
  assert.equal(hasText("Enter your full name."), true);
  await act(async () => input("auth-full-name").props.onSubmitEditing());
  await act(async () => input("auth-email").props.onSubmitEditing());
  assert.deepEqual(focused, ["auth-email", "auth-password"]);
});

test("login/signup navigation and forgot-password route are correct; recovery no longer claims a fake reset", async () => {
  await mount(Login);
  await act(async () => link("Create an account").props.onPress());
  assert.deepEqual(routes.at(-1), { method: "replace", path: "/(auth)/register" });
  await act(async () => link("Forgot password?").props.onPress());
  assert.deepEqual(routes.at(-1), { method: "push", path: "/(auth)/forgot-password" });
  await act(async () => renderer.unmount());
  renderer = null;
  await mount(Signup);
  await act(async () => link("Log in instead").props.onPress());
  assert.deepEqual(routes.at(-1), { method: "replace", path: "/(auth)/login" });
  await act(async () => renderer.unmount());
  renderer = null;
  await mount(Recovery);
  assert.equal(hasText("Password reset isn’t connected yet"), true);
  assert.equal(renderer.root.findAllByType("TextInput").length, 0);
  await act(async () => submitButton().props.onPress());
  assert.deepEqual(routes.at(-1), { method: "replace", path: "/(auth)/login" });
  assert.equal(requests.length, 0);
});

test("only login/signup get the subtle native fade transition, without changing unrelated navigation", async () => {
  await mount(AuthLayout);
  const screens = renderer.root.findAllByType("StackScreen");
  assert.equal(screens.find((screen) => screen.props.name === "login").props.options.animation, "fade");
  assert.equal(screens.find((screen) => screen.props.name === "register").props.options.animation, "fade");
  assert.equal(screens.find((screen) => screen.props.name === "verify-otp").props.options.animation, undefined);
});

for (const Component of [Login, Signup]) {
  for (const [width, height, bottom, left] of [[320, 568, 0, 0], [393, 873, 24, 0], [430, 932, 34, 0], [1024, 1366, 20, 0], [844, 390, 21, 44]]) {
    test(`${Component.name}: scroll/safe-area/size contract at ${width}x${height}`, async () => {
      await changeEnvironment({ width, height, insets: { top: 24, bottom, left, right: left } });
      await mount(Component);
      assert.deepEqual(byType("SafeAreaView").props.edges, ["top", "right", "bottom", "left"]);
      const scroll = byType("KeyboardAwareScrollView");
      assert.equal(scroll.props.mode, "insets");
      assert.equal(scroll.props.extraKeyboardSpace, -bottom);
      assert.equal(scroll.props.bottomOffset, SPACING.xl);
      assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, false);
      assert.equal(scroll.props.contentInsetAdjustmentBehavior, "never");
      assert.equal(scroll.props.keyboardShouldPersistTaps, "handled");
      assert.equal(scroll.props.keyboardDismissMode, "on-drag");
      assert.equal(scroll.props.contentContainerStyle.flexGrow, 1);
      assert.equal(renderer.root.findAllByType("KeyboardAvoidingView").length, 0);
      assert.equal(renderer.root.findAllByType("KeyboardStickyView").length, 0);
      const content = scroll.findAllByType("View").find((node) => flatten(node.props.style).maxWidth === 440);
      assert.equal(flatten(content.props.style).width, "100%");
      assert.equal(flatten(content.props.style).height, undefined);
      assert.ok(flatten(submitButton().props.style).minHeight >= 44);
      const password = input("auth-password");
      await fill("auth-password", "Preserve on IME cycles");
      for (const keyboard of [true, false, true, false]) {
        await changeEnvironment({ keyboard });
        assert.equal(input("auth-password"), password);
        assert.equal(password.props.value, "Preserve on IME cycles");
      }
    });
  }
}

test("unmount/remount resets local fields and a late rejection cannot navigate from an abandoned form", async () => {
  const pending = deferred();
  response = () => pending.promise;
  await fillValid(Login);
  await pressSubmit();
  await act(async () => renderer.unmount());
  renderer = null;
  await act(async () => pending.resolve(failure("Late rejection")));
  assert.deepEqual(routes, []);
  assert.deepEqual(tokens, []);
  await mount(Login);
  assert.equal(input("auth-email").props.value, "");
  assert.equal(input("auth-password").props.value, "");
  assert.equal(hasText("Late rejection"), false);
});
