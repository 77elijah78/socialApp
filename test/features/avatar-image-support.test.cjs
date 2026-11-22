const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("../messaging/harness.cjs");

const uploads = [];
mock("@/services/api", {
  api: {
    uploadFile: async (...args) => {
      uploads.push(args);
      return {
        success: true,
        data: { url: "https://api.test/uploads/avatars/a.webp" },
      };
    },
  },
});

const { avatarFileForUpload, AVATAR_MAX_BYTES } = require("../../src/utils/avatarUpload.ts");
const { uploadAvatarAsset } = require("../../src/services/AvatarService.ts");

const asset = (overrides = {}) => ({
  uri: "file:///cache/photo.heic",
  width: 100,
  height: 100,
  fileName: "photo.heic",
  type: "image",
  ...overrides,
});

test("every image MIME is passed through without a client allowlist", () => {
  assert.deepEqual(avatarFileForUpload(asset()), {
    uri: "file:///cache/photo.heic",
    name: "photo.heic",
    type: "image/heic",
  });
  for (const [fileName, type] of [
    ["shot.avif", "image/avif"],
    ["scan.bmp", "image/bmp"],
    ["scan.tiff", "image/tiff"],
    ["vector.svg", "image/svg+xml"],
    ["raw.dng", "image/x-adobe-dng"],
  ]) {
    const file = avatarFileForUpload(
      asset({ uri: `file:///cache/${fileName}`, fileName, mimeType: type }),
    );
    assert.equal(file.type, type);
    assert.equal(file.name, fileName);
  }
});

test("an unusual but valid image/* MIME survives, keeping the provider filename", () => {
  const file = avatarFileForUpload(
    asset({
      uri: "content://provider/image/42",
      fileName: "capture.xyz",
      mimeType: "image/x-phone-raw",
    }),
  );
  assert.equal(file.type, "image/x-phone-raw");
  assert.equal(file.name, "capture.xyz");
});

test("a JPEG payload keeps a .jpg name even when the provider called it HEIC", () => {
  const file = avatarFileForUpload(
    asset({ fileName: "IMG_0001.HEIC", mimeType: "image/jpeg" }),
  );
  assert.equal(file.type, "image/jpeg");
  assert.equal(file.name, "IMG_0001.jpg");
});

test("videos, non-image MIME values and oversized images are rejected first", () => {
  assert.throws(
    () => avatarFileForUpload(asset({ type: "video", mimeType: "video/mp4" })),
    /image file/,
  );
  assert.throws(
    () => avatarFileForUpload(asset({ mimeType: "application/pdf" })),
    /image file/,
  );
  assert.throws(
    () => avatarFileForUpload(asset({ fileSize: AVATAR_MAX_BYTES + 1 })),
    /5 MB/,
  );
  assert.doesNotThrow(() =>
    avatarFileForUpload(asset({ fileSize: AVATAR_MAX_BYTES })),
  );
});

test("the avatar service uploads the original type and normalized filename", async () => {
  uploads.length = 0;
  const uploaded = await uploadAvatarAsset(asset());
  assert.equal(uploaded.url, "https://api.test/uploads/avatars/a.webp");
  assert.deepEqual(uploads[0].slice(0, 5), [
    "/media/upload/avatar",
    "file:///cache/photo.heic",
    "image/heic",
    "avatar",
    "photo.heic",
  ]);
});
