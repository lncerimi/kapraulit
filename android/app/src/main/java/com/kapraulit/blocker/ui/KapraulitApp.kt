package com.kapraulit.blocker.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

data class OpenConversation(val address: String, val draft: String = "")

private enum class Tab(val title: String, val label: String, val icon: ImageVector) {
    PROTECTION("Kapraulit", "Protection", Icons.Filled.Lock),
    MESSAGES("Messages", "Messages", Icons.Filled.Email),
    BLOCKED("Blocked", "Blocked", Icons.Filled.Warning),
    ALLOWED("Always allowed", "Allowed", Icons.Filled.CheckCircle),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KapraulitApp(openConversation: OpenConversation?, onOpenConversation: (OpenConversation?) -> Unit) {
    val context = LocalContext.current
    var setupTick by remember { mutableIntStateOf(0) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { setupTick++ }
    val setup = remember(setupTick) { SetupState.read(context) }

    if (openConversation != null) {
        BackHandler { onOpenConversation(null) }
        ConversationScreen(openConversation, setup, onBack = { onOpenConversation(null) })
        return
    }

    var tab by rememberSaveable { mutableStateOf(Tab.PROTECTION) }
    Scaffold(
        topBar = { TopAppBar(title = { Text(tab.title) }) },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = tab == item,
                        onClick = { tab = item },
                        icon = { Icon(item.icon, contentDescription = null) },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        val modifier = Modifier.padding(padding).fillMaxSize()
        when (tab) {
            Tab.PROTECTION -> ProtectionScreen(setup, onSetupChanged = { setupTick++ }, modifier)
            Tab.MESSAGES -> MessagesScreen(setup, onOpen = { onOpenConversation(OpenConversation(it)) }, modifier)
            Tab.BLOCKED -> BlockedScreen(setup, modifier)
            Tab.ALLOWED -> AllowedScreen(modifier)
        }
    }
}
