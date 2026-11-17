const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mock, row, storage, settle, fileSystem, files } = require("./harness.cjs");

const asyncStorage = {
  async getItem(key) {
    return storage.get(key) ?? null;
  },
  async setItem(key, value) {
    storage.set(key, value);
  },
  async removeItem(key) {
    storage.delete(key);
  },
};
mock("@react-native-async-storage/async-storage", {
  default: asyncStorage,
  ...asyncStorage,
});

const {
  AUTO_DOWNLOAD_SIZE_LIMITS,
  AUTO_DOWNLOAD_STORAGE_KEY,
  autoDownloadSettings,
  categoryForMedia,
  DEFAULT_AUTO_DOWNLOAD_SETTINGS,
  formatAutoDownloadLimit,
  networkChargeFromStatus,
  shouldAutoDownload,
} = require("../../src/services/AutoDownloadSettings.ts");
const {
  autoDownloadRunner,
} = require("../../src/services/AutoDownloadRunner.ts");
const {
  documentDownloads,
  documentKey,
} = require("../../src/services/DocumentDownloads.ts");
const {
  chatMediaSpec,
} = require("../../src/services/ChatMediaDownloads.ts");

beforeEach(() => {
  storage.clear();
  autoDownloadSettings.reset();
});

test("Auto Download defaults are independent per network and media type", () => {
  const settings = autoDownloadSettings.getSnapshot();
  assert.deepEqual(settings.networks, { wifi: true, mobile: true, roaming: false });
  assert.equal(settings.media.photos, true);
  assert.equal(settings.media.voice, true);
  assert.equal(settings.media.videos, false);
  assert.equal(settings.media.music, false);
  assert.equal(settings.media.documents, false);
  assert.notEqual(settings, DEFAULT_AUTO_DOWNLOAD_SETTINGS);
});

test("network charge distinguishes Wi-Fi, mobile and roaming while offline blocks everything", () => {
  assert.equal(networkChargeFromStatus({ type: "WIFI", isConnected: true }), "wifi");
  assert.equal(networkChargeFromStatus({ type: "ETHERNET", isConnected: true }), "wifi");
  assert.equal(networkChargeFromStatus({ type: "CELLULAR", isConnected: true }), "mobile");
  assert.equal(networkChargeFromStatus({ type: "CELLULAR", isConnected: true, isRoaming: true }), "roaming");
  assert.equal(networkChargeFromStatus({ type: "NONE", isConnected: false }), "offline");
  assert.equal(networkChargeFromStatus({ type: "VPN", isConnected: true }), "other");
  assert.equal(networkChargeFromStatus({ type: "UNKNOWN", isConnected: true }), "offline");

  const settings = autoDownloadSettings.getSnapshot();
  assert.equal(shouldAutoDownload({ settings, category: "photos", network: "offline" }), false);
});

test("the roaming toggle is independent from mobile data", () => {
  const settings = autoDownloadSettings.getSnapshot();
  assert.equal(
    shouldAutoDownload({ settings, category: "photos", network: "roaming" }),
    false,
  );
  autoDownloadSettings.setNetwork("roaming", true);
  assert.equal(
    shouldAutoDownload({
      settings: autoDownloadSettings.getSnapshot(),
      category: "photos",
      network: "roaming",
    }),
    true,
  );
  assert.equal(
    shouldAutoDownload({
      settings: autoDownloadSettings.getSnapshot(),
      category: "photos",
      network: "mobile",
    }),
    true,
  );
});

test("disabled media types and per-category size limits are enforced", () => {
  const settings = autoDownloadSettings.getSnapshot();
  assert.equal(shouldAutoDownload({ settings, category: "videos", network: "wifi" }), false);
  assert.equal(
    shouldAutoDownload({
      settings,
      category: "photos",
      network: "wifi",
      size: AUTO_DOWNLOAD_SIZE_LIMITS.photos + 1,
    }),
    false,
  );
  assert.equal(
    shouldAutoDownload({
      settings,
      category: "photos",
      network: "wifi",
      size: AUTO_DOWNLOAD_SIZE_LIMITS.photos,
    }),
    true,
  );
  assert.equal(
    shouldAutoDownload({ settings, category: "photos", network: "wifi", size: null }),
    true,
  );
  assert.equal(formatAutoDownloadLimit(AUTO_DOWNLOAD_SIZE_LIMITS.photos), "10 MB");
});

test("voice notes and named music attachments use different media toggles", () => {
  assert.equal(categoryForMedia({ type: "AUDIO" }), "voice");
  assert.equal(categoryForMedia({ type: "AUDIO", fileName: "track.mp3" }), "music");
  assert.equal(categoryForMedia({ type: "IMAGE" }), "photos");
  assert.equal(categoryForMedia({ type: "VIDEO" }), "videos");
  assert.equal(categoryForMedia({ type: "DOCUMENT" }), "documents");
  assert.equal(categoryForMedia({ type: "TEXT" }), null);
});

