package com.kapraulit.blocker.sms

import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.provider.Telephony.Sms
import android.telephony.SmsManager
import com.kapraulit.blocker.data.ContactsLookup

data class SmsThread(
    val threadId: Long,
    val address: String,
    val name: String?,
    val snippet: String,
    val date: Long,
    val unread: Int,
)

data class SmsItem(val id: Long, val body: String, val date: Long, val type: Int, val read: Boolean) {
    val incoming: Boolean get() = type == Sms.MESSAGE_TYPE_INBOX
}

/** Reads and writes the system SMS store. Writes only succeed while we are the default SMS app. */
object SmsRepository {
    private const val MAX_SCAN = 5000

    fun threads(context: Context): List<SmsThread> {
        val projection = arrayOf(Sms.THREAD_ID, Sms.ADDRESS, Sms.BODY, Sms.DATE, Sms.READ, Sms.TYPE)
        val byThread = LinkedHashMap<Long, SmsThread>()
        val names = HashMap<String, String?>()
        try {
            context.contentResolver.query(Sms.CONTENT_URI, projection, null, null, "${Sms.DATE} DESC")?.use { c ->
                var scanned = 0
                while (c.moveToNext() && scanned++ < MAX_SCAN) {
                    val threadId = c.getLong(0)
                    val unread = c.getInt(4) == 0 && c.getInt(5) == Sms.MESSAGE_TYPE_INBOX
                    val existing = byThread[threadId]
                    if (existing != null) {
                        if (unread) byThread[threadId] = existing.copy(unread = existing.unread + 1)
                        continue
                    }
                    val address = c.getString(1) ?: continue
                    val name = names.getOrPut(address) { ContactsLookup.displayName(context, address)?.ifEmpty { null } }
                    byThread[threadId] = SmsThread(
                        threadId = threadId,
                        address = address,
                        name = name,
                        snippet = c.getString(2).orEmpty(),
                        date = c.getLong(3),
                        unread = if (unread) 1 else 0,
                    )
                }
            }
        } catch (e: SecurityException) {
            return emptyList()
        }
        return byThread.values.toList()
    }

    /** Messages exchanged with [address], oldest first. Marks incoming ones as read. */
    fun conversation(context: Context, address: String): List<SmsItem> {
        val threadId = threadIdFor(context, address) ?: return emptyList()
        val projection = arrayOf(Sms._ID, Sms.BODY, Sms.DATE, Sms.TYPE, Sms.READ)
        val items = try {
            context.contentResolver.query(
                Sms.CONTENT_URI, projection, "${Sms.THREAD_ID} = ?", arrayOf(threadId.toString()), "${Sms.DATE} ASC",
            )?.use { c ->
                buildList {
                    while (c.moveToNext()) {
                        add(SmsItem(c.getLong(0), c.getString(1).orEmpty(), c.getLong(2), c.getInt(3), c.getInt(4) != 0))
                    }
                }
            }.orEmpty()
        } catch (e: SecurityException) {
            return emptyList()
        }
        if (items.any { it.incoming && !it.read }) markThreadRead(context, threadId)
        return items
    }

    private fun threadIdFor(context: Context, address: String): Long? =
        try {
            Telephony.Threads.getOrCreateThreadId(context, address)
        } catch (e: RuntimeException) {
            null
        }

    private fun markThreadRead(context: Context, threadId: Long) {
        val values = ContentValues().apply {
            put(Sms.READ, 1)
            put(Sms.SEEN, 1)
        }
        try {
            context.contentResolver.update(
                Sms.CONTENT_URI, values, "${Sms.THREAD_ID} = ? AND ${Sms.READ} = 0", arrayOf(threadId.toString()),
            )
        } catch (e: RuntimeException) {
            // Not the default SMS app; nothing to do.
        }
    }

    fun insertIncoming(
        context: Context,
        address: String,
        body: String,
        date: Long,
        dateSent: Long,
        read: Boolean,
        subscriptionId: Int? = null,
    ): Uri? {
        val values = ContentValues().apply {
            put(Sms.ADDRESS, address)
            put(Sms.BODY, body)
            put(Sms.DATE, date)
            put(Sms.DATE_SENT, dateSent)
            put(Sms.READ, if (read) 1 else 0)
            put(Sms.SEEN, if (read) 1 else 0)
            put(Sms.TYPE, Sms.MESSAGE_TYPE_INBOX)
            if (subscriptionId != null) put(Sms.SUBSCRIPTION_ID, subscriptionId)
        }
        return try {
            context.contentResolver.insert(Sms.Inbox.CONTENT_URI, values)
        } catch (e: RuntimeException) {
            null
        }
    }

    fun send(context: Context, address: String, body: String) {
        val app = context.applicationContext
        val now = System.currentTimeMillis()
        val values = ContentValues().apply {
            put(Sms.ADDRESS, address)
            put(Sms.BODY, body)
            put(Sms.DATE, now)
            put(Sms.READ, 1)
            put(Sms.SEEN, 1)
            put(Sms.TYPE, Sms.MESSAGE_TYPE_OUTBOX)
        }
        val messageUri = try {
            app.contentResolver.insert(Sms.Outbox.CONTENT_URI, values)
        } catch (e: RuntimeException) {
            null
        }

        val sentIntent = PendingIntent.getBroadcast(
            app,
            messageUri?.lastPathSegment?.toIntOrNull() ?: now.toInt(),
            Intent(app, SmsSentReceiver::class.java).putExtra(SmsSentReceiver.EXTRA_MESSAGE_URI, messageUri?.toString()),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        try {
            val manager = smsManager(app)
            val parts = manager.divideMessage(body)
            if (parts.size <= 1) {
                manager.sendTextMessage(address, null, body, sentIntent, null)
            } else {
                manager.sendMultipartTextMessage(address, null, parts, ArrayList(List(parts.size) { sentIntent }), null)
            }
        } catch (e: RuntimeException) {
            messageUri?.let { onSendResult(app, it, success = false) }
        }
    }

    fun onSendResult(context: Context, messageUri: Uri, success: Boolean) {
        try {
            if (success) {
                // A multipart message reports once per part; never overwrite an earlier failure.
                val values = ContentValues().apply { put(Sms.TYPE, Sms.MESSAGE_TYPE_SENT) }
                context.contentResolver.update(
                    messageUri, values, "${Sms.TYPE} = ?", arrayOf(Sms.MESSAGE_TYPE_OUTBOX.toString()),
                )
            } else {
                val values = ContentValues().apply { put(Sms.TYPE, Sms.MESSAGE_TYPE_FAILED) }
                context.contentResolver.update(messageUri, values, null, null)
            }
        } catch (e: RuntimeException) {
            // Lost the default SMS role in the meantime.
        }
    }

    private fun smsManager(context: Context): SmsManager =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }
}
