/**
 * Test script: simulates bob's behavior in the alice-bob conversation.
 * Run this WHILE the Expo app is open as alice in the chat room.
 *
 * Usage: node test/socket-test-bob.js
 *
 * What it does:
 *  1. Logs in as bob (bob@example.com / Password123!)
 *  2. Connects to Socket.IO with bob's JWT
 *  3. Joins the alice-bob conversation room
 *  4. After 3s: sends "typing:start" (you'll see "Typing..." in alice's header)
 *  5. After 5s: sends a real message via the REST API (you'll see the bubble appear)
 *  6. After 4s: marks all messages as read (checkmarks turn blue for alice)
 *  7. After 12s: simulates alice typing by having bob send "message:typing" events
 */

const http = require("http");
const { io } = require("socket.io-client");

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.3:3000";
const BOB_EMAIL = "bob@example.com";
const BOB_PASSWORD = "Password123!";

async function api(path, method = "GET", body = null, token = null) {
  const options = {
    hostname: new URL(API_URL).hostname,
    port: new URL(API_URL).port,
    path: `/api/v1${path}`,
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (token) options.headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("1. Logging in as bob...");
  const loginRes = await api("/auth/login", "POST", { email: BOB_EMAIL, password: BOB_PASSWORD });
  if (!loginRes.success) {
    console.error("Login failed:", loginRes.message);
    process.exit(1);
  }
  const token = loginRes.data.accessToken;
  const bobId = loginRes.data.user.id;
  console.log("   Logged in as bob:", bobId);

  console.log("2. Fetching conversations...");
  const convoRes = await api("/messages/conversations", "GET", null, token);
  const conversations = convoRes.data || [];
  if (conversations.length === 0) {
    console.log("   No conversations found. Creating one with alice...");
    const resp = await api("/messages/conversations", "POST", { userId: "ce011da4-f82b-4ff3-9028-1dafc249c82d" }, token);
    conversations.push(resp.data);
  }
  const convoId = conversations[0].id;
  console.log("   Conversation ID:", convoId);

  console.log("3. Connecting to Socket.IO...");
  const socket = io(API_URL, {
    auth: { token },
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("   Socket connected.");
    socket.emit("presence:join-personal");
    socket.emit("conversation:join", convoId);

    setTimeout(async () => {
      console.log("4. Simulating TYPING (alice will see 'Typing...')...");
      socket.emit("message:typing", { conversationId: convoId, isTyping: true });
      await sleep(3000);
      socket.emit("message:typing", { conversationId: convoId, isTyping: false });
      console.log("   Stopped typing.");

      await sleep(1000);

      console.log("5. Fetching messages and marking them as DELIVERED...");
      const msgsRes = await api(`/messages/conversations/${convoId}/messages?page=1&limit=50`, "GET", null, token);
      const messages = msgsRes.data || [];
      const aliceMessages = messages.filter(m => m.senderId === "ce011da4-f82b-4ff3-9028-1dafc249c82d");

      if (aliceMessages.length > 0) {
        const messageIds = aliceMessages.map(m => m.id);
        await api("/messages/delivered", "POST", { messageIds }, token);
        console.log("   Messages marked as DELIVERED (alice will see 2 gray checkmarks).");
      } else {
        console.log("   No messages from alice to deliver yet.");
      }

      await sleep(2000);

      console.log("6. Marking messages as READ (alice will see 2 blue checkmarks)...");
      await api(`/messages/conversations/${convoId}/read`, "POST", {}, token);
      console.log("   Messages marked as READ.");

      await sleep(1000);

      console.log("7. Sending a reply from bob...");
      await api(`/messages/conversations/${convoId}/messages`, "POST", {
        content: "Hi Alice! This is bob. You should see typing, delivery, and read receipts working now!",
        receiverId: "ce011da4-f82b-4ff3-9028-1dafc249c82d"
      }, token);
      console.log("   Reply sent.");

      setTimeout(() => {
        console.log("\nDone. Closing connection in 3s...");
        setTimeout(() => process.exit(0), 3000);
      }, 15000);
    }, 3000);
  });

  socket.on("disconnect", () => {
    console.log("   Socket disconnected.");
  });

  socket.on("connect_error", (err) => {
    console.error("   Socket error:", err.message);
  });
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
