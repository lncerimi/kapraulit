package com.kapraulit.blocker.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.kapraulit.blocker.data.AllowedNumber
import com.kapraulit.blocker.data.BlockerStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Numbers that always get through even though they aren't saved as contacts. */
@Composable
fun AllowedScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val store = BlockerStore.get(context)
    val scope = rememberCoroutineScope()
    val changes by BlockerStore.changes.collectAsState()
    val allowed by produceState(emptyList<AllowedNumber>(), changes) {
        value = withContext(Dispatchers.IO) { store.allowlist() }
    }
    var adding by rememberSaveable { mutableStateOf(false) }

    Box(modifier) {
        if (allowed.isEmpty()) {
            EmptyState(
                "No extra numbers",
                "Your contacts always get through. Add numbers here that you don't want to save as contacts, " +
                    "like a delivery service or your doctor's office.",
            )
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 88.dp)) {
                items(allowed, key = { it.number }) { entry ->
                    ListItem(
                        leadingContent = { Icon(Icons.Filled.Person, contentDescription = null) },
                        headlineContent = { Text(entry.label ?: entry.number) },
                        supportingContent = { if (entry.label != null) Text(entry.number) },
                        trailingContent = {
                            IconButton(onClick = { scope.launch(Dispatchers.IO) { store.disallow(entry.number) } }) {
                                Icon(Icons.Filled.Close, contentDescription = "Remove")
                            }
                        },
                    )
                    HorizontalDivider()
                }
            }
        }
        FloatingActionButton(
            onClick = { adding = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Add number")
        }
    }

    if (adding) {
        NumberDialog(
            title = "Always allow",
            confirmLabel = "Add",
            askLabel = true,
            onDismiss = { adding = false },
            onConfirm = { number, label ->
                adding = false
                scope.launch(Dispatchers.IO) { store.allow(number, label) }
            },
        )
    }
}
