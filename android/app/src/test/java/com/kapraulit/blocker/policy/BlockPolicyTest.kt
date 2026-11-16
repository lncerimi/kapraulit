package com.kapraulit.blocker.policy

import org.junit.Assert.assertEquals
import org.junit.Test

class BlockPolicyTest {
    private val defaults = ProtectionSettings()
    private val stranger = CallerFacts(
        number = "+38970123456",
        contactsReadable = true,
        isContact = false,
        isAllowlisted = false,
    )

    private fun decide(channel: Channel, facts: CallerFacts = stranger, settings: ProtectionSettings = defaults) =
        BlockPolicy.decide(channel, facts, settings)

    @Test
    fun blocksUnknownCallsAndMessages() {
        assertEquals(Decision(true, Reason.UNKNOWN), decide(Channel.CALL))
        assertEquals(Decision(true, Reason.UNKNOWN), decide(Channel.SMS))
        assertEquals(Decision(true, Reason.UNKNOWN), decide(Channel.MMS))
    }

    @Test
    fun allowsContacts() {
        assertEquals(Decision(false, Reason.CONTACT), decide(Channel.CALL, stranger.copy(isContact = true)))
        assertEquals(Decision(false, Reason.CONTACT), decide(Channel.SMS, stranger.copy(isContact = true)))
    }

    @Test
    fun allowsAllowlistedNumbers() {
        assertEquals(Decision(false, Reason.ALLOWLISTED), decide(Channel.SMS, stranger.copy(isAllowlisted = true)))
    }

    @Test
    fun failsOpenWithoutContactsAccess() {
        assertEquals(
            Decision(false, Reason.CONTACTS_UNAVAILABLE),
            decide(Channel.SMS, stranger.copy(contactsReadable = false)),
        )
    }

    @Test
    fun respectsSwitches() {
        assertEquals(Decision(false, Reason.PROTECTION_OFF), decide(Channel.CALL, settings = defaults.copy(protectionEnabled = false)))
        assertEquals(Decision(false, Reason.CHANNEL_OFF), decide(Channel.CALL, settings = defaults.copy(blockCalls = false)))
        assertEquals(Decision(false, Reason.CHANNEL_OFF), decide(Channel.SMS, settings = defaults.copy(blockMessages = false)))
        assertEquals(Decision(true, Reason.UNKNOWN), decide(Channel.SMS, settings = defaults.copy(blockCalls = false)))
    }

    @Test
    fun hiddenCallers() {
        val hidden = stranger.copy(number = null)
        assertEquals(Decision(true, Reason.HIDDEN), decide(Channel.CALL, hidden))
        assertEquals(
            Decision(false, Reason.HIDDEN_ALLOWED),
            decide(Channel.CALL, hidden, defaults.copy(blockHiddenCallers = false)),
        )
    }

    @Test
    fun repeatCallersGetThrough() {
        val repeat = stranger.copy(recentBlockedCalls = 1)
        assertEquals(Decision(false, Reason.REPEAT_CALLER), decide(Channel.CALL, repeat))
        assertEquals(Decision(true, Reason.UNKNOWN), decide(Channel.CALL, repeat, defaults.copy(allowRepeatCallers = false)))
        // Repeats only matter for calls.
        assertEquals(Decision(true, Reason.UNKNOWN), decide(Channel.SMS, repeat))
    }

    @Test
    fun serviceSendersOnlyForMessages() {
        val bank = stranger.copy(number = "BANK")
        assertEquals(Decision(false, Reason.SERVICE_SENDER), decide(Channel.SMS, bank))
        assertEquals(Decision(true, Reason.UNKNOWN), decide(Channel.SMS, bank, defaults.copy(allowServiceSenders = false)))
        assertEquals(Decision(true, Reason.UNKNOWN), decide(Channel.CALL, stranger.copy(number = "12345")))
    }
}