test("settings persist immediately to local storage and apply to the live snapshot", async () => {
  autoDownloadSettings.setMedia("videos", true);
  autoDownloadSettings.setNetwork("roaming", true);
  await settle();
  const stored = JSON.parse(storage.get(AUTO_DOWNLOAD_STORAGE_KEY));
  assert.equal(stored.media.videos, true);
  assert.equal(stored.networks.roaming, true);
  assert.equal(autoDownloadSettings.getSnapshot().media.videos, true);
  assert.equal(autoDownloadSettings.getSnapshot().networks.roaming, true);
  const listener = () => {};
  const release = autoDownloadSettings.subscribe(listener);
  release();
});

test("the receive runner downloads allowed incoming media once and skips disabled, own, large and roaming rows", async () => {
  const original = fileSystem.createDownloadResumable;
  const transferCalls = [];
  fileSystem.createDownloadResumable = (url, uri, options, progress) => {
    transferCalls.push({ url, uri, options });
    return original(url, uri, options, progress);
  };
  try {
    files.clear();
    await documentDownloads.clear();
    autoDownloadSettings.reset();
    const settings = autoDownloadSettings.getSnapshot();
    autoDownloadRunner.reset();
    const photo = row(1, {
      type: "IMAGE",
      mediaUrl: "https://api.test/uploads/images/one.jpg",
      attachmentData: JSON.stringify({ size: 1024, mimeType: "image/jpeg" }),
    });
    autoDownloadRunner.consider(photo, "me", settings, "wifi");
    autoDownloadRunner.consider(photo, "me", settings, "wifi");
    await settle();
    assert.equal(transferCalls.length, 1, "single-flight automatic download");
    assert.equal(
      documentDownloads.get(
        documentKey(
          chatMediaSpec({
            ownerId: "me",
            id: photo.localId,
            uri: photo.mediaUrl,
            name: photo.content,
            mimeType: "image/jpeg",
          }),
        ),
      ).status,
      "ready",
    );

    autoDownloadRunner.consider({ ...photo, localId: "own", senderId: "me" }, "me", settings, "wifi");
    autoDownloadRunner.consider(row(2, {
      type: "VIDEO",
      mediaUrl: "https://api.test/uploads/videos/two.mp4",
      attachmentData: JSON.stringify({ size: 1024, mimeType: "video/mp4" }),
    }), "me", settings, "wifi");
    await settle();
    assert.equal(transferCalls.length, 1, "own/disabled types are skipped");

    const video = row(3, {
      type: "VIDEO",
      mediaUrl: "https://api.test/uploads/videos/three.mp4",
      attachmentData: JSON.stringify({ size: 1024, mimeType: "video/mp4" }),
    });
    autoDownloadRunner.consider(video, "me", { ...settings, media: { ...settings.media, videos: true } }, "roaming");
    await settle();
    assert.equal(transferCalls.length, 1, "roaming stays disabled");

    autoDownloadSettings.setMedia("videos", true);
    autoDownloadRunner.sync("videos-on");
    autoDownloadRunner.consider(video, "me", autoDownloadSettings.getSnapshot(), "wifi");
    await settle();
    assert.equal(transferCalls.length, 2);

    autoDownloadRunner.sync("large");
    autoDownloadRunner.consider(row(4, {
      type: "IMAGE",
      mediaUrl: "https://api.test/uploads/images/four.jpg",
      attachmentData: JSON.stringify({
        size: AUTO_DOWNLOAD_SIZE_LIMITS.photos + 1,
        mimeType: "image/jpeg",
      }),
    }), "me", autoDownloadSettings.getSnapshot(), "wifi");
    await settle();
    assert.equal(transferCalls.length, 2, "oversized files wait for a manual tap");
  } finally {
    fileSystem.createDownloadResumable = original;
    await documentDownloads.clear();
  }
});

test("an automatic transfer that exceeds the category limit stops, and a manual tap still works", async () => {
  files.clear();
  await documentDownloads.clear();
  const spec = {
    ownerId: "me",
    id: "oversized",
    uri: "https://api.test/uploads/images/oversized.jpg",
    name: "oversized.jpg",
  };
  await documentDownloads.download({ ...spec, maxBytes: 1024 });
  const key = documentKey(spec);
  assert.equal(documentDownloads.get(key).status, "error");
  assert.match(documentDownloads.get(key).error, /Auto Download limit/);
  assert.equal(files.has(`${key}.part`), false);

  await documentDownloads.download(spec);
  assert.equal(documentDownloads.get(key).status, "ready");
  await documentDownloads.clear();
});
