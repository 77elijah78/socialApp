package com.elijah77.social.notifications

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.notifications.notifications.NotificationSerializer
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoHandlingDelegate
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate
import java.util.UUID

class GroupedNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate = GroupedPresentationDelegate(context)

  override fun onReceiveNotificationResponse(context: Context, intent: Intent) {
    val response = getNotificationResponseFromBroadcastIntent(intent)
    val data = response.notification.notificationRequest.content.body
    if (response.actionIdentifier == "REPLY_MESSAGE_V2" && data?.optString("deliveryMode") == "android-data-v2") {
      data.put("replyActionId", UUID.randomUUID().toString())
      // Use exactly one dispatch path even if an activity is running: Expo's
      // default delegate dispatches both a task and listeners in the background.
      FirebaseMessagingDelegate.runTaskManagerTasks(context.applicationContext, NotificationSerializer.toBundle(response))
    } else {
      ExpoHandlingDelegate(context).handleNotificationResponse(response)
    }
  }
}

private class GroupedPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  override suspend fun createNotification(notification: Notification, notificationBehavior: NotificationBehaviorRecord?): android.app.Notification {
    val original = super.createNotification(notification, notificationBehavior)
    val data = notification.notificationRequest.content.body ?: return original
    if (data.optInt("contractVersion") != 2 || data.optString("deliveryMode") != "android-data-v2" || data.optString("categoryIdentifier") != "MESSAGE_REPLY_V2") return original
    val recipient = data.optString("recipientUserId")
    val conversation = data.optString("conversationId")
    val group = data.optString("groupKey")
    val uuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    if (!uuid.matches(recipient) || !uuid.matches(conversation) || group != "socialapp:v2:$recipient:$conversation") return original
    // Framework recovery is available on Android 7.0+. Older versions retain
    // Expo's original notification and inline action without custom grouping.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return original
    val dismissIntent = Intent(context, GroupedNotificationDismissReceiver::class.java).apply {
      this.data = Uri.Builder().scheme("socialapp-notification").authority("dismiss").appendPath(notification.notificationRequest.identifier).build()
      putExtra("group", group)
    }
    val dismiss = PendingIntent.getBroadcast(context, 0, dismissIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val child = android.app.Notification.Builder.recoverBuilder(context, original).setGroup(group).setDeleteIntent(dismiss).build()
    val summary = NotificationCompat.Builder(context, "messages")
      .setSmallIcon(context.applicationInfo.icon).setContentTitle("Messages").setContentText("New messages")
      .setGroup(group).setGroupSummary(true).setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
      .setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
    NotificationManagerCompat.from(context).notify("social-summary:$group", 0, summary)
    return child
  }

  override fun dismissNotifications(identifiers: Collection<String>) {
    super.dismissNotifications(identifiers)
    GroupedNotificationDismissReceiver.removeEmptySummaries(context)
  }
}

/** Removes our generic summary when the last child is swiped or dismissed. */
class GroupedNotificationDismissReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) { removeEmptySummaries(context) }

  companion object {
    fun removeEmptySummaries(context: Context) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val active = manager.activeNotifications
      for (summary in active) {
        val tag = summary.tag ?: continue
        if (!tag.startsWith("social-summary:")) continue
        val group = summary.notification.group ?: continue
        if (active.none { it.tag != tag && it.notification.group == group &&
          (it.notification.flags and android.app.Notification.FLAG_GROUP_SUMMARY) == 0 }) {
          NotificationManagerCompat.from(context).cancel(tag, summary.id)
        }
      }
    }
  }
}
