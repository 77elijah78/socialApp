// Mounted UI + real Redux/HTTP client/coordinator; native/network doubles only.
// No physical-device, real-backend, native layout/FPS or production certification.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { Provider, useSelector, useDispatch } = require("react-redux");
const { configureStore } = require("@reduxjs/toolkit");
const { mock, native, deferred, settle, scrolls, resetScrolls, storage } = require("../messaging/harness.cjs");
const { raw, id, event, ACCOUNT_A, ACCOUNT_B, POST } = require("./fixtures.cjs");
const { ActivityServer, ActivitySocket, ActivityAppState, response } = require("./server-double.cjs");
native.Easing = { inOut: value => value, ease: value => value };
native.AccessibilityInfo = { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) };
native.Platform.OS = "android";
mock("@/store/hooks", { useAppSelector: useSelector, useAppDispatch: useDispatch });
mock("expo-blur", { BlurView: "BlurView" });
let server, socket, app, store, root, controller, routes, dialogs, comments, shares, params;
let focused = true;
const focusSubscribers = new Set();
const changeFocus = value => { focused = value; for (const listener of focusSubscribers) listener(); };
function Tabs({ children, tabBar }) {
  const screens = React.Children.toArray(children), descriptors = {}, routes = [];
  for (const child of screens) { const key = child.props.name; routes.push({ key, name: key }); descriptors[key] = { options: child.props.options }; }
  return React.createElement("Tabs", null, children, tabBar({ state: { routes, index: 3 }, descriptors,
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: name => routes.push(name) }, insets: { bottom: 24 } }));
}
Tabs.Screen = function MockTabScreen(props) { return React.createElement("TabScreen", props); };
mock("expo-router", {
  Tabs,
  router: { push: target => { routes.push(target); changeFocus(false); }, back: () => routes.push("back") },
  useLocalSearchParams: () => params,
  useFocusEffect(callback) {
    const isFocused = React.useSyncExternalStore(listener => { focusSubscribers.add(listener); return () => focusSubscribers.delete(listener); }, () => focused);
    React.useEffect(() => isFocused ? callback() : undefined, [isFocused, callback]);
  },
});
mock("@/services/MediaService", { mediaService: { socket: {
  on: (name, callback) => socket.on(name, callback), get socket() { return { connected: socket.connected }; },
} } });
mock("@/services/AppDialogService", { showAppDialog: dialog => dialogs.push(dialog) });
mock("@/providers/OverlayProvider", { useOverlay: () => ({ openComments: post => comments.push(post), openShare: post => shares.push(post), openActionMenu() {} }) });
mock("@/components/feed/PostCard", props => React.createElement("PostCard", props));
const { default: auth, setCredentials } = require("../../src/store/slices/authSlice.ts");
const { default: notifications } = require("../../src/store/slices/notificationsSlice.ts");
const authClient = require("../../src/services/api.ts");
const { useNotificationSync, useActivityController } = require("../../src/hooks/useNotifications.ts");
const Screen = require("../../src/app/(tabs)/notifications.tsx").default;
const TabLayout = require("../../src/app/(tabs)/_layout.tsx").default;
const PostScreen = require("../../src/app/posts/[id]/index.tsx").default;
const originalFetch = global.fetch;
const originalInterval = global.setInterval, originalClearInterval = global.clearInterval;
let intervals;
function CaptureController({ capture }) {
  useNotificationSync();
  const instance = useActivityController();
  React.useLayoutEffect(() => capture(instance), [instance, capture]);
  return null;
}
const capture = value => { controller = value; };
async function mount(Component = Screen, { tabs = false, sync = true, props = {} } = {}) {
  await act(async () => {
    root = create(React.createElement(Provider, { store },
      sync && React.createElement(CaptureController, { capture }), React.createElement(Component, props), tabs && React.createElement(TabLayout)));
    await settle();
  });
}
const text = () => root.root.findAllByType("Text").flatMap(node => node.children.filter(child => typeof child === "string" || typeof child === "number")).join("\n");
const pressable = label => root.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === label);
async function tap(label) {
  const node = pressable(label); assert.ok(node, `button ${label}`);
  await act(async () => { node.props.onPress({ stopPropagation() {} }); await settle(); });
}
async function tapRow(rowId) {
  await act(async () => { root.root.findByProps({ testID: `activity-${rowId}` }).props.onPress(); await settle(); });
}
const post = (postId = POST, patch = {}) => ({
  id: postId, content: "The selected post", imageUrls: [], videoUrl: null, mediaMetadata: [],
  author: { id: id(8877), username: "writer", displayName: "Writer", avatarUrl: null },
  createdAt: "2026-10-30T12:00:00.000Z", updatedAt: "2026-10-30T12:00:00.000Z",
  _count: { likes: 17, comments: 3 }, shareCount: 1, comments: [], ...patch,
});
function authorHandler({ includeSelected = false, failAuthor = false } = {}) {
  const selected = post();
  server.interceptor = call => {
    if (call.route === `/posts/${POST}`) return response({ success: true, data: selected });
    if (call.route === `/posts/${POST}/like`) return response({ success: true, data: { message: "Post liked" } });
    if (call.route === `/posts/user/writer`) {
      if (failAuthor) return response({ message: "Author page offline" }, 503);
      const page = new URL(call.url).searchParams.get("page");
      const first = Array.from({ length: 20 }, (_, i) => post(id(800 + i), { isLiked: false, isSaved: false }));
      return response({ success: true, data: { user: selected.author,
        posts: page === "2" ? [post(POST, { isLiked: true })] : includeSelected ? [post(POST, { isLiked: true }), ...first.slice(0, 19)] : first, total: 21 } });
    }
  };
  return selected;
}
beforeEach(() => {
  server = new ActivityServer(); socket = new ActivitySocket(); app = new ActivityAppState(); native.AppState = app;
  store = configureStore({ reducer: { auth, notifications } });
  store.dispatch(setCredentials({ user: { id: ACCOUNT_A, username: "alice" }, token: "token-A", refreshToken: "refresh-A" }));
  authClient.setTokens("token-A", "refresh-A");
  global.fetch = server.fetch; routes = []; dialogs = []; comments = []; shares = []; params = {}; focused = true;
  intervals = new Map();
  global.setInterval = (callback, delay) => { const key = Symbol(); intervals.set(key, { callback, delay }); return key; };
  global.clearInterval = key => intervals.delete(key);
  storage.clear(); resetScrolls();
});
afterEach(async () => {
  if (root) await act(async () => { root.unmount(); await settle(); });
  root = null; controller?.stop(); controller = null;
  assert.equal(intervals.size, 0); assert.equal(socket.count("notification:new"), 0);
  global.setInterval = originalInterval; global.clearInterval = originalClearInterval;
  global.fetch = originalFetch; authClient.setTokens(null, null);
});

