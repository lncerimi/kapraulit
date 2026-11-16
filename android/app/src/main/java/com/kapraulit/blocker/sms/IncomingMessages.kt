package com.kapraulit.blocker.sms

import android.content.Context
import com.kapraulit.blocker.Notifications
import com.kapraulit.blocker.data.BlockerStore
import com.kapraulit.blocker.data.Screening
import com.kapraulit.blocker.policy.Channel

/** Decides what happens to a message that just arrived. Call off the main thread. */
object IncomingMessages {
    fun onSms(context: Context, sender: String?, body: String, dateSent: Long, subscriptionId: Int?) {
        val now = System.currentTimeMillis()
        if (Screening.check(context, Channel.SMS, sender, now).block) {
            BlockerStore.get(context).logBlocked(Channel.SMS, sender, body, now)
            Notifications.showBlocked(context, Channel.SMS, sender)
            return
        }
        val address = sender.orEmpty()
        SmsRepository.insertIncoming(context, address, body, now, dateSent, read = false, subscriptionId)
        Notifications.showMessage(context, address, body)
    }

    fun onMms(context: Context, sender: String?) {
        val now = System.currentTimeMillis()
        if (Screening.check(context, Channel.MMS, sender, now).block) {
            BlockerStore.get(context).logBlocked(Channel.MMS, sender, null, now)
            Notifications.showBlocked(context, Channel.MMS, sender)
            return
        }
        Notifications.showMmsUnsupported(context, sender)
    }
}
