package expo.modules.deskassistandroid

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Forwards new notifications to the app (and from there to the computer),
 * only while the user has the mirror turned on. Ongoing notifications (music,
 * downloads) and DeskAssist's own are skipped. Only the app name, title and
 * text are passed on.
 */
class DeskAssistNotificationService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!NotificationMirror.enabled) return
    if (sbn.packageName == packageName || sbn.isOngoing) return
    val extras = sbn.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
    if (title.isBlank() && text.isBlank()) return
    val app = try {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString()
    } catch (_: Exception) {
      sbn.packageName
    }
    DeskAssistAndroidModule.instance?.emit(
      "onNotification",
      mapOf("app" to app, "pkg" to sbn.packageName, "title" to title.take(120), "text" to text.take(300), "at" to sbn.postTime.toDouble()),
    )
  }
}
