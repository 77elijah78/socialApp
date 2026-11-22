const { test, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock, root, storage } = require("../messaging/harness.cjs");

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
let getHandler = async () => ({ data: [] });
let postHandler = async () => ({ data: { id: "server-sticker", createdAt: new Date().toISOString() } });
const api = {
  get: async (...args) => getHandler(...args),
  post: async (...args) => postHandler(...args),
};
mock("@/services/api", { api, ApiError });

const {
  BUILTIN_PACKS,
  encodeStickerMarker,
  parseStickerMarker,
  findBuiltinSticker,
} = require("../../src/constants/stickers.ts");
const {
  stickerPreferences,
  fetchRemoteStickerPacks,
  stickerMediaForSend,
  stickerAppearsInSearch,
  isSupportedStickerUri,
  stickerKey,
} = require("../../src/services/StickerService.ts");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { MessageService } = require("../../src/services/MessageService.ts");

before(runMigrations);
beforeEach(async () => {
  storage.clear();
  getHandler = async () => ({ data: [] });
  postHandler = async () => ({ data: { id: "server-sticker", createdAt: new Date().toISOString() } });
  await messageStore.deleteAll();
  await stickerPreferences.hydrate("sticker-test-account");
});

test("built-in stickers are real transparent WebP artwork and use a reversible wire marker", () => {
  assert.equal(BUILTIN_PACKS.length, 2);
  assert.equal(BUILTIN_PACKS.flatMap((pack) => pack.stickers).length, 8);
  for (const pack of BUILTIN_PACKS) {
    for (const sticker of pack.stickers) {
      assert.ok(sticker.asset, `${sticker.id} has bundled art`);
      const filename = String(sticker.asset);
      assert.match(filename, /\.webp$/);
      const absolute = path.join(root, "src/assets/stickers/circle", path.basename(filename));
      assert.ok(fs.existsSync(absolute), `${path.basename(filename)} exists`);
      const header = fs.readFileSync(absolute).subarray(0, 12);
      assert.equal(header.subarray(0, 4).toString(), "RIFF");
      assert.equal(header.subarray(8, 12).toString(), "WEBP");
    }
  }
  const marker = encodeStickerMarker("circle", "happy");
  assert.equal(marker, "[[sticker:circle:happy]]");
  assert.deepEqual(parseStickerMarker(marker), { packId: "circle", stickerId: "happy" });
  assert.equal(parseStickerMarker("hello [[sticker:circle:happy]]"), null);
  assert.equal(parseStickerMarker("[[sticker:bad/path:happy]]"), null);
  assert.equal(findBuiltinSticker("circle", "happy").name, "Happy");
});

test("pack install, favorites and recents persist per account", async () => {
  assert.equal(stickerPreferences.snapshot.installed.includes("circle"), true);
  await stickerPreferences.setInstalled("moods", false);
  await stickerPreferences.setInstalled("remote-pack", true);
  await stickerPreferences.toggleFavorite("circle", "love");
  await stickerPreferences.recordRecent("circle", "happy");
  await stickerPreferences.recordRecent("circle", "love");
  const prefs = stickerPreferences.snapshot;
  assert.equal(prefs.installed.includes("moods"), false);
  assert.equal(prefs.installed.includes("remote-pack"), true);
  assert.deepEqual(prefs.favorites, [stickerKey("circle", "love")]);
  assert.equal(prefs.recents[0], stickerKey("circle", "love"));
  assert.equal(prefs.recents[1], stickerKey("circle", "happy"));

  assert.equal(
    JSON.parse(storage.get("stickers:sticker-test-account:installed")).includes("remote-pack"),
    true,
  );
  await stickerPreferences.hydrate("another-account");
  assert.deepEqual(stickerPreferences.snapshot.installed, ["circle", "moods"]);
  assert.deepEqual(stickerPreferences.snapshot.favorites, []);
  assert.deepEqual(stickerPreferences.snapshot.recents, []);
});