test("initial list uses the real shared skeleton while waiting, not a false empty state", async () => {
  const gate = deferred(); let pending;
  server.rows = [raw(1)];
  server.interceptor = (call, reply) => { if (call.route === "/activity") { pending = reply(); return gate.promise; } };
  await mount();
  assert.ok(root.root.findByProps({ accessibilityLabel: "Loading activity" }));
  assert.equal(text().includes("You’re in the loop"), false);
  await act(async () => { gate.resolve(pending); await settle(); });
  assert.ok(root.root.findByProps({ testID: `activity-${id(1)}` }));
});

test("genuine empty Activity has meaningful copy and pull-to-refresh; errors have retry, not empty success", async () => {
  await mount(); assert.match(text(), /You’re in the loop/);
  const list = root.root.findByType("FlatList");
  assert.equal(typeof list.props.refreshControl.props.onRefresh, "function");
  await act(async () => { server.available = false; list.props.refreshControl.props.onRefresh(); await settle(); });
  assert.match(text(), /Couldn’t load activity/); assert.match(text(), /backend release is required/);
  await act(async () => { server.available = true; server.rows = [raw(1)]; });
  await tap("Try again");
});

test("long actor/content rows keep bounded text, real avatar/thumbnail and unread indicator on Android", async () => {
  const actor = { ...raw(1).actor, username: "a_very_long_username_".repeat(5) };
  server.rows = [raw(1, { actor, content: "liked your post ".repeat(50) })]; await mount();
  const row = root.root.findByProps({ testID: `activity-${id(1)}` });
  const texts = row.findAllByType("Text");
  assert.ok(texts.some(node => node.props.numberOfLines === 3)); assert.ok(texts.some(node => node.props.numberOfLines === 2));
  assert.ok(row.findByProps({ testID: "unread-indicator" }));
  const images = row.findAllByType("ExpoImage"); assert.equal(images.length, 2);
  for (const image of images) {
    assert.equal(image.props.source.headers.Authorization, "Bearer token-A");
    assert.equal(image.props.cachePolicy, "memory");
  }
  assert.equal(root.root.findByType("FlatList").props.getItemLayout, undefined);
});

