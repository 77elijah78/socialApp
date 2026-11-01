import { api, ApiError, getAccessToken } from "../api";
import { API_ORIGIN } from "../../config/api";
import type { PushIdentity, PushRegistration } from "./PushTokenCoordinator";
import type { MessagePushTarget } from "./MessagePushBridge";
import { isPushUuid, PushInstallation } from "./PushInstallation";

export class PushSetupError extends Error {}
export class PushAccountAmbiguous extends Error {}
export interface MessagePushPayload {
  messageId: string; conversationId: string; senderId: string; notificationId: string;
  conversationType: "private" | "group"; notificationType: "MESSAGE";
}
export interface PushPreferences { messagePushEnabled: boolean; pushPreviewsEnabled: boolean }
interface Envelope<T> { success: boolean; data: T }
export function parseMessagePushPayload(value: unknown): MessagePushPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.notificationType !== "MESSAGE" || !["private", "group"].includes(data.conversationType as string) ||
    ![data.messageId, data.conversationId, data.senderId, data.notificationId].every(isPushUuid)) return null;
  return { messageId: data.messageId as string, conversationId: data.conversationId as string, senderId: data.senderId as string,
    notificationId: data.notificationId as string, conversationType: data.conversationType as "private" | "group", notificationType: "MESSAGE" };
}
const validPreferences = (value: unknown): value is PushPreferences => !!value && typeof value === "object" &&
  typeof (value as PushPreferences).messagePushEnabled === "boolean" && typeof (value as PushPreferences).pushPreviewsEnabled === "boolean";
function setupError(error: unknown): Error {
  if (error instanceof PushSetupError) return error;
  if (error instanceof ApiError) {
    if ([404, 405, 503].includes(error.status)) return new PushSetupError("Server push is unavailable. Check PUSH_ENABLED=true, the push migration and the deployed backend release.");
    if (error.status === 409) return new PushSetupError("Push registration conflicts with the server. Check the EAS project ID, device limit, and online unregistration of the previous account.");
    if ([401, 403].includes(error.status)) return new PushSetupError("Sign in again to synchronize message notifications.");
  }
  return new PushSetupError("Couldn’t synchronize with the push server. Check your connection and retry.");
}
/** Contracts inspected in backend 54d68df; only the existing authenticated HTTP
 * client is used. No Expo access token/service-account key belongs in this app. */
export class PushBackendService implements PushRegistration {
  private confirmed: { accountId: string; deviceId: string } | null = null;
  constructor(readonly installation: PushInstallation, private projectId: () => string | null,
    private identity: () => PushIdentity | null, private origin = API_ORIGIN) {}
  private current(owner: PushIdentity) { return !!getAccessToken() && this.identity()?.accountId === owner.accountId; }
  private token(owner: PushIdentity) {
    if (!this.current(owner)) throw new PushSetupError("The notification account changed. Sign in again if device cleanup is still pending.");
    return this.identity()!.authToken;
  }
  registration() { return this.confirmed; }
  async beforeToken(owner: PushIdentity) {
    const state = await this.installation.load();
    this.token(owner);
    if ((state.registeredOwnerId && state.registeredOwnerId !== owner.accountId) ||
      (state.pendingOwnerId && state.pendingOwnerId !== owner.accountId))
      throw new PushSetupError("This installation still needs online push cleanup by its previous account. Sign in to that account and disable system notifications before switching.");
  }

  async register(expoPushToken: string, owner: PushIdentity) {
    try {
      const projectId = this.projectId();
      if (!isPushUuid(projectId) || !this.origin) throw new PushSetupError("The build is missing its EAS project ID or API origin.");
      const state = await this.installation.load();
      if ((state.registeredOwnerId && state.registeredOwnerId !== owner.accountId) ||
        (state.pendingOwnerId && state.pendingOwnerId !== owner.accountId))
        throw new PushSetupError("This installation still needs online push cleanup by its previous account. Sign in to that account and disable system notifications before switching.");
      await this.installation.attempt(owner.accountId, this.origin);
      const result = await api.post<Envelope<{ deviceId: string; platform: string; enabled: boolean }>>("/push/devices", {
        deviceId: state.deviceId, platform: "android", projectId, token: expoPushToken,
      }, this.token(owner), { timeout: 8000 });
      if (result.success !== true || result.data?.deviceId !== state.deviceId || result.data.platform !== "android" || result.data.enabled !== true)
        throw new Error("Invalid registration acknowledgement");
      // Keep authoritative ownership even if logout raced the response; cleanup
      // must know which account's real server binding needs revocation.
      await this.installation.registered(owner.accountId, this.origin);
      if (this.current(owner)) this.confirmed = { accountId: owner.accountId, deviceId: state.deviceId };
    } catch (error) { throw setupError(error); }
  }
  revoke(_token: string, owner: PushIdentity) { return this.revokeCurrent(owner); }
  async revokeCurrent(owner: PushIdentity | null) {
    this.confirmed = null;
    if (!owner) return;
    try {
      const state = await this.installation.load();
      if (state.registeredOwnerId !== owner.accountId && state.pendingOwnerId !== owner.accountId) return;
      const result = await api.delete<Envelope<{ unregistered: boolean }>>(`/push/devices/${state.deviceId}`, this.token(owner), { timeout: 8000 });
      if (result.success !== true || result.data?.unregistered !== true) throw new Error("Invalid unregistration acknowledgement");
      await this.installation.revoked(owner.accountId);
    } catch (error) { throw setupError(error); }
  }
  async parseMessage(data: unknown): Promise<MessagePushTarget | null> {
    const payload = parseMessagePushPayload(data); if (!payload) return null;
    const state = await this.installation.load();
    // This actual legacy wire payload has NO recipient ID. Never assign the
    // current login to a stale notification. Only a proven single-owner install
    // can resolve it; after account/origin changes fail closed until the backend
    // publishes recipient-scoped data. Membership is still rechecked on tap.
    if (state.ambiguous || !state.firstOwnerId || state.origin !== this.origin) throw new PushAccountAmbiguous();
    if (payload.senderId === state.firstOwnerId) return null;
    return { accountId: state.firstOwnerId, conversationId: payload.conversationId, messageId: payload.messageId, notificationId: payload.notificationId };
  }
  async preferences(owner: PushIdentity): Promise<PushPreferences> {
    try {
      const response = await api.get<Envelope<PushPreferences>>("/push/preferences", this.token(owner), { timeout: 8000, deduplicate: false });
      if (response.success !== true || !validPreferences(response.data)) throw new Error("Invalid preferences response");
      return response.data;
    } catch (error) { throw setupError(error); }
  }
  async updatePreferences(owner: PushIdentity, patch: Partial<PushPreferences>): Promise<PushPreferences> {
    try {
      const response = await api.patch<Envelope<PushPreferences>>("/push/preferences", patch, this.token(owner), { timeout: 8000 });
      if (response.success !== true || !validPreferences(response.data)) throw new Error("Invalid preferences response");
      return response.data;
    } catch (error) { throw setupError(error); }
  }
}
