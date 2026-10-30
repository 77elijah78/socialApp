// Component/ownership regressions, NOT native keyboard/animation/device tests.
// Reuse the existing TS loader and native mocks; all network calls are stubbed.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { mock, native, deferred } = require("../messaging/harness.cjs");

const defaults = () => ({
  window: { width: 390, height: 844 },
  insets: { top: 44, bottom: 34, left: 0, right: 0 },
  keyboard: { isVisible: false },
});
let environment = defaults();
const subscribers = new Set();
const subscribe = (callback) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};
const snapshot = () => environment;
const useEnvironment = () => React.useSyncExternalStore(subscribe, snapshot);
async function changeEnvironment(update) {
  await act(async () => {
    environment = { ...environment, ...update };
    for (const callback of subscribers) callback();
  });
}

let keyboardSubscriptions = 0;
let keyboardDismissals = 0;
const keyboardListeners = new Map();
native.KeyboardAvoidingView = "NativeKeyboardAvoidingView";
native.Keyboard.addListener = (event, callback) => {
  keyboardSubscriptions++;
  keyboardListeners.set(callback, event);
  return { remove() { keyboardListeners.delete(callback); } };
};
const BaseAnimatedValue = native.Animated.Value;
native.Animated.Value = class extends BaseAnimatedValue {
  interpolate(config) { return { ...config, source: this }; }
};
native.Animated.timing = (value, config) => ({ start() { value.setValue(config.toValue); } });
native.Keyboard.dismiss = () => keyboardDismissals++;
native.useWindowDimensions = function useWindowDimensions() {
  return useEnvironment().window;
};
mock("react-native-safe-area-context", {
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => useEnvironment().insets,
});
mock("react-native-keyboard-controller", {
  KeyboardAvoidingView: "ControllerKeyboardAvoidingView",
  KeyboardAwareScrollView: "KeyboardAwareScrollView",
  KeyboardStickyView: "KeyboardStickyView",
  useKeyboardState: (select) => select(useEnvironment().keyboard),
});

let routeParams = {};
let navigations = [];
let navigationFrames = [];
global.requestAnimationFrame = (callback) => navigationFrames.push(callback);
mock("expo-router", {
  router: {
    back: () => navigations.push("back"),
    push: (path) => navigations.push(path),
  },
  useLocalSearchParams: () => routeParams,
});

const user = { id: "me", username: "me", displayName: "Me", avatarUrl: null };
const auth = { auth: { token: "token", user } };
mock("@/store/hooks", { useAppSelector: (select) => select(auth) });
mock("@/components/ui", { CommentsSkeleton: "CommentsSkeleton" });
let dialogs = [];
mock("@/services/AppDialogService", {
  showAppDialog: (dialog) => dialogs.push(dialog),
});
let pickedImages = null;
mock("@/hooks/useImagePicker", {
  pickFromLibrary: async () => pickedImages,
  takePhoto: async () => pickedImages,
  getAssetMimeType: () => "image/jpeg",
  createUploadFormData: (uri, mime) => ({ uri, mime }),
});

const comment = {
  id: "comment-1",
  postId: "post-1",
  authorId: "other",
  author: { id: "other", username: "other", displayName: "Other" },
  content: "An existing comment",
  createdAt: new Date("2026-10-28T12:00:00Z"),
  repliedToId: null,
};
let apiCalls = [];
let pendingPost = null;
mock("@/services/api", {
  api: {
    async get(path, token, options) {
      apiCalls.push({ method: "GET", path, token, options });
      return {
        success: true,
        data: { content: "Existing caption", imageUrls: [], comments: [comment] },
      };
    },
    async post(path, body, token) {
      apiCalls.push({ method: "POST", path, body, token });
      if (pendingPost) return pendingPost.promise;
      return { success: true, data: { id: "saved-comment", ...body } };
    },
    async patch(path, body, token) {
      apiCalls.push({ method: "PATCH", path, body, token });
      return { success: true };
    },
    async upload(path, body, token) {
      apiCalls.push({ method: "UPLOAD", path, body, token });
      return { data: { url: `https://example.invalid/${body.uri}.jpg` } };
    },
  },
});