for (const type of ["LIKE", "COMMENT", "SHARE", "FOLLOW", "MESSAGE", "MENTION"]) {
  test(`${type}: row opens only its verified post/profile/messages destination and marks read`, async () => {
    const row = raw(1, { type, ...(type === "COMMENT" ? { content: "replied to your comment" } : {}) });
    server.rows = [row]; await mount(); await tapRow(row.id);
    if (["LIKE", "COMMENT", "SHARE"].includes(type)) assert.deepEqual(routes[0], { pathname: "/posts/[id]", params: { id: POST } });
    else if (type === "FOLLOW") assert.deepEqual(routes[0], { pathname: "/user/[username]", params: { username: "mia" } });
    else if (type === "MESSAGE") assert.equal(routes[0], "/(tabs)/messages");
    else { assert.equal(routes.length, 0); assert.match(dialogs[0].message, /destination for this mention/); }
    assert.ok(server.calls.some(call => call.route === "/activity/read"));
    assert.equal(store.getState().notifications.unreadCount, 0);
  });
}

test("avatar tap opens the actor username rather than a UUID or the post author", async () => {
  server.rows = [raw(1)]; await mount(); await tap("View mia's profile");
  assert.deepEqual(routes[0], { pathname: "/user/[username]", params: { username: "mia" } });
  assert.equal(server.calls.filter(call => call.route === "/activity/read").length, 1);
});

test("deleted actor/post has a fallback and explanatory dialog, not a broken target navigation", async () => {
  server.rows = [raw(1, { actor: null, post: null })]; await mount();
  assert.match(text(), /Unavailable account/); assert.equal(pressable("Profile unavailable").props.disabled, true);
  await tapRow(id(1)); assert.equal(routes.length, 0); assert.match(dialogs[0].message, /removed|no longer available/);
});

test("existing glass-tab badge caps at 99+ then disappears immediately on optimistic read-all", async () => {
  server.rows = Array.from({ length: 101 }, (_, i) => raw(i + 1)); await mount(Screen, { tabs: true });
  assert.match(text(), /99\+/); assert.ok(pressable("Activity, 101 unread"));
  const gate = deferred(); let reply;
  server.interceptor = (call, respond) => { if (call.route === "/activity/read-all") { reply = respond(); return gate.promise; } };
  await act(async () => { pressable("Mark all activity as read").props.onPress(); await settle(); });
  assert.equal(store.getState().notifications.unreadCount, 0);
  assert.equal(text().includes("99+"), false); assert.match(text(), /Saving/);
  await act(async () => { gate.resolve(reply); await settle(); });
  assert.equal(root.root.findAllByType("TabScreen").find(node => node.props.name === "notifications").props.options.tabBarBadge, undefined);
});

test("read failure restores row/badge and reports a meaningful error through the existing dialog service", async () => {
  server.rows = [raw(1)]; await mount(Screen, { tabs: true });
  server.interceptor = call => call.route === "/activity/read" ? response({ message: "Read offline" }, 503) : undefined;
  await tap("Mark activity from @mia as read");
  assert.equal(store.getState().notifications.unreadCount, 1); assert.match(dialogs[0].title, /wasn’t saved/);
  assert.ok(root.root.findByProps({ testID: "unread-indicator" }));
});

test("focus/background owns a single minute clock, and foreground/focus synchronization preserves listeners", async () => {
  server.rows = [raw(1)]; await mount();
  assert.equal(intervals.size, 1); assert.equal([...intervals.values()][0].delay, 60_000);
  await act(async () => { changeFocus(false); await settle(); }); assert.equal(intervals.size, 0);
  await act(async () => { changeFocus(true); await settle(); }); assert.equal(intervals.size, 1);
  await act(async () => { app.change("background"); await settle(); }); assert.equal(intervals.size, 0);
  await act(async () => { app.change("active"); await settle(); }); assert.equal(intervals.size, 1);
  assert.equal(socket.count("notification:new"), 1);
});

