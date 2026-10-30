const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { fileSystem, files, deferred, settle } = require("./harness.cjs");
const {
  DocumentDownloads,
  documentKey,
} = require("../../src/services/DocumentDownloads.ts");
let store, transfers, original;
const spec = (id, ownerId = "account-a") => ({
  ownerId,
  id,
  uri: `https://cdn.test/${id}.pdf`,
  name: `${id}.pdf`,
});
beforeEach(() => {
  files.clear();
  store = new DocumentDownloads();
  transfers = [];
  original = fileSystem.createDownloadResumable;
  fileSystem.createDownloadResumable = (url, uri, options, progress) => {
    const pending = deferred();
    const transfer = {
      url,
      uri,
      progress,
      finish(size = 100, status = 200) {
        files.set(uri, { exists: true, isDirectory: false, size, uri });
        pending.resolve({ uri, status });
      },
      fail() {
        pending.reject(new Error("Connection lost"));
      },
    };
    transfers.push(transfer);
    return {
      downloadAsync: () => pending.promise,
      pauseAsync: async () => {
        pending.resolve(undefined);
      },
    };
  };
});
afterEach(async () => {
  await store.clear();
  fileSystem.createDownloadResumable = original;
});
test("downloads are single-flight, limited to two transfers, and publish real per-file byte progress", async () => {
  const a = spec("one"),
    b = spec("two"),
    c = spec("three");
  const first = store.download(a);
  assert.equal(store.download(a), first);
  const second = store.download(b),
    third = store.download(c);
  await settle();
  assert.equal(transfers.length, 2);
  assert.equal(store.get(documentKey(c)).status, "queued");
  let updates = 0,
    otherUpdates = 0;
  const releaseA = store.subscribe(documentKey(a), () => updates++),
    releaseB = store.subscribe(documentKey(b), () => otherUpdates++);
  transfers[0].progress({
    totalBytesWritten: 25,
    totalBytesExpectedToWrite: 100,
  });
  transfers[0].progress({
    totalBytesWritten: 25.1,
    totalBytesExpectedToWrite: 100,
  });
  assert.equal(updates, 1);
  assert.equal(otherUpdates, 0);
  assert.equal(store.get(documentKey(a)).bytes, 25);
  assert.equal(store.get(documentKey(a)).total, 100);
  transfers[0].finish();
  await first;
  await settle();
  assert.equal(store.get(documentKey(a)).status, "ready");
  assert.equal(transfers.length, 3);
  assert.equal(store.get(documentKey(a)).localUri.endsWith(".part"), false);
  transfers[1].finish();
  transfers[2].finish();
  await Promise.all([second, third]);
  releaseA();
  releaseB();
});
test("a partial transfer is never discovered as downloaded after a simulated JS restart", async () => {
  const file = spec("partial"),
    work = store.download(file);
  await settle();
  files.set(transfers[0].uri, { exists: true, size: 20 });
  const restarted = new DocumentDownloads();
  await restarted.inspect(file);
  assert.equal(restarted.get(documentKey(file)).status, "idle");
  transfers[0].fail();
  await work;
  assert.equal(store.get(documentKey(file)).status, "error");
  assert.equal(files.has(transfers[0].uri), false);
});
test("failure/retry does not leave a partial file or start duplicate downloads", async () => {
  const file = spec("retry");
  let work = store.download(file);
  await settle();
  transfers[0].finish(100, 404);
  await work;
  assert.equal(store.get(documentKey(file)).status, "error");
  assert.equal(files.size, 0);
  work = store.download(file);
  await settle();
  transfers[1].finish();
  await work;
  assert.equal(store.get(documentKey(file)).status, "ready");
});
test("completed files are found offline by a fresh manager and revalidated after cache/file eviction", async () => {
  const file = spec("cached"),
    work = store.download(file);
  await settle();
  transfers[0].finish(250);
  await work;
  const restarted = new DocumentDownloads();
  await restarted.inspect(file);
  assert.equal(restarted.get(documentKey(file)).status, "ready");
  assert.equal(restarted.get(documentKey(file)).total, 250);
  files.clear();
  await restarted.inspect(file);
  assert.equal(restarted.get(documentKey(file)).status, "idle");
});
test("account partitions, path safety, preserved extension, and logout cancellation protect downloaded files", async () => {
  const a = { ...spec("same", "account-a"), name: "x".repeat(180) + ".pdf" },
    b = spec("same", "account-b");
  const first = store.download(a),
    second = store.download(b);
  await settle();
  assert.notEqual(transfers[0].uri, transfers[1].uri);
  assert.match(transfers[0].uri, /account-a\//);
  assert.match(transfers[0].uri, /\.pdf\.part$/);
  await store.clear();
  await Promise.all([first, second]);
  assert.equal(store.get(documentKey(a)).status, "idle");
  assert.equal(files.size, 0);
  const unsafe = { ...spec("safe", "../../"), name: "../../file.pdf" };
  const work = store.download(unsafe);
  await settle();
  assert.doesNotMatch(transfers.at(-1).uri, /\/\.\.\//);
  transfers.at(-1).finish();
  await work;
});
test("unsupported schemes fail honestly without a network transfer", async () => {
  await store.download({ ...spec("bad"), uri: "javascript:alert(1)" });
  assert.equal(
    store.get(documentKey({ ...spec("bad"), uri: "javascript:alert(1)" }))
      .status,
    "error",
  );
  assert.equal(transfers.length, 0);
});
