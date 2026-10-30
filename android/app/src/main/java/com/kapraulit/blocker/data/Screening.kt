package com.kapraulit.blocker.data

import android.content.Context
import com.kapraulit.blocker.policy.BlockPolicy
import com.kapraulit.blocker.policy.CallerFacts
import com.kapraulit.blocker.policy.Channel
import com.kapraulit.blocker.policy.Decision

/** Gathers facts about a caller from the device and asks [BlockPolicy] for a verdict. */
object Screening {
    fun check(context: Context, channel: Channel, number: String?, now: Long = System.currentTimeMillis()): Decision {
        val store = BlockerStore.get(context)
        val facts = CallerFacts(
            number = number,
            contactsReadable = ContactsLookup.canRead(context),
            isContact = ContactsLookup.isContact(context, number),
            isAllowlisted = store.isAllowlisted(number),
            recentBlockedCalls = if (channel == Channel.CALL) {
                store.countBlocked(Channel.CALL, number, now - BlockPolicy.REPEAT_CALL_WINDOW_MS)
            } else {
                0
            },
        )
        return BlockPolicy.decide(channel, facts, SettingsRepository(context).load())
    }
}
