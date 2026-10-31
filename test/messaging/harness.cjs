process.env.EXPO_PUBLIC_API_URL ??= "https://api.test";
/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { DatabaseSync } = require("node:sqlite");
const root = path.resolve(__dirname, "../..");
const mocks = new Map();
const database = new DatabaseSync(":memory:");
const metrics = { prepared: 0, finalized: 0, statements: [] };
const storage = new Map();
const sockets = [];
const listeners = new Map();
const appState = {
  currentState: "active",
  addEventListener(event, callback) {
    listeners.set(callback, event);
    return {
      remove() {
        listeners.delete(callback);
      },
    };
  },
  change(next) {
    this.currentState = next;
    for (const callback of listeners.keys()) callback(next);
  },
};
class FakeSocket {
  connected = false;
  handlers = new Map();
  emitted = [];
  on(event, callback) {
    const group = this.handlers.get(event) ?? [];
    group.push(callback);
    this.handlers.set(event, group);
    return this;
  }
  emit(event, data, acknowledge) {
    this.emitted.push({ event, data, ...(acknowledge ? { acknowledge } : {}) });
    return this;
  }
  receive(event, payload) {
    if (event === "connect") this.connected = true;
    if (event === "disconnect") this.connected = false;
    for (const callback of this.handlers.get(event) ?? []) callback(payload);
  }
  removeAllListeners() {
    this.handlers.clear();
  }
  disconnect() {
    this.connected = false;
  }
}
class AnimatedValue {
  constructor(value) {
    this.value = value;
  }
  interpolate() {
    return this.value;
  }
  setValue(value) {
    this.value = value;
  }
  stopAnimation() {}
}
const animation = { start() {}, stop() {} };
const native = {
  AppState: appState,
  BackHandler: {
    listeners: new Set(),
    addEventListener(_event, callback) { this.listeners.add(callback); return { remove: () => this.listeners.delete(callback) }; },
    press() { for (const callback of [...this.listeners].reverse()) if (callback()) return true; return false; },
  },
  Clipboard: { setString() {} },
  Platform: { OS: "ios", select: (options) => options.ios ?? options.default },
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFill: {},
    absoluteFillObject: {},
  },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Animated: {
    Value: AnimatedValue,
    View: "AnimatedView",
    timing: () => animation,
    spring: () => animation,
    sequence: () => animation,
    loop: () => animation,
    multiply: () => 1,
  },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Keyboard: { dismiss() {}, addListener: () => ({ remove() {} }) },
  Linking: { async openURL() {} },
  Share: {
    async share() {
      return { action: "dismissedAction" };
    },
  },
};
for (const name of [
  "View",
  "Text",
  "TouchableOpacity",
  "Pressable",
  "TextInput",
  "ActivityIndicator",
  "Image",
  "Modal",
  "StatusBar",
  "ScrollView",
  "RefreshControl",
])
  native[name] = name;
