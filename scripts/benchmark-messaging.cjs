/* Deterministic JS/React harness; NOT native FPS, GPU, Hermes or device timings. */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { root, mock, row, native } = require("../test/messaging/harness.cjs");
const BASE = "c0b7d994b274a9aa7bf06274edae3ddd9c402a1b";
const baseline = execFileSync(
  "git",
  ["show", `${BASE}:src/app/(chatRoom)/privateRoom.tsx`],
  { encoding: "utf8", cwd: root },
);
let rowRenders = 0;
mock("@/components/messages/MessageCard", (props) => {
  rowRenders++;
  return React.createElement("MessageCard", props);
});
const stableNoop = () => {};
const asyncNoop = async () => {};
const state = {
  messages: [],
  send: asyncNoop,
  replyMsg: asyncNoop,
  retry: asyncNoop,
  sendMedia: asyncNoop,
  onTyping: stableNoop,
  markVisibleRead: stableNoop,
  isTyping: false,
  isSyncing: false,
  isLoadingMore: false,
  isOffline: false,
  syncError: null,
  paginationError: null,
  loadMore: asyncNoop,
  hasMore: true,
  refresh: asyncNoop,
  releaseHistory: stableNoop,
  incomingMessageVersion: 0,
};
mock("@/hooks/useChat", {
  useChat: () => ({ ...state, flatListRef: React.useRef(null) }),
});
// Model a fixed visible window including all 30 representative message rows.
// Metadata changes give baseline CellRenderers new item identities as well.
native.FlatList = React.forwardRef(function Window(props, ref) {
  React.useImperativeHandle(
    ref,
    () => ({ scrollToOffset() {}, scrollToEnd() {} }),
    [],
  );
  return React.createElement(
    "FlatList",
    props,
    props.data.map((item, index) =>
      React.createElement(
        React.Fragment,
        { key: props.keyExtractor(item) },
        props.renderItem({ item, index }),
      ),
    ),
  );
});
global.requestAnimationFrame = () => 0;
function compile(source, name) {
  const module = new Module(
    path.join(root, "src/app/(chatRoom)", name),
    moduleParent,
  );
  module.filename = module.id;
  module.paths = Module._nodeModulePaths(root);
  module._compile(
    ts.transpileModule(source, {
      fileName: module.filename,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    module.filename,
  );
  return module.exports;
}
const moduleParent = module;
const LegacyRoom = compile(baseline, "__benchmark-baseline.tsx").default;
const CurrentRoom = require("../src/app/(chatRoom)/privateRoom.tsx").default;
async function scenario(Component) {
  state.messages = Array.from({ length: 30 }, (_, index) => row(index));
  let renderer;
  const durations = [];
  const element = () =>
    React.createElement(
      React.Profiler,
      {
        id: "room",
        onRender: (_id, phase, duration) => {
          if (phase !== "mount") durations.push(duration);
        },
      },
      React.createElement(Component),
    );
  await act(async () => {
    renderer = create(element());
  });
  rowRenders = 0;
  durations.length = 0;
  const started = performance.now();
  for (let index = 0; index < 50; index++) {
    state.messages = state.messages.map((message, rowIndex) =>
      rowIndex === 15
        ? {
            ...message,
            status: index % 2 ? "READ" : "DELIVERED",
            isRead: index % 2 === 1,
          }
        : message,
    );
    await act(async () => renderer.update(element()));
  }
  const result = {
    rows: 30,
    receiptUpdates: 50,
    messageRowRenders: rowRenders,
    reactCommitMilliseconds: Number(
      durations.reduce((sum, duration) => sum + duration, 0).toFixed(2),
    ),
    wallMilliseconds: Number((performance.now() - started).toFixed(2)),
  };
  rowRenders = 0;
  const input = renderer.root.findByType("TextInput");
  for (let index = 0; index < 10; index++)
    await act(async () => input.props.onChangeText(`typing ${index}`));
  result.typingRowRenders = rowRenders;
  await act(async () => renderer.unmount());
  return result;
}
function modelBenchmark() {
  const prefix = "  const flatData = useMemo(() => {";
  const start = baseline.indexOf(prefix) + prefix.length;
  const end = baseline.indexOf(
    "\n  }, [dateLabels, messages, currentUserId]);",
    start,
  );
  if (start < prefix.length || end < 0)
    throw new Error("Baseline builder not found");
  const legacyBuild = compile(
    `function build(messages: any[], dateLabels: any, currentUserId: string) {${baseline.slice(start, end)}}\nmodule.exports = build;`,
    "__baseline-builder.ts",
  );
  const {
    createListItemBuilder,
  } = require("../src/utils/messaging/listItems.ts");
  const labels = {
    today: new Date().toDateString(),
    yesterday: new Date(Date.now() - 86400000).toDateString(),
  };
  const results = {};
  for (const [name, build] of [
    ["before", (rows) => legacyBuild(rows, labels, "me")],
    [
      "after",
      (() => {
        const builder = createListItemBuilder();
        return (rows) => builder(rows, "me", null);
      })(),
    ],
  ]) {
    let rows = Array.from({ length: 5000 }, (_, index) =>
      row(index, { repliedToId: index % 10 === 0 ? row(1).id : null }),
    );
    let previous = build(rows);
    const samples = [];
    let changed = 0;
    for (let iteration = 0; iteration < 60; iteration++) {
      rows = rows.map((message, index) =>
        index === 15
          ? { ...message, status: iteration % 2 ? "READ" : "DELIVERED" }
          : message,
      );
      const started = performance.now();
      const next = build(rows);
      const elapsed = performance.now() - started;
      if (iteration >= 10) samples.push(elapsed);
      const old = new Map(previous.map((item) => [item.id, item]));
      changed = next.filter((item) => item !== old.get(item.id)).length;
      previous = next;
    }
    samples.sort((a, b) => a - b);
    results[name] = {
      rows: 5000,
      iterations: samples.length,
      medianMilliseconds: Number(
        samples[Math.floor(samples.length / 2)].toFixed(3),
      ),
      p95Milliseconds: Number(
        samples[Math.floor(samples.length * 0.95)].toFixed(3),
      ),
      changedRowModelsPerReceipt: changed,
    };
  }
  return results;
}
(async () => {
  const before = await scenario(LegacyRoom);
  const after = await scenario(CurrentRoom);
  const result = {
    environment: {
      node: process.version,
      platform: process.platform,
      baseline: BASE,
      nativeViewsMocked: true,
      note: "React test renderer in Node; not native frame/FPS measurements. Baseline typing count is not comparable to native CellRenderer memoization.",
    },
    receiptRendering: {
      before,
      after,
      rowRenderReductionPercent: Number(
        (
          100 *
          (1 - after.messageRowRenders / before.messageRowRenders)
        ).toFixed(2),
      ),
    },
    longConversationModel: modelBenchmark(),
  };
  console.log(JSON.stringify(result, null, 2));
  const output = process.argv
    .find((value) => value.startsWith("--output="))
    ?.slice("--output=".length);
  if (output)
    fs.writeFileSync(
      path.resolve(root, output),
      JSON.stringify(result, null, 2) + "\n",
    );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