test("remote sticker packs normalize WebP/GIF URLs and report catalog availability", async () => {
  getHandler = async () => ({
    data: {
      packs: [{
        id: "animals",
        name: "Animals",
        description: "Pets",
        coverUrl: "https://cdn.test/cover.webp",
        stickers: [
          { id: "cat", name: "Cat", tags: ["meow"], url: "https://cdn.test/cat.webp", width: 512, height: 512, animated: true },
          { id: "bad", name: "Broken" },
        ],
      }],
    },
  });
  const result = await fetchRemoteStickerPacks("ani");
  assert.equal(result.available, true);
  assert.equal(result.packs.length, 1);
  assert.equal(result.packs[0].source, "remote");
  assert.equal(result.packs[0].stickers.length, 1);
  assert.equal(result.packs[0].stickers[0].animated, true);
  assert.equal(result.packs[0].stickers[0].width, 512);
  assert.equal(stickerAppearsInSearch(result.packs[0].stickers[0], "MEOW"), true);
  assert.equal(isSupportedStickerUri("https://cdn.test/a.webp"), true);
  assert.equal(isSupportedStickerUri("https://cdn.test/a.tgs"), false);
  assert.equal(isSupportedStickerUri("https://cdn.test/a.webm?v=2"), false);

  getHandler = async () => { throw new ApiError("Not deployed", 404); };
  const unavailable = await fetchRemoteStickerPacks();
  assert.equal(unavailable.available, false);
  assert.deepEqual(unavailable.packs, []);
});

test("sending never re-downloads a remote sticker and resolves bundled art locally", async () => {
  const remote = {
    id: "cat",
    packId: "animals",
    name: "Cat",
    tags: [],
    url: "https://cdn.test/cat.webp",
    width: 256,
    height: 256,
  };
  assert.deepEqual(await stickerMediaForSend(remote), {
    mediaUri: "https://cdn.test/cat.webp",
    mimeType: "image/webp",
  });
  assert.equal(
    (await stickerMediaForSend({ ...remote, url: "https://cdn.test/cat.gif?size=2" })).mimeType,
    "image/gif",
  );
  assert.equal(await stickerMediaForSend({ ...remote, url: "https://cdn.test/cat.tgs" }), null);
  const bundled = findBuiltinSticker("circle", "happy");
  const media = await stickerMediaForSend(bundled);
  assert.match(media.mediaUri, /^file:\/\//);
  assert.equal(media.mimeType, "image/webp");
});

test("a sticker is sent as a real optimistically-cached IMAGE message with reply support", async () => {
  const service = new MessageService("https://example.test/api/v1");
  service.setAuthToken("token");
  const sticker = findBuiltinSticker("circle", "happy");
  const message = await service.sendSticker(
    {
      packId: sticker.packId,
      stickerId: sticker.id,
      stickerName: sticker.name,
      mediaUri: "https://cdn.test/happy.webp",
      mimeType: "image/webp",
      width: 512,
      height: 512,
    },
    { senderId: "me", receiverId: "other", conversationId: "room", sender: { id: "me", username: "me" } },
  );
  assert.equal(message.type, "IMAGE");
  assert.equal(message.content, "[[sticker:circle:happy]]");
  assert.equal(message.mediaUrl, "https://cdn.test/happy.webp");
  assert.equal(message.status, "SENT");
  const metadata = JSON.parse(message.attachmentData);
  assert.equal(metadata.mimeType, "image/webp");
  assert.equal(metadata.stickerName, "Happy");
  assert.equal(metadata.width, 512);
});

test("the same sticker send works in a group conversation without a receiverId", async () => {
  const service = new MessageService("https://example.test/api/v1");
  service.setAuthToken("token");
  const message = await service.sendSticker(
    {
      packId: "circle",
      stickerId: "party",
      stickerName: "Party",
      mediaUri: "https://cdn.test/party.webp",
      mimeType: "image/webp",
      width: 512,
      height: 512,
    },
    { senderId: "me", receiverId: null, conversationId: "group-1", sender: { id: "me", username: "me" } },
    "parent-message",
  );
  assert.equal(message.conversationId, "group-1");
  assert.equal(message.receiverId, null);
  assert.equal(message.repliedToId, "parent-message");
  assert.equal(message.type, "IMAGE");
  assert.match(message.content, /^\[\[sticker:circle:party\]\]$/);
});
