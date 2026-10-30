package com.kapraulit.blocker.policy

data class Recipient(val address: String, val body: String?)

object Recipients {
    /**
     * Parses the already-decoded scheme-specific part of an `sms:`/`smsto:` URI, such as
     * `+38970123456;+38970999999?body=Hello`. Only the first recipient is used.
     */
    fun parse(schemeSpecificPart: String?): Recipient? {
        if (schemeSpecificPart.isNullOrBlank()) return null
        val address = schemeSpecificPart.substringBefore('?')
            .trimStart('/')
            .split(',', ';')
            .map { it.trim() }
            .firstOrNull { it.isNotEmpty() }
            ?: return null
        val body = schemeSpecificPart.substringAfter('?', "")
            .split('&')
            .firstOrNull { it.startsWith("body=") }
            ?.removePrefix("body=")
        return Recipient(address, body)
    }
}
