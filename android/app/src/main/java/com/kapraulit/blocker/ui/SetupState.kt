package com.kapraulit.blocker.ui

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/** Which of the roles and permissions the app needs have been granted. */
data class SetupState(
    val callScreeningAvailable: Boolean,
    val callScreening: Boolean,
    val smsAvailable: Boolean,
    val defaultSms: Boolean,
    val contacts: Boolean,
    val notifications: Boolean,
) {
    val callsProtected: Boolean get() = callScreening && contacts
    val messagesProtected: Boolean get() = defaultSms && contacts

    companion object {
        fun read(context: Context): SetupState {
            val roles = context.getSystemService(RoleManager::class.java)
            fun granted(permission: String) =
                context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
            return SetupState(
                callScreeningAvailable = roles.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING),
                callScreening = roles.isRoleHeld(RoleManager.ROLE_CALL_SCREENING),
                smsAvailable = roles.isRoleAvailable(RoleManager.ROLE_SMS),
                defaultSms = roles.isRoleHeld(RoleManager.ROLE_SMS),
                contacts = granted(Manifest.permission.READ_CONTACTS),
                notifications = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                    granted(Manifest.permission.POST_NOTIFICATIONS),
            )
        }
    }
}
