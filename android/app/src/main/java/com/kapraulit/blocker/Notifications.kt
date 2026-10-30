package com.kapraulit.blocker

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.kapraulit.blocker.data.ContactsLookup
import com.kapraulit.blocker.data.SettingsRepository
import com.kapraulit.blocker.policy.Channel

object Notifications {
    private const val CHANNEL_MESSAGES = "messages"
    private const val CHANNEL_BLOCKED = "blocked"
    private const val ID_BLOCKED_CALL = 1
    private const val ID_BLOCKED_MESSAGE = 2

    fun ensureChannels(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannels(
            listOf(
                NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH),
                NotificationChannel(CHANNEL_BLOCKED, "Blocked calls and messages", NotificationManager.IMPORTANCE_LOW),
            )
        )
    }

    fun showMessage(context: Context, address: String, body: String) {
        val title = ContactsLookup.displayName(context, address)?.ifEmpty { null } ?: address
        post(context, address.hashCode()) {
            NotificationCompat.Builder(context, CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_shield)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(openApp(context, address))
        }
    }

    fun showMmsUnsupported(context: Context, sender: String?) {
        val from = sender?.let { ContactsLookup.displayName(context, it)?.ifEmpty { null } ?: it } ?: "someone"
        post(context, (sender ?: "mms").hashCode()) {
            NotificationCompat.Builder(context, CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_shield)
                .setContentTitle("Picture or group message from $from")
                .setContentText("Kapraulit can't show MMS yet. Switch your default SMS app to read it.")
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(openApp(context, null))
        }
    }

    fun showBlocked(context: Context, channel: Channel, number: String?) {
        if (!SettingsRepository(context).load().notifyOnBlock) return
        val who = number?.takeIf { it.isNotBlank() } ?: "a hidden number"
        val title = if (channel == Channel.CALL) "Blocked call from $who" else "Blocked message from $who"
        post(context, if (channel == Channel.CALL) ID_BLOCKED_CALL else ID_BLOCKED_MESSAGE) {
            NotificationCompat.Builder(context, CHANNEL_BLOCKED)
                .setSmallIcon(R.drawable.ic_stat_shield)
                .setContentTitle(title)
                .setContentText("Open Kapraulit to review or allow this number.")
                .setAutoCancel(true)
                .setContentIntent(openApp(context, null))
        }
    }

    private fun post(context: Context, id: Int, build: () -> NotificationCompat.Builder) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ensureChannels(context)
        try {
            NotificationManagerCompat.from(context).notify(id, build().build())
        } catch (e: SecurityException) {
            // Permission revoked between the check and the call.
        }
    }

    private fun openApp(context: Context, address: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (address != null) intent.putExtra(MainActivity.EXTRA_ADDRESS, address)
        return PendingIntent.getActivity(
            context, address?.hashCode() ?: 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }
}
