import { VideoUploader } from "./VideoUploader";
import { AudioUploader } from "./AudioUploader";
import { MessageService } from "./MessageService";
import { socketReceiver } from "./SocketReceiver";

/**
 * MediaService — single entry point for all media and message operations.
 *
 * Usage:
 *   import { mediaService } from "../services/MediaService";
 *
 *   // After login — set token once, it propagates everywhere
 *   mediaService.setAuthToken(token);
 *   mediaService.connectSocket(userId, token);
 *
 *   // Send text
 *   await mediaService.message.send("Hello!", { senderId, receiverId, roomId });
 *
 *   // Upload video then record the message
 *   const { url } = await mediaService.video.upload(uri, "video/mp4", 45, { userId }, onPct);
 *   await mediaService.message.sendMediaRecord("video", url, { senderId, receiverId, roomId });
 *
 *   // Upload audio from expo-av recording
 *   await mediaService.audio.uploadFromRecording(recording, { userId });
 */
export class MediaService {
  constructor(baseUrl, authToken = null) {
    this.video   = new VideoUploader(baseUrl, authToken);
    this.audio   = new AudioUploader(baseUrl, authToken);
    this.message = new MessageService(baseUrl, authToken);
    this.socket  = socketReceiver;
  }

  /**
   * Update auth token across all services at once. Call after login or token refresh.
   * @param {string} token
   */
  setAuthToken(token) {
    this.video.setAuthToken(token);
    this.audio.setAuthToken(token);
    this.message.setAuthToken(token);
  }

  /**
   * Connect the socket (call once after login).
   * @param {string} userId
   * @param {string} token
   */
  connectSocket(userId, token) {
    this.socket.connect(userId, token);
  }

  /**
   * Disconnect socket (call on logout).
   */
  disconnectSocket() {
    this.socket.disconnect();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────
export const mediaService = new MediaService(
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"
);
