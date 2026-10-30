package com.kapraulit.blocker.ui

import android.provider.Telephony
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.kapraulit.blocker.data.ContactsLookup
import com.kapraulit.blocker.sms.SmsItem
import com.kapraulit.blocker.sms.SmsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(target: OpenConversation, setup: SetupState, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val refresh = rememberContentRefresh(Telephony.Sms.CONTENT_URI)
    val name by produceState<String?>(null, target.address) {
        value = withContext(Dispatchers.IO) { ContactsLookup.displayName(context, target.address)?.ifEmpty { null } }
    }
    val messages by produceState(emptyList<SmsItem>(), target.address, refresh, setup.defaultSms) {
        value = if (setup.defaultSms) {
            withContext(Dispatchers.IO) { SmsRepository.conversation(context, target.address) }
        } else {
            emptyList()
        }
    }
    var draft by rememberSaveable(target) { mutableStateOf(target.draft) }
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.scrollToItem(messages.lastIndex)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(name ?: target.address)
                        if (name != null) Text(target.address, style = MaterialTheme.typography.bodySmall)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = {
            Row(
                modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.weight(1f),
                    enabled = setup.defaultSms,
                    placeholder = { Text(if (setup.defaultSms) "Text message" else "Set Kapraulit as SMS app to send") },
                    maxLines = 5,
                )
                IconButton(
                    enabled = setup.defaultSms && draft.isNotBlank(),
                    onClick = {
                        val text = draft.trim()
                        draft = ""
                        scope.launch(Dispatchers.IO) { SmsRepository.send(context, target.address, text) }
                    },
                ) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                }
            }
        },
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(messages, key = { it.id }) { MessageBubble(it) }
        }
    }
}

@Composable
private fun MessageBubble(message: SmsItem) {
    val context = LocalContext.current
    val colors = MaterialTheme.colorScheme
    val status = when (message.type) {
        Telephony.Sms.MESSAGE_TYPE_OUTBOX, Telephony.Sms.MESSAGE_TYPE_QUEUED -> "Sending…"
        Telephony.Sms.MESSAGE_TYPE_FAILED -> "Not sent"
        else -> formatTime(context, message.date)
    }
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = if (message.incoming) Alignment.CenterStart else Alignment.CenterEnd,
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = if (message.incoming) colors.surfaceVariant else colors.primaryContainer,
            modifier = Modifier.widthIn(max = 300.dp),
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(message.body)
                Text(
                    status,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (message.type == Telephony.Sms.MESSAGE_TYPE_FAILED) colors.error else colors.onSurfaceVariant,
                )
            }
        }
    }
}
