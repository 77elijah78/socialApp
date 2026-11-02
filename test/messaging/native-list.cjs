/* global __dirname */
// Load the installed RN 0.85 list algorithms, not copied implementations. Only
// native components/unrelated render machinery are adapted for Node tests.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const babel = require("@babel/core");
const { native } = require("./harness.cjs");
const root = path.resolve(__dirname, "../../node_modules/react-native/node_modules/@react-native/virtualized-lists/Lists");
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const file = path.join(root, `${name}.js`);
  const mod = new Module(file, module);
  cache.set(name, mod);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(root);
  mod.require = request => {
    if (request === "react") return React;
    if (request === "react-native") return native;
    if (request.includes("ReactNativeFeatureFlags")) return {};
    if (request === "./StateSafePureComponent") return React.PureComponent;
    if (request === "./VirtualizedListContext.js") return { VirtualizedListContext: React.createContext(null) };
    if (["./CellRenderMask", "./ViewabilityHelper", "./VirtualizedListProps"].includes(request)) return load(request.slice(2));
    if (request === "./VirtualizeUtils") return { keyExtractor: (item, index) => item.id ?? String(index) };
    if (request === "../Utilities/clamp") return (value, min, max) => Math.min(max, Math.max(min, value));
    if (request.startsWith(".")) return class NativeBoundary {};
    return require(request);
  };
  const result = babel.transformSync(fs.readFileSync(file, "utf8"), {
    filename: file, babelrc: false, configFile: false,
    presets: [["module:@react-native/babel-preset", { disableImportExportTransform: false }]],
  });
  mod._compile(result.code, file);
  return mod.exports;
}
module.exports = { VirtualizedList: load("VirtualizedList").default, ViewabilityHelper: load("ViewabilityHelper").default };
