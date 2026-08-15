import { api } from "./api";
import { Notification, NotificationType } from "@/types";

export interface NotificationsPage {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

export class NotificationService {
  async getNotifications(
    token: string,
    page = 1,
    limit = 50,
  ): Promise<NotificationsPage> {
    const resp = await api.get<{
      success: boolean;
      data: NotificationsPage;
    }>(`/notifications?page=${page}&limit=${limit}`, token);
    return resp.data;
  }

  async markRead(token: string, notificationId: string): Promise<void> {
    await api.post(`/notifications/${notificationId}/read`, {}, token);
  }

  async markAllRead(token: string): Promise<void> {
    await api.post(`/notifications/read-all`, {}, token);
  }

  async getUnreadCount(token: string): Promise<number> {
    const resp = await api.get<{
      success: boolean;
      data: { count: number };
    }>("/notifications/unread-count", token);
    return resp.data.count;
  }
}

export const notificationService = new NotificationService();
