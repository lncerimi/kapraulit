package com.kapraulit.blocker.ui

import android.app.role.RoleManager
import android.provider.Telephony
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kapraulit.blocker.sms.SmsRepository
import com.kapraulit.blocker.sms.SmsThread
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun MessagesScreen(setup: SetupState, onOpen: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    if (!setup.defaultSms) {
        val roles = remember { context.getSystemService(RoleManager::class.java) }
        val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {}
        EmptyState(
            title = "Make Kapraulit your SMS app",
            message = "To keep messages from strangers out of your inbox, Kapraulit has to receive your texts. " +
                "Your messages from known people show up here as usual.",
            modifier = modifier,
        ) {
            if (setup.smsAvailable) {
                Button(onClick = { launcher.launch(roles.createRequestRoleIntent(RoleManager.ROLE_SMS)) }) {
                    Text("Set as default SMS app")
                }
            }
        }
        return
    }

    val refresh = rememberContentRefresh(Telephony.Sms.CONTENT_URI)
    val threads by produceState(emptyList<SmsThread>(), refresh) {
        value = withContext(Dispatchers.IO) { SmsRepository.threads(context) }
    }
    var composing by rememberSaveable { mutableStateOf(false) }

    Box(modifier) {
        if (threads.isEmpty()) {
            EmptyState("No messages", "Messages from people you know will appear here.")
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 88.dp)) {
                items(threads, key = { it.threadId }) { thread ->
                    ThreadRow(thread, onClick = { onOpen(thread.address) })
                    HorizontalDivider()
                }
            }
        }
        FloatingActionButton(
            onClick = { composing = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "New message")
        }
    }

    if (composing) {
        NumberDialog(
            title = "New message",
            confirmLabel = "Start",
            askLabel = false,
            onDismiss = { composing = false },
            onConfirm = { number, _ ->
                composing = false
                onOpen(number)
            },
        )
    }
}

@Composable
private fun ThreadRow(thread: SmsThread, onClick: () -> Unit) {
    val context = LocalContext.current
    val unread = thread.unread > 0
    val weight = if (unread) FontWeight.Bold else FontWeight.Normal
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        leadingContent = { Icon(Icons.Filled.Person, contentDescription = null) },
        headlineContent = { Text(thread.name ?: thread.address, fontWeight = weight) },
        supportingContent = {
            Text(thread.snippet, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = weight)
        },
        trailingContent = {
            if (unread) Badge { Text(thread.unread.toString()) } else Text(formatTime(context, thread.date))
        },
    )
}
