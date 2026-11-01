// Deterministic HTTP/Socket/AppState doubles, NOT a live backend or device test.
const { ACCOUNT_A, ACCOUNT_B, envelope } = require("./fixtures.cjs");
function response(data, status = 200) {
  const snapshot = structuredClone(data);
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => snapshot };
}
class ActivitySocket {
  connected = true;
  handlers = new Map();
  isConnected = () => this.connected;
  on = (event, listener) => {
    const group = this.handlers.get(event) ?? new Set();
    group.add(listener); this.handlers.set(event, group);
    return () => { group.delete(listener); if (!group.size) this.handlers.delete(event); };
  };
  emit(event, payload) {
    if (event === "connect") this.connected = true;
    if (event === "disconnect") this.connected = false;
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(payload);
  }
  count(event) { return this.handlers.get(event)?.size ?? 0; }
}
class ActivityAppState {
  currentState = "active";
  handlers = new Set();
  addEventListener(_event, listener) {
    this.handlers.add(listener);
    const owner = this;
    return { remove() { owner.handlers.delete(listener); } };
  }
  change(state) { this.currentState = state; for (const listener of [...this.handlers]) listener(state); }
}
class ActivityServer {
  rows = [];
  calls = [];
  interceptor = null;
  available = true;
  fetch = async (url, options = {}) => {
    const parsed = new URL(url), path = parsed.pathname.replace("/api/v1", "");
    const call = { url, path: path + parsed.search, route: path, options, body: options.body ? JSON.parse(options.body) : undefined };
    this.calls.push(call);
    const reply = () => {
      if (!this.available) return response({ success: false, message: "Route not found" }, 404);
      const owner = options.headers?.Authorization?.includes("token-B") ? ACCOUNT_B : ACCOUNT_A;
      const rows = this.rows.filter(row => row.userId === owner).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const unreadCount = rows.filter(row => !row.isRead).length;
      if (path === "/activity/unread-count") return response({ success: true, data: { unreadCount } });
      if (path === "/activity") {
        const page = Number(parsed.searchParams.get("page")), limit = Number(parsed.searchParams.get("limit"));
        return response(envelope(rows.slice((page - 1) * limit, page * limit), { page, limit, total: rows.length, unreadCount }));
      }
      if (path === "/activity/read" || path === "/activity/read-all") {
        let count = 0;
        for (const row of rows) if (!row.isRead && (path.endsWith("read-all") || call.body.ids.includes(row.id))) { row.isRead = true; count++; }
        return response({ success: true, data: { count } });
      }
      return response({ success: false, message: "Unexpected test route" }, 404);
    };
    const intercepted = this.interceptor?.(call, reply);
    return intercepted ?? reply();
  };
}
module.exports = { ActivityServer, ActivitySocket, ActivityAppState, response };
