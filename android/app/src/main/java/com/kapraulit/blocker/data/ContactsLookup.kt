package com.kapraulit.blocker.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract.PhoneLookup

object ContactsLookup {
    fun canRead(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED

    /** The contact's name, "" for a contact without a name, or null if the number is unknown. */
    fun displayName(context: Context, number: String?): String? {
        if (number.isNullOrBlank() || !canRead(context)) return null
        val uri = Uri.withAppendedPath(PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
        return try {
            context.contentResolver.query(uri, arrayOf(PhoneLookup.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) it.getString(0).orEmpty() else null
            }
        } catch (e: RuntimeException) {
            null
        }
    }

    fun isContact(context: Context, number: String?): Boolean = displayName(context, number) != null
}
