// Real installed-package contracts: no Socket.IO/native/HTTP mocks in this file.
// These are dependency regressions, not deployed-server or physical-device tests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const semver = require("semver");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Encoder, Decoder, PacketType, protocol } = require("socket.io-parser");
const shell = require("shell-quote");
const lock = require("../../package-lock.json");

function roundTrip(packet, options) {
  const decoder = new Decoder(options);
  const decoded = [];
  decoder.on("decoded", (value) => decoded.push(value));
  try {
    for (const part of new Encoder().encode(packet)) decoder.add(part);
    assert.equal(decoded.length, 1);
    return decoded[0];
  } finally {
    decoder.destroy();
  }
}

test("Socket.IO rejects zero-attachment binary EVENT/ACK before creating a reconstructor", () => {
  for (const wire of ['50-["message:new",{"id":"invalid"}]', "60-7[]"]) {
    const decoder = new Decoder();
    try {
      assert.throws(() => decoder.add(wire), /Illegal attachments/);
      assert.ok(
        !decoder.reconstructor,
        "invalid header cannot leave binary-buffer ownership behind",
      );
      assert.throws(
        () => decoder.add(new Uint8Array([1])),
        /not reconstructing/,
      );
    } finally {
      decoder.destroy();
    }
  }
});

test("Socket.IO production ESM entry rejects zero attachments and preserves ordinary events", async () => {
  const root = path.resolve(
    path.dirname(require.resolve("socket.io-parser")),
    "../..",
  );
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const esm = await import(pathToFileURL(path.join(root, pkg.module)).href);
  assert.equal(esm.protocol, protocol);
  const decoder = new esm.Decoder();
  const decoded = [];
  decoder.on("decoded", (packet) => decoded.push(packet));
  try {
    assert.throws(
      () => decoder.add('50-["message:new"]'),
      /Illegal attachments/,
    );
    assert.ok(!decoder.reconstructor);
    for (const part of new esm.Encoder().encode({
      type: esm.PacketType.EVENT,
      nsp: "/",
      data: ["message:new", { id: "valid" }],
    }))
      decoder.add(part);
    assert.deepEqual(
      decoded.map((packet) => packet.data),
      [["message:new", { id: "valid" }]],
    );
  } finally {
    decoder.destroy();
  }
});

test("Socket.IO real parser preserves existing JSON media/reply/receipt event payloads", () => {
  assert.equal(protocol, 5, "no Socket.IO wire-protocol upgrade");
  const cases = [
    [
      "message:new",
      {
        id: "message",
        conversationId: "room",
        type: "VIDEO",
        mediaUrl: "https://media.example.invalid/uploads/videos/file.mp4",
        repliedTo: { id: "parent", type: "TEXT", content: "Actual parent" },
      },
    ],
    [
      "message:read",
      { conversationId: "room", messageId: "message", userId: "reader" },
    ],
    [
      "notification:new",
      {
        type: "SHARE",
        content: "shared your post",
        actorId: "actor",
        resourceId: "post",
      },
    ],
  ];
  for (const data of cases) {
    const packet = roundTrip({ type: PacketType.EVENT, nsp: "/", data });
    assert.equal(packet.type, PacketType.EVENT);
    assert.equal(packet.nsp, "/");
    assert.deepEqual(packet.data, data);
  }
});

test("Socket.IO legitimate binary events and acknowledgements still round-trip", () => {
  for (const [type, data] of [
    [PacketType.EVENT, ["attachment", new Uint8Array([1, 2, 3])]],
    [PacketType.ACK, [new Uint8Array([4, 5, 6])]],
  ]) {
    const packet = roundTrip(
      { type, nsp: "/room", id: 7, data },
      { maxAttachments: 2 },
    );
    assert.equal(packet.type, type);
    assert.equal(packet.nsp, "/room");
    assert.equal(packet.id, 7);
    assert.deepEqual(packet.data, data);
  }
});

test("Socket.IO attachment limits and malformed header rejection remain intact", () => {
  for (const wire of [
    '53-["event"]',
    '5-1-["event"]',
    '51.5-["event"]',
    '59007199254740992-["event"]',
  ]) {
    const decoder = new Decoder({ maxAttachments: 2 });
    try {
      assert.throws(() => decoder.add(wire), /attachments|payload/);
      assert.ok(!decoder.reconstructor);
    } finally {
      decoder.destroy();
    }
  }
});

test("shell quoting rejects the advisory's comment-followed-by-line-terminator pattern", () => {
  // No shell is invoked: this checks that the package rejects the dangerous token sequence.
  for (const newline of ["\n", "\r", "\u2028", "\u2029"]) {
    assert.throws(
      () =>
        shell.quote([
          "echo",
          "ok",
          { comment: "x" },
          `a${newline}printf unexpected;#`,
        ]),
      { name: "TypeError", message: /line terminators/ },
    );
  }
});

test("ordinary developer-tool arguments still quote/parse without expansion or lost characters", () => {
  const args = [
    "node",
    "a file's name",
    "$HOME",
    "literal;command",
    "https://example.invalid/#fragment",
    "日本語",
    "line\nbreak",
    "",
  ];
  assert.deepEqual(shell.parse(shell.quote(args)), args);
});

test("route/portal non-secure IDs and custom generators terminate at negative/zero sizes", () => {
  // The old negative-size generator loops forever. Bound the actual-package probe
  // in a child instead of risking an unbounded test runner or application process.
  const script = `
    const assert = require("node:assert/strict");
    const { nanoid, customAlphabet } = require("nanoid/non-secure");
    assert.equal(nanoid(-1), "");
    assert.equal(nanoid(0), "");
    assert.equal(customAlphabet("ab")(-1), "");
    assert.equal(customAlphabet("ab", 0)(), "");
    assert.equal(require("nanoid").customAlphabet("ab", 0)(), "");
    assert.match(nanoid(), /^[A-Za-z0-9_-]{21}$/);
    assert.match(customAlphabet("ab", 8)(), /^[ab]{8}$/);
  `;
  const result = spawnSync(
    process.execPath,
    ["--max-old-space-size=48", "-e", script],
    {
      cwd: path.dirname(require.resolve("../../package.json")),
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 128 * 1024,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test("lockfile retains patched compatible versions for the twelve targeted dependency families", () => {
  const allowed = {
    "socket.io-parser": ">=4.2.7 <5",
    "shell-quote": ">=1.11.0 <2",
    "@xmldom/xmldom": ">=0.8.15 <0.9 || >=0.9.12 <0.10",
    "brace-expansion": ">=1.1.21 <2 || >=5.0.12 <6",
    browserslist: ">=4.28.7 <5",
    compression: ">=1.8.2 <2",
    "js-yaml": ">=4.3.2 <5",
    nanoid: ">=3.3.18 <4",
    "node-forge": ">=1.4.1 <2",
    postcss: ">=8.5.23 <9",
    "source-map-js": ">=1.2.2 <2",
    "baseline-browser-mapping": ">=2.11.0 <3",
  };
  for (const [name, range] of Object.entries(allowed)) {
    const copies = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith(`node_modules/${name}`),
    );
    assert.ok(copies.length, `${name} is present in the locked tree`);
    for (const [path, value] of copies) {
      assert.ok(
        semver.satisfies(value.version, range),
        `${path}@${value.version} must satisfy ${range}`,
      );
    }
  }
});
