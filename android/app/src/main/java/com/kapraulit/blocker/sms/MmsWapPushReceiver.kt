package com.kapraulit.blocker.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.kapraulit.blocker.policy.MmsNotification
import kotlin.concurrent.thread

/** Receives MMS notifications while Kapraulit is the default SMS app. */
class MmsWapPushReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.WAP_PUSH_DELIVER_ACTION) return
        val pdu = intent.getByteArrayExtra("data") ?: return
        val sender = MmsNotification.senderOf(pdu)

        val app = context.applicationContext
        val pending = goAsync()
        thread(name = "mms-deliver") {
            try {
                IncomingMessages.onMms(app, sender)
            } finally {
                pending.finish()
            }
        }
    }
}