// This mock deliberately mounts footerComponent as a React component TYPE,
// like Gorhom does: changing its function identity remounts the native input.
const footerPosition = { value: 600 };
const FakeSheet = React.forwardRef(function FakeSheet(props, ref) {
  const [presented, setPresented] = React.useState(false);
  React.useImperativeHandle(ref, () => ({
    present: () => setPresented(true),
    dismiss: () => {
      setPresented(false);
      props.onDismiss?.();
    },
  }));
  return React.createElement(
    "BottomSheetModal",
    props,
    presented && props.children,
    presented && props.footerComponent && React.createElement(props.footerComponent, {
      animatedFooterPosition: footerPosition,
    }),
  );
});
let sheetListRenders = 0;
function FakeSheetList(props) {
  sheetListRenders++;
  return React.createElement(
    "BottomSheetFlatList",
    props,
    React.createElement(native.FlatList, props),
  );
}
mock("@gorhom/bottom-sheet", {
  BottomSheetModal: FakeSheet,
  BottomSheetBackdrop: "BottomSheetBackdrop",
  BottomSheetFooter: "BottomSheetFooter",
  BottomSheetTextInput: "BottomSheetTextInput",
  BottomSheetFlatList: FakeSheetList,
});

const CreatePost = require("../../src/components/posts/CreatePostScreen.tsx").default;
const { CommentBottomSheet } = require("../../src/components/posts/CommentBottomSheet.tsx");
const Comments = require("../../src/app/posts/[id]/comments.tsx").default;
const { CommentThread } = require("../../src/components/posts/CommentThread.tsx");
let renderer;
let sheetRef;
const byType = (type) => renderer.root.findByType(type);
const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const caption = () => renderer.root.findByProps({ accessibilityLabel: "Post caption" });
const sheetInput = () => byType("BottomSheetTextInput");
const postButton = () => renderer.root.findByProps({ accessibilityLabel: "Post comment" });
const contentSize = (height) => ({ nativeEvent: { contentSize: { width: 250, height } } });

beforeEach(() => {
  environment = defaults();
  routeParams = {};
  native.Platform.OS = "ios";
  keyboardSubscriptions = 0;
  keyboardDismissals = 0;
  apiCalls = [];
  pendingPost = null;
  pickedImages = null;
  dialogs = [];
  navigations = [];
  navigationFrames = [];
  sheetListRenders = 0;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  sheetRef = null;
  assert.equal(subscribers.size, 0, "environment subscriptions are cleaned up on navigation/unmount");
  assert.equal(keyboardListeners.size, 0, "restored legacy subscriptions are cleaned up on unmount");
});
async function mount(Component) {
  await act(async () => {
    renderer = create(React.createElement(Component));
  });
}
async function mountSheet() {
  sheetRef = React.createRef();
  await act(async () => {
    renderer = create(React.createElement(CommentBottomSheet, { ref: sheetRef }));
  });
  await act(async () => sheetRef.current.open("post-1"));
}

for (const platform of ["android", "ios"]) {
  test(`${platform}: creation restores the former RN avoider/scroll/footer positioning without a sticky transform`, async () => {
    native.Platform.OS = platform;
    await mount(CreatePost);
    assert.deepEqual(byType("SafeAreaView").props.edges, ["top", "left", "right", "bottom"]);
    const avoider = byType("NativeKeyboardAvoidingView");
    assert.equal(avoider.props.behavior, platform === "ios" ? "padding" : undefined);
    assert.equal(avoider.props.keyboardVerticalOffset, 0);
    assert.equal(renderer.root.findAllByType("ControllerKeyboardAvoidingView").length, 0);
    assert.equal(renderer.root.findAllByType("KeyboardStickyView").length, 0);
    assert.equal(renderer.root.findAllByType("KeyboardAwareScrollView").length, 0);
    assert.equal(byType("ScrollView").props.automaticallyAdjustKeyboardInsets, false);
    assert.equal(byType("ScrollView").props.keyboardDismissMode, "on-drag");
    assert.equal(keyboardSubscriptions, 0);
  });
}

