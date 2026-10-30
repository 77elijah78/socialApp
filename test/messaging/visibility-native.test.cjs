const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { mock, row } = require("./harness.cjs");
const { VirtualizedList, ViewabilityHelper } = require("./native-list.cjs");
const noop = () => {};
let reads = [];
const chat = {
  messages: [], markVisibleRead: ids => reads.push(ids), isSyncing: false,
  onTyping: noop, loadMore: noop, refresh: noop, releaseHistory: noop,
};
mock("@/hooks/useChat", { useChat: () => chat });
mock("@/components/messages/MessageCard", props => React.createElement("MessageCard", props));
const Screen = require("../../src/app/(chatRoom)/privateRoom.tsx").default;
let renderer;
const list = () => renderer.root.findByType("FlatList");
const propsForNative = props => ({ ...props, getItemCount: d => d.length, getItem: (d, i) => d[i] });
const previousState = props => ({
  renderMask: { numCells: () => props.data.length }, firstVisibleItemKey: props.keyExtractor(props.data[0]),
  cellsAroundViewport: { first: 0, last: props.data.length - 1 }, pendingScrollUpdateCount: 0,
});
function evaluate(nativeProps, state) {
  const helper = new ViewabilityHelper(nativeProps.viewabilityConfigCallbackPairs[0].viewabilityConfig);
  const instance = {
    state,
    _scrollMetrics: { offset: 0, visibleLength: 450 },
    _listMetrics: { getCellMetrics: i => ({ offset: i * 70, length: 70 }) },
    _createViewToken: (index, isViewable, props) => ({ item: props.data[index], index, isViewable, key: props.keyExtractor(props.data[index]) }),
    _viewabilityTuples: [{ viewabilityHelper: helper, onViewableItemsChanged: nativeProps.viewabilityConfigCallbackPairs[0].onViewableItemsChanged }],
  };
  VirtualizedList.prototype._updateViewableItems.call(instance, nativeProps, state.cellsAroundViewport);
  return helper;
}
beforeEach(() => {
  reads = [];
  chat.messages = [row(1)];
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
async function mount() { await act(async () => { renderer = create(React.createElement(Screen)); }); }

test("installed RN MVCP blocks viewability until a native scroll update after prepending", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await mount();
  const prev = propsForNative(list().props);
  chat.messages = [...chat.messages, row(2)];
  await act(async () => renderer.update(React.createElement(Screen)));
  const next = { ...propsForNative(list().props), maintainVisibleContentPosition: { minIndexForVisible: 0 } };
  const state = VirtualizedList.getDerivedStateFromProps(next, previousState(prev));
  assert.equal(state.pendingScrollUpdateCount, 1, "this is the native gate recordInteraction cannot bypass");
  const helper = evaluate(next, state);
  t.mock.timers.tick(350);
  assert.deepEqual(reads, []);
  helper.dispose();
});

test("actual stationary-latest screen avoids the native MVCP gate and qualifies new IDs without a touch", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await mount();
  const prev = propsForNative(list().props);
  chat.messages = [...chat.messages, row(2)];
  await act(async () => renderer.update(React.createElement(Screen)));
  const next = propsForNative(list().props);
  const state = VirtualizedList.getDerivedStateFromProps(next, previousState(prev));
  assert.equal(state.pendingScrollUpdateCount, 0);
  const helper = evaluate(next, state);
  t.mock.timers.tick(350);
  assert.ok(reads.some(ids => ids.includes(row(2).localId)));
  helper.dispose();
});

test("actual screen enables native anchoring only while browsing history, then releases it at latest", async () => {
  await mount();
  assert.equal(list().props.maintainVisibleContentPosition, undefined);
  await act(async () => list().props.onScrollBeginDrag());
  assert.equal(list().props.maintainVisibleContentPosition.minIndexForVisible, 0);
  const event = y => ({ nativeEvent: { contentOffset: { y } } });
  await act(async () => { list().props.onScroll(event(500)); list().props.onScrollEndDrag(event(500)); });
  assert.ok(list().props.maintainVisibleContentPosition);
  await act(async () => { list().props.onScrollBeginDrag(); list().props.onScroll(event(0)); list().props.onScrollEndDrag(event(0)); });
  assert.equal(list().props.maintainVisibleContentPosition, undefined);
});

test("installed RN visibility threshold excludes off-screen/sliver rows and includes genuinely visible oversized rows", () => {
  const helper = new ViewabilityHelper({ viewAreaCoveragePercentThreshold: 50, waitForInteraction: false });
  const props = { data: [{}], getItemCount: d => d.length };
  const metrics = { getCellMetrics: () => ({ offset: 0, length: 1000 }) };
  assert.deepEqual(helper.computeViewableItems(props, 1000, 300, metrics), []);
  assert.deepEqual(helper.computeViewableItems(props, 851, 300, metrics), []);
  assert.deepEqual(helper.computeViewableItems(props, 850, 300, metrics), [0]);
  helper.dispose();
});
