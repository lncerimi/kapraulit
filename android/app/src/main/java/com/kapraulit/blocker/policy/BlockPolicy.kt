package com.kapraulit.blocker.policy

enum class Channel { CALL, SMS, MMS }

data class ProtectionSettings(
    val protectionEnabled: Boolean = true,
    val blockCalls: Boolean = true,
    val blockMessages: Boolean = true,
    val blockHiddenCallers: Boolean = true,
    /** Let an unknown number through when it calls again shortly after being blocked. */
    val allowRepeatCallers: Boolean = true,
    /** Let named senders and short codes through so verification codes keep arriving. */
    val allowServiceSenders: Boolean = true,
    val notifyOnBlock: Boolean = true,
)

/** What we know about whoever is calling or texting. */
data class CallerFacts(
    val number: String?,
    val contactsReadable: Boolean,
    val isContact: Boolean,
    val isAllowlisted: Boolean,
    val recentBlockedCalls: Int = 0,
)

enum class Reason {
    PROTECTION_OFF,
    CHANNEL_OFF,
    HIDDEN,
    HIDDEN_ALLOWED,
    ALLOWLISTED,
    CONTACTS_UNAVAILABLE,
    CONTACT,
    SERVICE_SENDER,
    REPEAT_CALLER,
    UNKNOWN,
}

data class Decision(val block: Boolean, val reason: Reason)

object BlockPolicy {
    /** How long a blocked caller has to call again to get through as a repeat caller. */
    const val REPEAT_CALL_WINDOW_MS = 3 * 60 * 1000L

    fun decide(channel: Channel, facts: CallerFacts, settings: ProtectionSettings): Decision {
        if (!settings.protectionEnabled) return allow(Reason.PROTECTION_OFF)
        val channelEnabled = if (channel == Channel.CALL) settings.blockCalls else settings.blockMessages
        if (!channelEnabled) return allow(Reason.CHANNEL_OFF)

        if (PhoneNumbers.isHidden(facts.number)) {
            return if (channel != Channel.CALL || settings.blockHiddenCallers) {
                Decision(block = true, reason = Reason.HIDDEN)
            } else {
                allow(Reason.HIDDEN_ALLOWED)
            }
        }
        if (facts.isAllowlisted) return allow(Reason.ALLOWLISTED)
        // Without access to contacts we cannot tell friends from strangers, so fail open
        // rather than silently dropping messages from people the user knows.
        if (!facts.contactsReadable) return allow(Reason.CONTACTS_UNAVAILABLE)
        if (facts.isContact) return allow(Reason.CONTACT)
        if (channel != Channel.CALL && settings.allowServiceSenders && PhoneNumbers.isServiceSender(facts.number)) {
            return allow(Reason.SERVICE_SENDER)
        }
        if (channel == Channel.CALL && settings.allowRepeatCallers && facts.recentBlockedCalls > 0) {
            return allow(Reason.REPEAT_CALLER)
        }
        return Decision(block = true, reason = Reason.UNKNOWN)
    }

    private fun allow(reason: Reason) = Decision(block = false, reason = reason)
}
