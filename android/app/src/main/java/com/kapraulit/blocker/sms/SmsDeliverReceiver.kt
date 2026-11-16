package com.kapraulit.blocker.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SubscriptionManager
import kotlin.concurrent.thread

/** Receives every incoming SMS while Kapraulit is the default SMS app. */
class SmsDeliverReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_DELIVER_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (parts.isNullOrEmpty()) return

        val first = parts[0]
        val sender = first.displayOriginatingAddress ?: first.originatingAddress
        val body = parts.joinToString("") { it.displayMessageBody.orEmpty() }
        val subscriptionId = intent.getIntExtra(SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX, -1).takeIf { it >= 0 }

        val app = context.applicationContext
        val pending = goAsync()
        thread(name = "sms-deliver") {
            try {
                IncomingMessages.onSms(app, sender, body, first.timestampMillis, subscriptionId)
            } finally {
                pending.finish()
            }
        }
    }
}