test("creation: simulated keyboard cycles and multiline drafts preserve the input without independent footer movement", async () => {
  await mount(CreatePost);
  const input = caption();
  const draft = Array.from({ length: 30 }, (_, index) => `Caption line ${index}`).join("\n");
  await act(async () => input.props.onChangeText(draft));
  for (const isVisible of [true, false, true, false]) {
    await changeEnvironment({ keyboard: { isVisible } });
    assert.equal(caption(), input);
    assert.equal(input.props.value, draft);
    assert.equal(renderer.root.findAllByType("KeyboardStickyView").length, 0);
  }
  assert.equal(input.props.multiline, true);
  assert.equal(input.props.maxLength, 2000);
  assert.equal(keyboardSubscriptions, 0);
});

for (const device of [
  { width: 320, height: 568, bottom: 0, top: 24, left: 0, right: 0 },
  { width: 393, height: 873, bottom: 24, top: 28, left: 0, right: 0 },
  { width: 430, height: 932, bottom: 34, top: 59, left: 0, right: 0 },
  { width: 1024, height: 1366, bottom: 20, top: 24, left: 0, right: 0 },
  { width: 844, height: 390, bottom: 21, top: 0, left: 44, right: 44 },
]) {
  test(`creation: restored flow does not add device-specific offsets at ${device.width}x${device.height}`, async () => {
    environment = {
      ...defaults(),
      window: { width: device.width, height: device.height },
      insets: { top: device.top, bottom: device.bottom, left: device.left, right: device.right },
    };
    await mount(CreatePost);
    assert.equal(byType("NativeKeyboardAvoidingView").props.keyboardVerticalOffset, 0);
    assert.equal(flatten(byType("SafeAreaView").props.style).flex, 1);
    assert.equal(byType("ScrollView").props.bottomOffset, undefined);
    assert.equal(renderer.root.findAllByType("KeyboardStickyView").length, 0);
  });
}

test("creation: resize/inset changes keep the existing draft and normal-flow footer", async () => {
  await mount(CreatePost);
  const input = caption();
  await act(async () => input.props.onChangeText("Keep this draft"));
  await changeEnvironment({
    window: { width: 844, height: 390 },
    insets: { top: 0, bottom: 21, left: 44, right: 44 },
    keyboard: { isVisible: true },
  });
  assert.equal(caption(), input);
  assert.equal(input.props.value, "Keep this draft");
  assert.equal(byType("ScrollView").props.extraKeyboardSpace, undefined);
  assert.equal(renderer.root.findAllByType("KeyboardStickyView").length, 0);
});

test("creation: posting, image picking/upload, and editing keep their existing API payloads", async () => {
  await mount(CreatePost);
  pickedImages = [{ uri: "photo-one" }, { uri: "photo-two" }];
  const library = renderer.root.findAllByType("Pressable").find((node) =>
    node.findAllByType("Text").some((text) => text.props.children === "Photo library"),
  );
  await act(async () => library.props.onPress());
  await act(async () => caption().props.onChangeText("  A photo post  "));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: "Share post" }).props.onPress());
  assert.equal(apiCalls.filter((call) => call.method === "UPLOAD").length, 2);
  assert.deepEqual(apiCalls.find((call) => call.method === "POST"), {
    method: "POST", path: "/posts", token: "token",
    body: { content: "A photo post", imageUrls: [
      "https://example.invalid/photo-one.jpg", "https://example.invalid/photo-two.jpg",
    ] },
  });
  assert.equal(dialogs.at(-1).title, "Post shared");
  await act(async () => renderer.unmount());
  renderer = null;
  routeParams = { postId: "post-edit" };
  apiCalls = [];
  await mount(CreatePost);
  assert.equal(caption().props.value, "Existing caption");
  await act(async () => caption().props.onChangeText("Edited caption"));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: "Share post" }).props.onPress());
  assert.deepEqual(apiCalls.find((call) => call.method === "PATCH").body, {
    content: "Edited caption", imageUrls: [],
  });
  assert.equal(dialogs.at(-1).title, "Post updated");
});

