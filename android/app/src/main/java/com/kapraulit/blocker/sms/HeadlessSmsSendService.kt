package com.kapraulit.blocker.sms

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.telephony.TelephonyManager
import com.kapraulit.blocker.policy.Recipients
import kotlin.concurrent.thread

/** Sends the quick replies offered on the incoming-call screen ("Can't talk now..."). */
class HeadlessSmsSendService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val address = Recipients.parse(intent?.data?.schemeSpecificPart)?.address
        val text = intent?.getStringExtra(Intent.EXTRA_TEXT)
        if (intent?.action != TelephonyManager.ACTION_RESPOND_VIA_MESSAGE || address == null || text.isNullOrBlank()) {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        thread(name = "respond-via-message") {
            SmsRepository.send(applicationContext, address, text)
            stopSelf(startId)
        }
        return START_NOT_STICKY
    }
}
