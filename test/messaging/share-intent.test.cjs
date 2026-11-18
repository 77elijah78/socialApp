const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { files } = require("./harness.cjs");
const {
  shareIntentInbox,
} = require("../../src/services/ShareIntentInbox.ts");
const {
  discardStagedFile,
  safeSharedFileName,
  sharedFileLabel,
  stageSharedFile,
} = require("../../src/services/SharedMedia.ts");

beforeEach(() => {
  files.clear();
  shareIntentInbox.clear();
});

function intent(count = 2) {
  return {
    type: "media",
    text: null,
    webUrl: null,
    files: Array.from({ length: count }, (_, index) => ({
      path: `content://media/external/${index + 1}`,
      fileName: index === 0 ? "holiday photo.jpg" : "clip",
      mimeType: index === 0 ? "image/jpeg" : "video/mp4",
      size: 2048 + index,
      width: index === 0 ? 800 : null,
      height: index === 0 ? 600 : null,
      duration: index === 0 ? null : 12,
    })),
  };
}

test("single and multiple ACTION_SEND files populate one removable draft", () => {
  assert.equal(shareIntentInbox.accept(intent(1)), true);
  assert.equal(shareIntentInbox.getSnapshot().files.length, 1);
  assert.equal(shareIntentInbox.accept(intent(3)), true);
  const draft = shareIntentInbox.getSnapshot().files;
  assert.equal(draft.length, 3);
  assert.equal(draft[0].name, "holiday photo.jpg");
  assert.equal(draft[0].mimeType, "image/jpeg");
  assert.equal(draft[0].width, 800);
  assert.equal(draft[1].duration, 12);
  shareIntentInbox.remove(draft[0].id);
  assert.equal(shareIntentInbox.getSnapshot().files.length, 2);
  shareIntentInbox.clear();
  assert.equal(shareIntentInbox.getSnapshot().files.length, 0);
});

test("empty or pathless shares are ignored instead of opening an empty picker", () => {
  assert.equal(shareIntentInbox.accept({ ...intent(1), files: null }), false);
  assert.equal(
    shareIntentInbox.accept({
      ...intent(1),
      files: [{ path: "", fileName: "x", mimeType: "text/plain", size: null }],
    }),
    false,
  );
});

test("shared filenames are preserved, sanitized and given a MIME extension", () => {
  assert.equal(safeSharedFileName("holiday photo.jpg", "image/jpeg"), "holiday photo.jpg");
  assert.equal(safeSharedFileName("../../passwd", "image/png"), "_.._passwd.png");
  assert.equal(safeSharedFileName("clip", "video/mp4"), "clip.mp4");
  assert.equal(safeSharedFileName("", "audio/mpeg", 2), "shared-3.mp3");
  assert.equal(sharedFileLabel(1), "1 attachment");
  assert.equal(sharedFileLabel(3), "3 attachments");
});

test("content URIs are copied to app cache while the temporary grant is alive", async () => {
  files.set("content://media/external/1", {
    exists: true,
    isDirectory: false,
    size: 4096,
    uri: "content://media/external/1",
  });
  const staged = await stageSharedFile(
    {
      id: "one",
      uri: "content://media/external/1",
      name: "holiday photo.jpg",
      mimeType: "image/jpeg",
      size: 4096,
    },
    0,
  );
  assert.match(staged.uri, /^file:\/\/\/cache\/shared-intent\//);
  assert.equal(staged.name, "holiday photo.jpg");
  assert.equal(staged.size, 4096);
  assert.equal(files.has(staged.uri), true);
  assert.doesNotMatch(staged.uri, /content:/);
});

test("a revoked or missing shared file fails without creating a placeholder", async () => {
  await assert.rejects(
    stageSharedFile(
      {
        id: "gone",
        uri: "content://media/external/gone",
        name: "gone.jpg",
        mimeType: "image/jpeg",
      },
      0,
    ),
    /Missing source/,
  );
});

test("only the app's staged copy is deleted after an upload", async () => {
  files.set("file:///cache/shared-intent/one.jpg", {
    exists: true, size: 10, isDirectory: false,
    uri: "file:///cache/shared-intent/one.jpg",
  });
  files.set("content://media/external/original.jpg", {
    exists: true, size: 10, isDirectory: false,
    uri: "content://media/external/original.jpg",
  });
  await discardStagedFile("file:///cache/shared-intent/one.jpg");
  await discardStagedFile("content://media/external/original.jpg");
  assert.equal(files.has("file:///cache/shared-intent/one.jpg"), false);
  assert.equal(files.has("content://media/external/original.jpg"), true);
});

test("intake stages every grant once and sending reuses the staged copy", async () => {
  for (const path of ["content://media/external/1", "content://media/external/2"]) {
    files.set(path, { exists: true, size: 2048, isDirectory: false, uri: path });
  }
  assert.equal(shareIntentInbox.accept(intent(2)), true);
  await shareIntentInbox.stagePending();
  const draft = shareIntentInbox.getSnapshot().files;
  assert.equal(draft.length, 2);
  for (const file of draft) {
    assert.match(file.uri, /^file:\/\/\/cache\/shared-intent\//);
    assert.doesNotMatch(file.uri, /content:/);
  }
  const count = files.size;
  const same = await stageSharedFile(draft[0], 0);
  assert.equal(same.uri, draft[0].uri);
  assert.equal(files.size, count, "a staged file is not copied twice");
});
