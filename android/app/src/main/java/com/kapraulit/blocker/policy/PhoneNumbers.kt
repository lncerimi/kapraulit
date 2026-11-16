package com.kapraulit.blocker.policy

/** Phone-number helpers that do not depend on the Android framework. */
object PhoneNumbers {
    /**
     * Two numbers with at least this many digits are considered the same when their trailing
     * digits match. This bridges local and international forms, e.g. `070 123 456` and
     * `+389 70 123 456`.
     */
    private const val SUFFIX_MATCH_DIGITS = 8

    /** True when the caller withheld their number (private, restricted or unavailable). */
    fun isHidden(raw: String?): Boolean = raw.isNullOrBlank() || raw.none { it.isLetterOrDigit() }

    /**
     * True for senders that are businesses rather than people: alphanumeric names such as
     * `BANK` and short codes such as `12345`. These deliver verification codes and alerts.
     */
    fun isServiceSender(raw: String?): Boolean {
        if (raw == null || isHidden(raw)) return false
        val value = raw.trim()
        if (value.any { it.isLetter() }) return true
        return !value.startsWith("+") && value.count { it.isDigit() } in 3..6
    }

    /** Canonical form used for storage and comparison. Returns "" for hidden numbers. */
    fun normalize(raw: String?): String {
        if (raw == null || isHidden(raw)) return ""
        val value = raw.trim()
        if (value.any { it.isLetter() }) return value.lowercase()
        val digits = value.filter { it.isDigit() }
        return when {
            value.startsWith("+") -> "+$digits"
            digits.startsWith("00") -> "+" + digits.substring(2)
            else -> digits
        }
    }

    fun sameNumber(a: String?, b: String?): Boolean {
        val na = normalize(a)
        val nb = normalize(b)
        if (na.isEmpty() || nb.isEmpty()) return false
        if (na == nb) return true
        if (na.any { it.isLetter() } || nb.any { it.isLetter() }) return false
        val da = na.filter { it.isDigit() }
        val db = nb.filter { it.isDigit() }
        return da.length >= SUFFIX_MATCH_DIGITS && db.length >= SUFFIX_MATCH_DIGITS &&
            da.takeLast(SUFFIX_MATCH_DIGITS) == db.takeLast(SUFFIX_MATCH_DIGITS)
    }
}
