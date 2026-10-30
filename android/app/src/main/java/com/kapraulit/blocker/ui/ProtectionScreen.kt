package com.kapraulit.blocker.ui

import android.Manifest
import android.app.role.RoleManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.kapraulit.blocker.data.BlockerStore
import com.kapraulit.blocker.data.SettingsRepository
import com.kapraulit.blocker.policy.Channel
import com.kapraulit.blocker.policy.ProtectionSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar

@Composable
fun ProtectionScreen(setup: SetupState, onSetupChanged: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember { SettingsRepository(context) }
    var settings by remember { mutableStateOf(repository.load()) }
    fun update(newSettings: ProtectionSettings) {
        settings = newSettings
        repository.save(newSettings)
    }

    val roles = remember { context.getSystemService(RoleManager::class.java) }
    val roleLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        onSetupChanged()
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        onSetupChanged()
    }

    val changes by BlockerStore.changes.collectAsState()
    val today by produceState(emptyMap<Channel, Int>(), changes) {
        value = withContext(Dispatchers.IO) { BlockerStore.get(context).blockedCountsSince(startOfToday()) }
    }

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            StatusCard(
                setup = setup,
                settings = settings,
                callsToday = today[Channel.CALL] ?: 0,
                messagesToday = (today[Channel.SMS] ?: 0) + (today[Channel.MMS] ?: 0),
            )
        }

        item { SectionTitle("Setup") }
        item {
            SetupRow(
                title = "Screen incoming calls",
                description = "Lets Kapraulit reject calls from numbers you don't know.",
                done = setup.callScreening,
                available = setup.callScreeningAvailable,
            ) { roleLauncher.launch(roles.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)) }
        }
        item {
            SetupRow(
                title = "Default SMS app",
                description = "Android only lets the default SMS app keep messages out of your inbox.",
                done = setup.defaultSms,
                available = setup.smsAvailable,
            ) { roleLauncher.launch(roles.createRequestRoleIntent(RoleManager.ROLE_SMS)) }
        }
        item {
            SetupRow(
                title = "Read contacts",
                description = "Your contacts are who Kapraulit considers \"known\". Nothing is blocked without it.",
                done = setup.contacts,
            ) { permissionLauncher.launch(Manifest.permission.READ_CONTACTS) }
        }
        item {
            SetupRow(
                title = "Notifications",
                description = "Show new messages and blocked calls.",
                done = setup.notifications,
            ) { permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) }
        }

        item { SectionTitle("Rules") }
        item {
            ToggleRow("Protection on", "Master switch for all blocking.", settings.protectionEnabled) {
                update(settings.copy(protectionEnabled = it))
            }
        }
        item {
            ToggleRow("Block unknown calls", "Reject calls from numbers not in your contacts.", settings.blockCalls, settings.protectionEnabled) {
                update(settings.copy(blockCalls = it))
            }
        }
        item {
            ToggleRow("Block unknown messages", "Keep texts from strangers out of your inbox.", settings.blockMessages, settings.protectionEnabled) {
                update(settings.copy(blockMessages = it))
            }
        }
        item {
            ToggleRow("Block hidden numbers", "Reject calls from private or withheld numbers.", settings.blockHiddenCallers, settings.protectionEnabled && settings.blockCalls) {
                update(settings.copy(blockHiddenCallers = it))
            }
        }
        item {
            ToggleRow("Let repeated calls through", "If the same number calls again within 3 minutes, it might be urgent.", settings.allowRepeatCallers, settings.protectionEnabled && settings.blockCalls) {
                update(settings.copy(allowRepeatCallers = it))
            }
        }
        item {
            ToggleRow("Allow codes and alerts", "Texts from named senders (BANK) and short codes keep arriving.", settings.allowServiceSenders, settings.protectionEnabled && settings.blockMessages) {
                update(settings.copy(allowServiceSenders = it))
            }
        }
        item {
            ToggleRow("Notify when something is blocked", "A quiet notification you can tap to review.", settings.notifyOnBlock, settings.protectionEnabled) {
                update(settings.copy(notifyOnBlock = it))
            }
        }
    }
}

@Composable
private fun StatusCard(setup: SetupState, settings: ProtectionSettings, callsToday: Int, messagesToday: Int) {
    val callsOn = settings.protectionEnabled && settings.blockCalls && setup.callsProtected
    val messagesOn = settings.protectionEnabled && settings.blockMessages && setup.messagesProtected
    val active = callsOn || messagesOn
    val (headline, detail) = when {
        callsOn && messagesOn -> "You're protected" to "Unknown calls and messages are blocked."
        callsOn -> "Calls protected" to "Finish setup below to also block messages."
        messagesOn -> "Messages protected" to "Finish setup below to also block calls."
        !settings.protectionEnabled -> "Protection is off" to "Turn it on in the rules below."
        else -> "Setup needed" to "Grant the items below to start blocking."
    }
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (active) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                if (active) Icons.Filled.CheckCircle else Icons.Filled.Warning,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
            )
            Spacer(Modifier.width(16.dp))
            Column {
                Text(headline, style = MaterialTheme.typography.titleLarge)
                Text(detail, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.size(4.dp))
                Text(
                    "Today: $callsToday calls and $messagesToday messages blocked",
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 16.dp, start = 4.dp),
    )
}

@Composable
private fun SetupRow(title: String, description: String, done: Boolean, available: Boolean = true, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(if (available) description else "Not available on this device.") },
        trailingContent = {
            when {
                done -> Icon(Icons.Filled.CheckCircle, contentDescription = "Done", tint = MaterialTheme.colorScheme.primary)
                available -> FilledTonalButton(onClick = onClick) { Text("Allow") }
                else -> Unit
            }
        },
    )
}

@Composable
private fun ToggleRow(title: String, description: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(description) },
        trailingContent = { Switch(checked = checked, onCheckedChange = onChange, enabled = enabled) },
    )
}

private fun startOfToday(): Long = Calendar.getInstance().apply {
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
}.timeInMillis