let scrolls = [];
native.FlatList = React.forwardRef(function FakeList(props, ref) {
  React.useImperativeHandle(
    ref,
    () => ({
      scrollToOffset: (value) => scrolls.push(value),
      scrollToIndex: (value) => scrolls.push(value),
    }),
    [],
  );
  return React.createElement(
    "FlatList",
    props,
    props.data
      ?.slice(0, 30)
      .map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: props.keyExtractor(item) },
          props.renderItem({ item, index }),
        ),
      ),
    !props.data?.length && props.ListEmptyComponent,
  );
});
const sql = {
  async execAsync(query) {
    database.exec(query);
  },
  async prepareAsync(query) {
    metrics.prepared++;
    metrics.statements.push(query);
    const statement = database.prepare(query);
    statement.setReturnArrays(true);
    return {
      async executeForRawResultAsync(params) {
        const rows = statement.all(
          ...params.map((value) => (value === undefined ? null : value)),
        );
        return {
          async getAllAsync() {
            return rows;
          },
        };
      },
      async finalizeAsync() {
        metrics.finalized++;
      },
    };
  },
};
function mock(name, value) {
  mocks.set(
    name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name,
    value,
  );
}
mock("react-native", native);
mock("expo-sqlite", { openDatabaseAsync: async () => sql });
const files = new Map();
const fileSystem = {
  documentDirectory: "file:///documents/",
  async getInfoAsync(uri) {
    return files.get(uri) ?? { exists: false, isDirectory: false };
  },
  async makeDirectoryAsync() {},
  async deleteAsync(uri) {
    for (const key of files.keys())
      if (key === uri || key.startsWith(uri.endsWith("/") ? uri : uri + "/"))
        files.delete(key);
  },
  async copyAsync({ from, to }) {
    const file = files.get(from);
    if (!file?.exists) throw new Error("Missing source");
    files.set(to, { ...file, uri: to });
  },
  async moveAsync({ from, to }) {
    const file = files.get(from);
    if (!file?.exists) throw new Error("Missing source");
    files.set(to, { ...file, uri: to });
    files.delete(from);
  },
  async getContentUriAsync(uri) {
    return `content://files/${encodeURIComponent(uri)}`;
  },
  createDownloadResumable(url, uri, options, callback) {
    return {
      async pauseAsync() {},
      async downloadAsync() {
        callback?.({
          totalBytesWritten: 4096,
          totalBytesExpectedToWrite: 4096,
        });
        files.set(uri, { exists: true, size: 4096, isDirectory: false, uri });
        return { uri, status: 200 };
      },
    };
  },
};
mock("expo-file-system/legacy", fileSystem);
mock("expo-sharing", {
  async isAvailableAsync() {
    return true;
  },
  async shareAsync() {},
});
mock("@react-native-async-storage/async-storage", {
  default: null,
  async getItem(key) {
    return storage.get(key) ?? null;
  },
  async setItem(key, value) {
    storage.set(key, value);
  },
  async removeItem(key) {
    storage.delete(key);
  },
});
mock("socket.io-client", {
  io() {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
});
mock("expo-router", {
  router: { back() {}, push() {}, navigate() {} },
  useFocusEffect: (callback) => React.useEffect(callback, [callback]),
  useLocalSearchParams: () => ({
    conversationId: "room",
    roomId: "room",
    receiverId: "other",
    receiverName: "Other",
  }),
});
mock("react-native-safe-area-context", {
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
});
mock("react-native-keyboard-controller", {
  useReanimatedKeyboardAnimation: () => ({ progress: { value: 0 }, height: { value: 0 } }),
  KeyboardAvoidingView: "KeyboardAvoidingView",
  useKeyboardState: (select) => select({ isVisible: false }),
});
mock("react-native-gesture-handler", {
  Gesture: require("./gesture-driver.cjs").Gesture,
  GestureDetector: "GestureDetector",
});
mock("react-native-reanimated", {
  __esModule: true, default: { View: "ReanimatedView" },
  useSharedValue: value => React.useRef({ value, set(next) { this.value = next; }, get() { return this.value; } }).current,
  useAnimatedStyle: callback => callback(), runOnJS: callback => callback,
  withSpring: value => value,
});
mock("expo-linear-gradient", { LinearGradient: "LinearGradient" });
mock("@expo/vector-icons", { Ionicons: "Ionicons" });
mock("expo-image", { Image: "ExpoImage" });
mock("expo-audio", {
  AudioModule: {
    requestRecordingPermissionsAsync: async () => ({ granted: true }),
  },
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: () =>
    React.useMemo(
      () => ({
        isRecording: false,
        async prepareToRecordAsync() {},
        record() {},
        async stop() {},
      }),
      [],
    ),
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
});
mock("@/components/ui", {
  OfflineBanner: "OfflineBanner",
  ChatBubbleSkeleton: "ChatBubbleSkeleton",
});
mock("@/components/messages/MediaPickerModal", "MediaPickerModal");
mock("@/providers/OverlayProvider", { useOverlay: () => overlay, useOverlayVisible: () => false });
mock("@/store/hooks", {
  useAppSelector: (select) =>
    select({ auth: { user: { id: "me" }, token: "token" } }),
});
const overlay = { openActionMenu() {} };
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  return resolve.call(
    this,
    request.startsWith("@/")
      ? path.join(root, "src", request.slice(2))
      : request,
    parent,
    ...rest,
  );
};
const load = Module._load;
Module._load = function (request, parent, ...rest) {
  const key = request.startsWith("@/")
    ? path.join(root, "src", request.slice(2))
    : request;
  const absolute =
    request.startsWith(".") && parent
      ? path.resolve(path.dirname(parent.filename), request)
      : key;
  if (mocks.has(key)) return mocks.get(key);
  if (mocks.has(absolute.replace(/\.(tsx?|js)$/, "")))
    return mocks.get(absolute.replace(/\.(tsx?|js)$/, ""));
  return load.call(this, request, parent, ...rest);
};
for (const extension of [".ts", ".tsx"])
  Module._extensions[extension] = function (module, filename) {
    const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    module._compile(result.outputText, filename);
  };
