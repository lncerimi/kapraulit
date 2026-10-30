package com.kapraulit.blocker.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kapraulit.blocker.data.AllowedNumber
import com.kapraulit.blocker.data.BlockedEvent
import com.kapraulit.blocker.data.BlockerStore
import com.kapraulit.blocker.policy.Channel
import com.kapraulit.blocker.policy.PhoneNumbers
import com.kapraulit.blocker.sms.SmsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun BlockedScreen(setup: SetupState, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val store = BlockerStore.get(context)
    val scope = rememberCoroutineScope()
    val changes by BlockerStore.changes.collectAsState()
    val state by produceState(emptyList<BlockedEvent>() to emptyList<AllowedNumber>(), changes) {
        value = withContext(Dispatchers.IO) { store.blockedEvents() to store.allowlist() }
    }
    val (events, allowed) = state
    var confirmClear by rememberSaveable { mutableStateOf(false) }

    fun io(block: () -> Unit) {
        scope.launch(Dispatchers.IO) { block() }
    }

    if (events.isEmpty()) {
        EmptyState("Nothing blocked yet", "Calls and messages from unknown numbers will be listed here.", modifier)
        return
    }

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${events.size} blocked",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { confirmClear = true }) { Text("Clear all") }
            }
        }
        items(events, key = { it.id }) { event ->
            val isAllowed = allowed.any { PhoneNumbers.sameNumber(it.number, event.number) }
            BlockedCard(
                event = event,
                isAllowed = isAllowed,
                canRestore = setup.defaultSms && event.channel == Channel.SMS && !event.restored && event.body != null,
                onAllow = { number -> io { store.allow(number, null) } },
                onRestore = {
                    io {
                        val restored = SmsRepository.insertIncoming(
                            context, event.number.orEmpty(), event.body.orEmpty(), event.timestamp, event.timestamp, read = true,
                        )
                        if (restored != null) store.markRestored(event.id)
                    }
                },
                onDelete = { io { store.deleteBlocked(event.id) } },
            )
        }
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear blocked list?") },
            text = { Text("Blocked messages that you haven't restored will be deleted for good.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    io { store.clearBlocked() }
                }) { Text("Clear") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun BlockedCard(
    event: BlockedEvent,
    isAllowed: Boolean,
    canRestore: Boolean,
    onAllow: (String) -> Unit,
    onRestore: () -> Unit,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    val number = event.number?.takeUnless { PhoneNumbers.isHidden(it) }
    val kind = when (event.channel) {
        Channel.CALL -> "Call"
        Channel.SMS -> "Message"
        Channel.MMS -> "Picture message"
    }
    Card(Modifier.fillMaxWidth()) {
        Column {
            ListItem(
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                leadingContent = {
                    Icon(if (event.channel == Channel.CALL) Icons.Filled.Call else Icons.Filled.Email, contentDescription = kind)
                },
                headlineContent = { Text(number ?: "Hidden number") },
                supportingContent = {
                    Column {
                        Text("$kind · ${formatTime(context, event.timestamp)}" + if (event.restored) " · restored" else "")
                        event.body?.let { Text(it, maxLines = 4, overflow = TextOverflow.Ellipsis) }
                    }
                },
                trailingContent = {
                    IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = "Delete") }
                },
            )
            Row(Modifier.padding(start = 8.dp, end = 8.dp, bottom = 4.dp)) {
                if (number != null) {
                    TextButton(enabled = !isAllowed, onClick = { onAllow(number) }) {
                        Text(if (isAllowed) "Allowed" else "Always allow")
                    }
                }
                if (canRestore) TextButton(onClick = onRestore) { Text("Move to inbox") }
            }
        }
    }
}