test("account switch clears Activity and the rendered tab badge without leaking rows or media credentials", async () => {
  server.rows = [raw(1), raw(2, { userId: ACCOUNT_B })]; await mount(Screen, { tabs: true });
  await act(async () => {
    authClient.setTokens("token-B", "refresh-B");
    store.dispatch(setCredentials({ user: { id: ACCOUNT_B, username: "bob" }, token: "token-B" })); await settle();
  });
  assert.equal(root.root.findAllByProps({ testID: `activity-${id(1)}` }).length, 0);
  assert.equal(socket.count("notification:new"), 1); assert.equal(store.getState().notifications.accountId, ACCOUNT_B);
  assert.ok(root.root.findByProps({ testID: `activity-${id(2)}` }));
  for (const image of root.root.findAllByType("ExpoImage")) assert.equal(image.props.source.headers.Authorization, "Bearer token-B");
});

test("Activity post resolves the real author and shows an older selected post inside existing paginated collection", async () => {
  params = { id: POST }; authorHandler(); await mount(PostScreen);
  const cards = root.root.findAllByType("PostCard"); assert.equal(cards[0].props.post.id, POST);
  assert.equal(cards.filter(card => card.props.post.id === POST).length, 1);
  assert.ok(server.calls.some(call => call.path === "/posts/user/writer?page=1&limit=20"));
  assert.match(text(), /SELECTED POST/); assert.match(text(), /@writer/);
  await act(async () => { root.root.findByType("FlatList").props.onLayout(); });
  assert.deepEqual(scrolls, [{ offset: 0, animated: false }]);
  await act(async () => { cards[0].props.onComment(POST); cards[0].props.onShare(POST); root.root.findByType("FlatList").props.onEndReached(); await settle(); });
  assert.deepEqual(comments, [POST]); assert.deepEqual(shares, [{ postId: POST }]);
  assert.equal(root.root.findAllByType("PostCard").filter(card => card.props.post.id === POST).length, 1);
});

test("a selected post already on its real author page keeps canonical page order and membership flags", async () => {
  params = { id: POST }; authorHandler({ includeSelected: true }); await mount(PostScreen);
  const cards = root.root.findAllByType("PostCard");
  assert.equal(cards.length, 20); assert.equal(cards[0].props.post.id, POST); assert.equal(cards[0].props.post.isLiked, true);
  assert.equal(text().includes("SELECTED POST"), false);
});

test("detail GET without like membership never invents a like increment; existing idempotent write refreshes real count", async () => {
  params = { id: POST }; authorHandler(); await mount(PostScreen);
  let card = root.root.findAllByType("PostCard")[0]; assert.equal(card.props.post.likeStateKnown, false);
  await act(async () => { await card.props.onLike(POST, true); await settle(); });
  card = root.root.findAllByType("PostCard")[0];
  assert.equal(card.props.post.likeCount, 17); assert.equal(card.props.post.isLiked, true);
  assert.equal(server.calls.filter(call => call.route === `/posts/${POST}`).length, 2);
});

test("selected detail survives surrounding-author-page failure instead of hiding a successfully loaded post", async () => {
  params = { id: POST }; authorHandler({ failAuthor: true }); await mount(PostScreen);
  assert.equal(root.root.findAllByType("PostCard")[0].props.post.id, POST);
  assert.match(text(), /Author page offline/); assert.match(text(), /More from this author/);
});

for (const status of [403, 404]) {
  test(`unavailable post HTTP ${status} has a safe back/retry state, not comments or the wrong author's feed`, async () => {
    params = { id: POST };
    server.interceptor = call => call.route === `/posts/${POST}` ? response({ message: "Unavailable" }, status) : undefined;
    await mount(PostScreen);
    assert.match(text(), /removed or is no longer available/); assert.equal(root.root.findAllByType("PostCard").length, 0);
    await tap("Go back"); assert.equal(routes[0], "back");
  });
}

test("a live COMMENT/reply appears with the real actor, quote and tab badge without manual refresh", async () => {
  server.rows = [raw(1)]; await mount(Screen, { tabs: true });
  const reply = raw(2, { type: "COMMENT", content: "replied to your comment" });
  await act(async () => { server.rows.push(reply); socket.emit("notification:new", event(reply)); await settle(); });
  assert.ok(root.root.findByProps({ testID: `activity-${id(2)}` }));
  assert.match(text(), /replied to your comment/); assert.match(text(), /Love this moment!/);
  assert.equal(root.root.findAllByType("TabScreen").find(node => node.props.name === "notifications").props.options.tabBarBadge, 2);
  assert.equal(socket.count("notification:new"), 1);
});
