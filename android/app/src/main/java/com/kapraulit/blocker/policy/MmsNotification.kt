package com.kapraulit.blocker.policy

/**
 * Minimal reader for the MMS `m-notification-ind` PDU that arrives in a WAP push. It only
 * extracts the sender, which is all we need to decide whether to block the message.
 *
 * Header values follow the WSP general encoding, which lets us skip any header we do not
 * understand: 0-30 short length, 31 length-quote + uintvar, 32-127 NUL-terminated text,
 * 128-255 a single-octet short integer.
 */
object MmsNotification {
    private const val FIELD_FROM = 0x89
    private const val ADDRESS_PRESENT_TOKEN = 0x80
    private const val LENGTH_QUOTE = 31
    private const val TEXT_QUOTE: Byte = 0x7F

    fun senderOf(pdu: ByteArray): String? {
        var i = 0
        while (i < pdu.size) {
            val field = pdu[i].toInt() and 0xFF
            i++
            if (field and 0x80 == 0 || i >= pdu.size) return null
            if (field == FIELD_FROM) return parseFrom(pdu, i)
            i = skipValue(pdu, i) ?: return null
        }
        return null
    }

    private fun parseFrom(pdu: ByteArray, start: Int): String? {
        val (length, dataStart) = readValueLength(pdu, start) ?: return null
        val end = minOf(dataStart + length, pdu.size)
        if (dataStart >= end) return null
        // The alternative is insert-address-token: the sender withheld their address.
        if (pdu[dataStart].toInt() and 0xFF != ADDRESS_PRESENT_TOKEN) return null

        var j = dataStart + 1
        if (j >= end) return null
        if (pdu[j].toInt() and 0xFF <= LENGTH_QUOTE) {
            // Encoded-string-value with an explicit charset: value-length, charset, text.
            j = readValueLength(pdu, j)?.second ?: return null
            if (j >= end) return null
            val charset = pdu[j].toInt() and 0xFF
            j += if (charset >= 0x80) 1 else 1 + charset
        }
        if (j < end && pdu[j] == TEXT_QUOTE) j++
        var k = j
        while (k < end && pdu[k] != 0.toByte()) k++
        if (k <= j) return null
        return String(pdu, j, k - j, Charsets.UTF_8).substringBefore("/TYPE=").trim().ifEmpty { null }
    }

    private fun skipValue(pdu: ByteArray, start: Int): Int? {
        val first = pdu[start].toInt() and 0xFF
        return when {
            first <= LENGTH_QUOTE -> readValueLength(pdu, start)?.let { (length, next) -> next + length }
            first < 0x80 -> {
                var j = start
                while (j < pdu.size && pdu[j] != 0.toByte()) j++
                j + 1
            }
            else -> start + 1
        }
    }

    /** Returns the value length and the index of the first byte after the length itself. */
    private fun readValueLength(pdu: ByteArray, start: Int): Pair<Int, Int>? {
        if (start >= pdu.size) return null
        val first = pdu[start].toInt() and 0xFF
        return when {
            first < LENGTH_QUOTE -> first to start + 1
            first == LENGTH_QUOTE -> readUintVar(pdu, start + 1)
            else -> null
        }
    }

    private fun readUintVar(pdu: ByteArray, start: Int): Pair<Int, Int>? {
        var value = 0
        var j = start
        while (j < pdu.size && j - start < 5) {
            val b = pdu[j].toInt() and 0xFF
            value = (value shl 7) or (b and 0x7F)
            j++
            if (b and 0x80 == 0) return value to j
        }
        return null
    }
}
