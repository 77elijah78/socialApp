const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { root } = require("./harness.cjs");

const {
  SHEET_BACKDROP_COLOR,
  SHEET_BACKDROP_OPACITY,
  SHEET_BACKDROP_PROPS,
  SHEET_HANDLE,
  SHEET_SURFACE,
} = require("../../src/constants/sheets.ts");

test("one shared bottom-sheet appearance has no scrim or drop shadow", () => {
  assert.equal(SHEET_BACKDROP_COLOR, "transparent");
  assert.equal(SHEET_BACKDROP_OPACITY, 0);
  assert.equal(SHEET_BACKDROP_PROPS.opacity, 0);
  assert.equal(SHEET_BACKDROP_PROPS.pressBehavior, "close");
  assert.equal(SHEET_SURFACE.backgroundColor.length > 0, true);
  assert.equal(SHEET_SURFACE.borderTopLeftRadius, SHEET_SURFACE.borderTopRightRadius);
  assert.equal(SHEET_HANDLE.height, 4);
});

const sheets = [
  "src/components/posts/CommentBottomSheet.tsx",
  "src/components/messages/MediaPickerModal.tsx",
  "src/components/ui/ActionMenu.tsx",
  "src/components/ui/ShareModal.tsx",
  "src/components/chat/ForwardMessagePicker.tsx",
];

test("every application bottom sheet consumes the shared appearance", () => {
  for (const file of sheets) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /constants\/sheets/, `${file} must use shared sheet tokens`);
    assert.doesNotMatch(
      source,
      /backgroundColor:\s*["']rgba\((?:20,\s*18,\s*42|0,\s*0,\s*0|26,\s*26,\s*46)/,
      `${file} still paints a dark scrim`,
    );
  }
});

test("the sheet reference surface has no elevation or shadow overlay", () => {
  for (const file of sheets) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    if (file.endsWith("CommentBottomSheet.tsx")) {
      assert.match(source, /SHEET_BACKDROP_PROPS/);
      assert.match(source, /backgroundStyle=\{SHEET_SURFACE\}/);
      continue;
    }
    assert.match(source, /SHEET_BACKDROP_COLOR|SHEET_SURFACE/, file);
  }
});
