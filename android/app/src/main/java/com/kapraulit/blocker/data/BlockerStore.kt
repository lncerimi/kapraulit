package com.kapraulit.blocker.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.kapraulit.blocker.policy.Channel
import com.kapraulit.blocker.policy.PhoneNumbers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class BlockedEvent(
    val id: Long,
    val channel: Channel,
    val number: String?,
    val body: String?,
    val timestamp: Long,
    val restored: Boolean,
)

data class AllowedNumber(val number: String, val label: String?, val added: Long)

/** The log of blocked calls and messages, and the user's allowlist. */
class BlockerStore private constructor(context: Context) :
    SQLiteOpenHelper(context, "kapraulit.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE blocked (" +
                "_id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "channel TEXT NOT NULL, " +
                "number TEXT, " +
                "body TEXT, " +
                "timestamp INTEGER NOT NULL, " +
                "restored INTEGER NOT NULL DEFAULT 0)"
        )
        db.execSQL("CREATE INDEX blocked_timestamp ON blocked(timestamp)")
        db.execSQL(
            "CREATE TABLE allowlist (" +
                "normalized TEXT PRIMARY KEY, " +
                "number TEXT NOT NULL, " +
                "label TEXT, " +
                "added INTEGER NOT NULL)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun logBlocked(channel: Channel, number: String?, body: String?, timestamp: Long) {
        val values = ContentValues().apply {
            put("channel", channel.name)
            put("number", number)
            put("body", body)
            put("timestamp", timestamp)
        }
        writableDatabase.insert("blocked", null, values)
        notifyChanged()
    }

    fun blockedEvents(limit: Int = 500): List<BlockedEvent> =
        readableDatabase.query(
            "blocked", arrayOf("_id", "channel", "number", "body", "timestamp", "restored"),
            null, null, null, null, "timestamp DESC", limit.toString(),
        ).use { c ->
            buildList {
                while (c.moveToNext()) {
                    add(
                        BlockedEvent(
                            id = c.getLong(0),
                            channel = Channel.valueOf(c.getString(1)),
                            number = c.getString(2),
                            body = c.getString(3),
                            timestamp = c.getLong(4),
                            restored = c.getInt(5) != 0,
                        )
                    )
                }
            }
        }

    /** Number of blocked events per channel since [since]. */
    fun blockedCountsSince(since: Long): Map<Channel, Int> =
        readableDatabase.rawQuery(
            "SELECT channel, COUNT(*) FROM blocked WHERE timestamp >= ? GROUP BY channel",
            arrayOf(since.toString()),
        ).use { c ->
            buildMap { while (c.moveToNext()) put(Channel.valueOf(c.getString(0)), c.getInt(1)) }
        }

    fun countBlocked(channel: Channel, number: String?, since: Long): Int =
        readableDatabase.query(
            "blocked", arrayOf("number"), "channel = ? AND timestamp >= ?",
            arrayOf(channel.name, since.toString()), null, null, null,
        ).use { c ->
            var count = 0
            while (c.moveToNext()) if (PhoneNumbers.sameNumber(c.getString(0), number)) count++
            count
        }

    fun markRestored(id: Long) {
        writableDatabase.update("blocked", ContentValues().apply { put("restored", 1) }, "_id = ?", arrayOf(id.toString()))
        notifyChanged()
    }

    fun deleteBlocked(id: Long) {
        writableDatabase.delete("blocked", "_id = ?", arrayOf(id.toString()))
        notifyChanged()
    }

    fun clearBlocked() {
        writableDatabase.delete("blocked", null, null)
        notifyChanged()
    }

    fun allowlist(): List<AllowedNumber> =
        readableDatabase.query(
            "allowlist", arrayOf("number", "label", "added"), null, null, null, null, "added DESC",
        ).use { c ->
            buildList { while (c.moveToNext()) add(AllowedNumber(c.getString(0), c.getString(1), c.getLong(2))) }
        }

    fun isAllowlisted(number: String?): Boolean = allowlist().any { PhoneNumbers.sameNumber(it.number, number) }

    fun allow(number: String, label: String?) {
        val normalized = PhoneNumbers.normalize(number)
        if (normalized.isEmpty()) return
        val values = ContentValues().apply {
            put("normalized", normalized)
            put("number", number.trim())
            put("label", label?.trim()?.ifEmpty { null })
            put("added", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("allowlist", null, values, SQLiteDatabase.CONFLICT_REPLACE)
        notifyChanged()
    }

    fun disallow(number: String) {
        writableDatabase.delete("allowlist", "normalized = ?", arrayOf(PhoneNumbers.normalize(number)))
        notifyChanged()
    }

    private fun notifyChanged() {
        _changes.value++
    }

    companion object {
        @Volatile
        private var instance: BlockerStore? = null

        private val _changes = MutableStateFlow(0)

        /** Bumped after every write so the UI can reload. */
        val changes: StateFlow<Int> = _changes.asStateFlow()

        fun get(context: Context): BlockerStore =
            instance ?: synchronized(this) {
                instance ?: BlockerStore(context.applicationContext).also { instance = it }
            }
    }
}