for (const platform of ["android", "ios"]) {
  test(`${platform}: sheet restores the lower-detent guard and in-flow composer, not the regressing registered footer`, async () => {
    native.Platform.OS = platform;
    await mountSheet();
    const modal = byType("BottomSheetModal");
    const input = sheetInput();
    assert.deepEqual(modal.props.snapPoints, ["66%", "92%"]);
    assert.equal(modal.props.keyboardBehavior, "extend");
    assert.equal(modal.props.keyboardBlurBehavior, "restore");
    assert.equal(modal.props.android_keyboardInputMode, "adjustResize");
    assert.equal(modal.props.topInset, undefined);
    assert.equal(modal.props.bottomInset, 0);
    assert.equal(modal.props.footerComponent, undefined);
    assert.equal(byType("BottomSheetFlatList").props.enableFooterMarginAdjustment, undefined);
    assert.equal(renderer.root.findAllByType("BottomSheetFooter").length, 0);
    assert.equal(renderer.root.findAllByType("AnimatedView").length, 1);
    for (const isVisible of [true, false, true, false]) {
      await changeEnvironment({ keyboard: { isVisible } });
      assert.deepEqual(modal.props.snapPoints, isVisible ? ["66%"] : ["66%", "92%"]);
      assert.equal(sheetInput(), input);
    }
    assert.equal(keyboardSubscriptions, 2, "exactly the former show/hide listener pair");
    const transform = byType("AnimatedView").props.style.transform[0].translateY;
    assert.deepEqual(transform.inputRange, [0, 400]);
    assert.deepEqual(transform.outputRange, [0, -420]);
    assert.equal(transform.extrapolate, "clamp");
    const show = platform === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = platform === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    await act(async () => {
      for (const [callback, event] of keyboardListeners) if (event === show) callback({ endCoordinates: { height: 300 }, duration: 250 });
    });
    assert.equal(transform.source.value, 300);
    await act(async () => {
      for (const [callback, event] of keyboardListeners) if (event === hide) callback({ endCoordinates: { height: 0 }, duration: 250 });
    });
    assert.equal(transform.source.value, 0);
  });
}

test("sheet: an already expanded detent stays available, while keyboard changes cannot overwrite the resting index", async () => {
  await mountSheet();
  const modal = byType("BottomSheetModal");
  await act(async () => modal.props.onChange(1));
  await changeEnvironment({ keyboard: { isVisible: true } });
  assert.deepEqual(modal.props.snapPoints, ["66%", "92%"]);
  await act(async () => modal.props.onChange(0));
  assert.deepEqual(modal.props.snapPoints, ["66%", "92%"]);
  await changeEnvironment({ keyboard: { isVisible: false } });
  await act(async () => modal.props.onChange(0));
  await changeEnvironment({ keyboard: { isVisible: true } });
  assert.deepEqual(modal.props.snapPoints, ["66%"]);
});

test("sheet: multiline growth is bounded, footer/input identity stay stable, typing does not render the list", async () => {
  await mountSheet();
  const input = sheetInput();
  const initialListRenders = sheetListRenders;
  for (let index = 1; index <= 8; index++) {
    await act(async () => input.props.onChangeText("Line\n".repeat(index)));
  }
  for (const [contentHeight, expected] of [[20, 44], [61, 61], [400, 88], [88, 88], [20, 44]]) {
    await act(async () => input.props.onContentSizeChange(contentSize(contentHeight)));
    assert.equal(flatten(input.props.style).height, expected);
    assert.equal(sheetInput(), input);
  }
  assert.equal(input.props.multiline, true);
  assert.equal(input.props.blurOnSubmit, false);
  assert.equal(input.props.maxLength, 1000);
  assert.equal(byType("BottomSheetModal").props.footerComponent, undefined);
  assert.equal(sheetListRenders, initialListRenders);
});