global.__DEV__ = false;
global.IS_REACT_ACT_ENVIRONMENT = true;
function row(index, overrides = {}) {
  return {
    localId: `id-${String(index).padStart(5, "0")}`,
    id: `id-${String(index).padStart(5, "0")}`,
    content: `Message ${index}`,
    senderData: null,
    replyData: null,
    attachmentData: null,
    mediaUrl: null,
    thumbnailUrl: null,
    type: "TEXT",
    status: "SENT",
    senderId: "other",
    receiverId: "me",
    conversationId: "room",
    isRead: false,
    timestamp: 1700000000000 + index * 1000,
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    duration: null,
    repliedToId: null,
    forwardedFromId: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    retryCount: 0,
    updatedAt: null,
    ...overrides,
  };
}
function remote(index, overrides = {}) {
  const local = row(index, overrides);
  return { ...local, createdAt: new Date(local.timestamp).toISOString() };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let index = 0; index < 8; index++)
    await new Promise((done) => setImmediate(done));
}
function installServer(messages = []) {
  const server = {
    messages,
    calls: [],
    failure: null,
    pendingPost: null,
    receiptStates: [],
    response: null,
  };
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    server.calls.push({ path: parsed.pathname + parsed.search, options });
    if (server.failure) throw server.failure;
    if (server.response) return server.response(url, options);
    let result;
    if (parsed.pathname.endsWith("/pending/delivery")) result = { data: [] };
    else if (parsed.pathname.endsWith("/delivered")) result = { success: true };
    else if (parsed.pathname.endsWith("/receipts/sync"))
      result = { data: server.receiptStates };
    else if (options.method === "DELETE" && parsed.pathname.includes("/messages/messages/"))
      result = { success: true, data: { messageId: decodeURIComponent(parsed.pathname.split("/").at(-1)), deleteFor: JSON.parse(options.body).deleteFor } };
    else if ((options.method ?? "GET") === "POST") {
      if (server.pendingPost) return server.pendingPost.promise;
      result = {
        data: { id: "server-confirmed", createdAt: new Date().toISOString() },
      };
    } else {
      const conversation = decodeURIComponent(
        parsed.pathname.split("/").at(-2),
      );
      let candidates = server.messages
        .filter((message) => message.conversationId === conversation)
        .sort(
          (a, b) =>
            Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
            b.id.localeCompare(a.id),
        );
      const cursor = parsed.searchParams.get("cursorId");
      if (cursor) {
        const index = candidates.findIndex((message) => message.id === cursor);
        candidates = index < 0 ? [] : candidates.slice(index + 1);
      }
      const before = parsed.searchParams.get("before");
      if (before)
        candidates = candidates.filter(
          (message) => Date.parse(message.createdAt) < Number(before),
        );
      result = {
        data: candidates.slice(
          parsed.searchParams.has("page")
            ? (Number(parsed.searchParams.get("page")) - 1) *
                Number(parsed.searchParams.get("limit") ?? 30)
            : 0,
          (parsed.searchParams.has("page")
            ? Number(parsed.searchParams.get("page"))
            : 1) * Number(parsed.searchParams.get("limit") ?? 30),
        ),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => result,
    };
  };
  return server;
}
module.exports = {
  root,
  mock,
  row,
  remote,
  deferred,
  settle,
  installServer,
  metrics,
  database,
  storage,
  sockets,
  files,
  fileSystem,
  appState,
  native,
  scrolls,
  resetScrolls: () => {
    scrolls.length = 0;
  },
};
