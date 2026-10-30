package com.kapraulit.blocker.call

import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.CallScreeningService.CallResponse
import com.kapraulit.blocker.Notifications
import com.kapraulit.blocker.data.BlockerStore
import com.kapraulit.blocker.data.Screening
import com.kapraulit.blocker.policy.Channel

/**
 * Bound by the system for every incoming call once the user grants the call-screening role.
 * On Android 10+ the system only consults non-dialer screening apps for numbers that are not
 * in the user's contacts, but we check contacts ourselves as well.
 */
class UnknownCallScreeningService : CallScreeningService() {

    override fun onScreenCall(callDetails: Call.Details) {
        if (callDetails.callDirection != Call.Details.DIRECTION_INCOMING) {
            respondToCall(callDetails, CallResponse.Builder().build())
            return
        }

        val number = callDetails.handle?.schemeSpecificPart
        val decision = Screening.check(this, Channel.CALL, number)
        val response = if (decision.block) {
            CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                // Keep the call in the call log so the user can call back if it mattered.
                .setSkipCallLog(false)
                .setSkipNotification(true)
                .build()
        } else {
            CallResponse.Builder().build()
        }
        respondToCall(callDetails, response)

        if (decision.block) {
            BlockerStore.get(this).logBlocked(Channel.CALL, number, null, System.currentTimeMillis())
            Notifications.showBlocked(this, Channel.CALL, number)
        }
    }
}