test("sheet: reply/cancel and pending send keep the same input mounted and preserve optimistic/API reply semantics", async () => {
  await mountSheet();
  const input = sheetInput();
  await act(async () => renderer.root.findByType(CommentThread).props.onReply(comment));
  assert.equal(input.props.placeholder, "Write a reply...");
  assert.equal(sheetInput(), input);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: "Cancel reply" }).props.onPress());
  assert.equal(input.props.placeholder, "Add a comment...");
  await act(async () => renderer.root.findByType(CommentThread).props.onReply(comment));
  await act(async () => input.props.onChangeText("  A reply\nwith two lines  "));
  pendingPost = deferred();
  await act(async () => renderer.root.findByProps({ accessibilityLabel: "Post reply" }).props.onPress());
  assert.equal(sheetInput(), input);
  assert.equal(input.props.value, "");
  assert.equal(input.props.editable, false);
  assert.equal(byType("BottomSheetModal").props.footerComponent, undefined);
  assert.equal(postButton().props.disabled, true);
  assert.deepEqual(apiCalls.find((call) => call.method === "POST"), {
    method: "POST", path: "/posts/post-1/comments", token: "token",
    body: { content: "A reply\nwith two lines", repliedToId: "comment-1" },
  });
  const rootThread = byType("BottomSheetFlatList").props.data[0];
  assert.equal(rootThread.replies[0].comment.content, "A reply\nwith two lines");
  await act(async () => pendingPost.resolve({ success: true, data: { id: "saved-reply" } }));
  assert.equal(sheetInput(), input);
  assert.equal(input.props.editable, true);
  assert.equal(byType("BottomSheetFlatList").props.data[0].replies[0].comment.id, "saved-reply");
  assert.equal(keyboardSubscriptions, 2);
});

test("sheet: close/reopen, opening an already open post, and switching posts reset drafts predictably", async () => {
  await mountSheet();
  await act(async () => sheetInput().props.onChangeText("Discard on close"));
  await changeEnvironment({ keyboard: { isVisible: true } });
  await act(async () => sheetRef.current.close());
  assert.equal(renderer.root.findAllByType("BottomSheetTextInput").length, 0);
  assert.equal(keyboardDismissals, 1);
  await changeEnvironment({ keyboard: { isVisible: false } });
  await act(async () => sheetRef.current.open("post-1"));
  assert.equal(sheetInput().props.value, "");
  assert.equal(flatten(sheetInput().props.style).height, 44);
  await act(async () => sheetInput().props.onChangeText("Reset same-post open"));
  await act(async () => sheetRef.current.open("post-1"));
  assert.equal(sheetInput().props.value, "");
  await act(async () => sheetInput().props.onChangeText("Reset other-post open"));
  await act(async () => sheetRef.current.open("post-2"));
  assert.equal(sheetInput().props.value, "");
  assert.deepEqual(byType("BottomSheetModal").props.snapPoints, ["66%", "92%"]);
});

