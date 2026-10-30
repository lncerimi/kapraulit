package com.kapraulit.blocker

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.kapraulit.blocker.policy.Recipients
import com.kapraulit.blocker.ui.KapraulitApp
import com.kapraulit.blocker.ui.KapraulitTheme
import com.kapraulit.blocker.ui.OpenConversation

class MainActivity : ComponentActivity() {
    private var openConversation by mutableStateOf<OpenConversation?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Notifications.ensureChannels(this)
        if (savedInstanceState == null) handleIntent(intent)
        setContent {
            KapraulitTheme {
                KapraulitApp(
                    openConversation = openConversation,
                    onOpenConversation = { openConversation = it },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Opens a conversation for `smsto:` links, share intents and notification taps. */
    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        val fromUri = intent.data?.takeIf { it.scheme in SMS_SCHEMES }?.let { Recipients.parse(it.schemeSpecificPart) }
        val address = fromUri?.address ?: intent.getStringExtra(EXTRA_ADDRESS)
        if (address.isNullOrBlank()) return
        val draft = intent.getStringExtra("sms_body") ?: intent.getStringExtra(Intent.EXTRA_TEXT) ?: fromUri?.body
        openConversation = OpenConversation(address, draft.orEmpty())
    }

    companion object {
        const val EXTRA_ADDRESS = "com.kapraulit.blocker.ADDRESS"
        private val SMS_SCHEMES = setOf("sms", "smsto", "mms", "mmsto")
    }
}
