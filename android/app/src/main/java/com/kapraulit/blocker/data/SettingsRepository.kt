package com.kapraulit.blocker.data

import android.content.Context
import androidx.core.content.edit
import com.kapraulit.blocker.policy.ProtectionSettings

class SettingsRepository(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("settings", Context.MODE_PRIVATE)

    fun load(): ProtectionSettings {
        val defaults = ProtectionSettings()
        return ProtectionSettings(
            protectionEnabled = prefs.getBoolean(PROTECTION_ENABLED, defaults.protectionEnabled),
            blockCalls = prefs.getBoolean(BLOCK_CALLS, defaults.blockCalls),
            blockMessages = prefs.getBoolean(BLOCK_MESSAGES, defaults.blockMessages),
            blockHiddenCallers = prefs.getBoolean(BLOCK_HIDDEN, defaults.blockHiddenCallers),
            allowRepeatCallers = prefs.getBoolean(ALLOW_REPEAT, defaults.allowRepeatCallers),
            allowServiceSenders = prefs.getBoolean(ALLOW_SERVICE, defaults.allowServiceSenders),
            notifyOnBlock = prefs.getBoolean(NOTIFY_ON_BLOCK, defaults.notifyOnBlock),
        )
    }

    fun save(settings: ProtectionSettings) {
        prefs.edit {
            putBoolean(PROTECTION_ENABLED, settings.protectionEnabled)
            putBoolean(BLOCK_CALLS, settings.blockCalls)
            putBoolean(BLOCK_MESSAGES, settings.blockMessages)
            putBoolean(BLOCK_HIDDEN, settings.blockHiddenCallers)
            putBoolean(ALLOW_REPEAT, settings.allowRepeatCallers)
            putBoolean(ALLOW_SERVICE, settings.allowServiceSenders)
            putBoolean(NOTIFY_ON_BLOCK, settings.notifyOnBlock)
        }
    }

    private companion object {
        const val PROTECTION_ENABLED = "protection_enabled"
        const val BLOCK_CALLS = "block_calls"
        const val BLOCK_MESSAGES = "block_messages"
        const val BLOCK_HIDDEN = "block_hidden"
        const val ALLOW_REPEAT = "allow_repeat"
        const val ALLOW_SERVICE = "allow_service"
        const val NOTIFY_ON_BLOCK = "notify_on_block"
    }
}
