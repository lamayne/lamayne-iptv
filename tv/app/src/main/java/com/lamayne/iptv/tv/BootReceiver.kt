package com.lamayne.iptv.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.lamayne.iptv.tv.data.SettingsStore

// Opens the app when the TV has just started, if the user asked for it in Settings. Since
// Android 10 a background app may only open a screen when "Display over other apps" is
// allowed for it: without that permission nothing happens.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action

        if (action != Intent.ACTION_BOOT_COMPLETED && action != "android.intent.action.QUICKBOOT_POWERON") return

        if (!SettingsStore(context).launchAtBoot) return

        if (Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(context)) return

        try {
            context.startActivity(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (e: Exception) {
            // the system refused: nothing else can be done
        }
    }
}
