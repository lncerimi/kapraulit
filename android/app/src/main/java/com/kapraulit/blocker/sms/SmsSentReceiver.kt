package com.kapraulit.blocker.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import kotlin.concurrent.thread

class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val messageUri = intent.getStringExtra(EXTRA_MESSAGE_URI)?.let(Uri::parse) ?: return
        val success = resultCode == Activity.RESULT_OK
        val app = context.applicationContext
        val pending = goAsync()
        thread(name = "sms-sent") {
            try {
                SmsRepository.onSendResult(app, messageUri, success)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val EXTRA_MESSAGE_URI = "message_uri"
    }
}
