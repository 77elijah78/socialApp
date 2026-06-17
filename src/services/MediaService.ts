import { VideoUploader } from "./VideoUploader";
import { AudioUploader } from "./AudioUploader";
import { MessageService } from "./MessageService";
import { socketReceiver, SocketReceiver } from "./SocketReceiver";

/**
 * MediaService — single entry point for the entire messaging + media system.
 *
 * ┌─────────────────────────────────┐
 * │           MediaService          │
 * │  .video   → VideoUploader       │
 * │  .audio   → AudioUploader       │
 * │  .message → MessageService      │  ← all write to SQLite via MessageStore
 * │  .socket  → SocketReceiver      │  ← reads from server, writes to SQLite
 * └─────────────────────────────────┘
 *
 * Usage (after login):
 *   mediaService.setAuthToken(token);
 *   mediaService.connectSocket(userId, token);
 *
 *   // Text
 *   await mediaService.message.send("Hi", { senderId, receiverId, roomId });
 *
 *   // Video
 *   const { url } = await mediaService.video.upload(uri, "video/mp4", 45, { userId }, onPct);
 *   await mediaService.message.sendMediaRecord("video", url, { senderId, receiverId, roomId });
 *
 *   // Audio (from expo-av recording)
 *   await mediaService.audio.uploadFromRecording(recording, { userId });
 *
 *   // On logout
 *   mediaService.disconnectSocket();
 */
export class MediaService {
  readonly video:   VideoUploader;
  readonly audio:   AudioUploader;
  readonly message: MessageService;
  readonly socket:  SocketReceiver;

  constructor(baseUrl: string, authToken: string | null = null) {
    this.video   = new VideoUploader(baseUrl, authToken);
    this.audio   = new AudioUploader(baseUrl, authToken);
    this.message = new MessageService(baseUrl, authToken);
    this.socket  = socketReceiver;
  }

  /**
   * Propagate a new auth token to all services at once.
   * Call after login or token refresh.
   */
  setAuthToken(token: string): void {
    this.video.setAuthToken(token);
    this.audio.setAuthToken(token);
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
export const mediaService = new MediaService(
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"
);