test("sheet: changing dimensions/safe areas updates real insets without remounting the composer", async () => {
  await mountSheet();
  const input = sheetInput();
  await act(async () => input.props.onChangeText("Draft during resize"));
  for (const { window, insets } of [
    { window: { width: 320, height: 568 }, insets: { top: 24, bottom: 0, left: 0, right: 0 } },
    { window: { width: 393, height: 873 }, insets: { top: 28, bottom: 24, left: 0, right: 0 } },
    { window: { width: 430, height: 932 }, insets: { top: 59, bottom: 34, left: 0, right: 0 } },
    { window: { width: 844, height: 390 }, insets: { top: 0, bottom: 21, left: 44, right: 44 } },
    { window: { width: 1024, height: 1366 }, insets: { top: 24, bottom: 20, left: 0, right: 0 } },
  ]) {
    await changeEnvironment({ window, insets });
    const horizontalPadding = Math.max(14, Math.min(24, window.width * 0.045));
    assert.equal(byType("BottomSheetModal").props.topInset, undefined);
    assert.equal(byType("BottomSheetModal").props.bottomInset, 0);
    const listStyle = flatten(byType("BottomSheetFlatList").props.contentContainerStyle);
    const composerContainer = sheetInput().parent.parent;
    const composerStyle = flatten(composerContainer.props.style);
    assert.equal(listStyle.paddingLeft, horizontalPadding + insets.left);
    assert.equal(listStyle.paddingRight, horizontalPadding + insets.right);
    assert.equal(composerStyle.paddingLeft, listStyle.paddingLeft);
    assert.equal(composerStyle.paddingRight, listStyle.paddingRight);
    assert.equal(sheetInput(), input);
    assert.equal(input.props.value, "Draft during resize");
  }
});

test("sheet: profile navigation dismisses the keyboard first and navigates only after sheet dismissal", async () => {
  await mountSheet();
  await changeEnvironment({ keyboard: { isVisible: true } });
  await act(async () => renderer.root.findByType(CommentThread).props.onProfilePress("other"));
  assert.equal(keyboardDismissals, 1);
  assert.deepEqual(navigations, []);
  assert.equal(renderer.root.findAllByType("BottomSheetTextInput").length, 1);
  await changeEnvironment({ keyboard: { isVisible: false } });
  await act(async () => renderer.root.findByType(CommentThread).props.onProfilePress("other"));
  assert.equal(renderer.root.findAllByType("BottomSheetTextInput").length, 0);
  assert.deepEqual(navigations, []);
  await act(async () => navigationFrames.splice(0).forEach((callback) => callback()));
  assert.deepEqual(navigations, ["/user/other"]);
});

for (const platform of ["android", "ios"]) {
  test(`${platform}: routed comments restore platform avoidance while retaining the bottom safe area`, async () => {
    native.Platform.OS = platform;
    routeParams = { id: "post-1" };
    await mount(Comments);
    const avoider = byType("NativeKeyboardAvoidingView");
    assert.equal(avoider.props.behavior, platform === "ios" ? "padding" : "height");
    assert.equal(avoider.props.keyboardVerticalOffset, 0);
    assert.equal(avoider.props.automaticOffset, undefined);
    assert.deepEqual(byType("SafeAreaView").props.edges, ["left", "right", "bottom"]);
    assert.equal(byType("FlatList").props.automaticallyAdjustKeyboardInsets, false);
    assert.equal(byType("FlatList").props.contentInsetAdjustmentBehavior, "never");
    const input = byType("TextInput");
    await act(async () => input.props.onChangeText("A routed comment"));
    for (const isVisible of [true, false, true, false]) {
      await changeEnvironment({ keyboard: { isVisible } });
      assert.equal(byType("TextInput"), input);
      assert.equal(input.props.value, "A routed comment");
    }
    assert.equal(keyboardSubscriptions, 0);
  });
}

test("navigation away/return unmounts local draft state and does not accumulate application keyboard listeners", async () => {
  for (const Component of [CreatePost, Comments]) {
    routeParams = Component === Comments ? { id: "post-1" } : {};
    await mount(Component);
    const input = Component === CreatePost ? caption() : byType("TextInput");
    await act(async () => input.props.onChangeText("Draft before leaving"));
    await act(async () => renderer.unmount());
    renderer = null;
    assert.equal(subscribers.size, 0);
    await mount(Component);
    const reopened = Component === CreatePost ? caption() : byType("TextInput");
    assert.equal(reopened.props.value, "");
    await act(async () => renderer.unmount());
    renderer = null;
    assert.equal(subscribers.size, 0);
  }
  assert.equal(keyboardSubscriptions, 0);
});
