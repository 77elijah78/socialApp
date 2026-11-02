import { API_ORIGIN } from "../config/api";
import { MessageService } from "./MessageService";
import { socketReceiver, SocketReceiver } from "./SocketReceiver";

/**
 * Existing messaging facade: MessageService creates/reconciles SQLite rows and
 * uploads local attachments before the existing conversation message/reply POST.
 * SocketReceiver owns the shared Socket.IO connection and incoming persistence.
 * There are no separate .video/.audio services or competing message stores.
 *
 * After login: setAuthToken(token), then connectSocket(userId, token).
 * Media: message.sendMediaRecord(type, localUri, metadata, duration, replyId, attachment).
 * Logout: disconnectSocket(); account preparation clears the scoped stores.
 */
export class MediaService {
  readonly message: MessageService;
  readonly socket: SocketReceiver;

  constructor(baseUrl: string, authToken: any = null) {
    this.message = new MessageService(baseUrl, authToken);
    this.socket = socketReceiver;
  }

  /**
   * Propagate a new auth token to all services at once.
   * Call after login or token refresh.
   */
  setAuthToken(token: string): void {
    this.message.setAuthToken(token);
  }

  /**
   * Connect the Socket.IO client and start receiving messages.
   * Call once after login — NOT per-screen.
   */
  connectSocket(userId: string, token: string): void {
    this.socket.connect(userId, token);
  }

  /**
   * Disconnect Socket.IO. Call on logout.
   */
  disconnectSocket(): void {
    this.socket.disconnect();
  }
}

// ─── App-wide singleton ───────────────────────────────────────────────────────
// Import this everywhere — one instance, one socket connection, one token state.
export const mediaService = new MediaService(`${API_ORIGIN}/api/v1`);
